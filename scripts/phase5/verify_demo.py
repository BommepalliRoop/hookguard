"""Verify both Express modes through the compiled CLI and its reports."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
from queue import Empty, Queue
import re
import shutil
from subprocess import PIPE, Popen, TimeoutExpired, run
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.request import ProxyHandler, build_opener
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "examples/scenarios"
DEMO = ROOT / "examples/express-consumer/dist/start.js"
CLI = ROOT / "packages/cli/dist/index.js"
TIMEOUT_SECONDS = 10
KINDS = ("http_status", "delivery_count", "state_json")


def require(actual, expected, description):
    if actual != expected:
        raise SystemExit(f"{description}: expected {expected!r}, got {actual!r}")


@contextmanager
def listen(mode, environment):
    env = {**environment, "HOOKGUARD_DEMO_MODE": mode, "HOOKGUARD_DEMO_PORT": "0"}
    with Popen(["node", str(DEMO)], env=env, stdout=PIPE, text=True) as server:
        startup = Queue()
        Thread(target=lambda: startup.put(server.stdout.readline()), daemon=True).start()
        try:
            try:
                line = startup.get(timeout=TIMEOUT_SECONDS)
            except Empty:
                raise SystemExit(f"{mode} demo did not start") from None
            match = re.fullmatch(
                rf"Demo consumer \({mode}\) listening on (http://127\.0\.0\.1:\d+)\n",
                line,
            )
            if not match:
                raise SystemExit(f"Unexpected {mode} demo startup output: {line!r}")
            yield match[1]
        finally:
            server.terminate()
            try:
                server.wait(timeout=TIMEOUT_SECONDS)
            except TimeoutExpired:
                server.kill()
                server.wait()


def verify_json(output, passed, detail):
    report = json.loads(output)
    require(report["schemaVersion"], 1, "JSON schema version")
    require(report["name"], "payment-captured-duplicate", "JSON scenario")
    require(report["passed"], passed, "JSON result")
    require(
        [(attempt["sequence"], attempt["status"]) for attempt in report["attempts"]],
        [(1, 200), (2, 200), (3, 200)],
        "JSON delivery attempts",
    )
    require(
        [(assertion["kind"], assertion["passed"]) for assertion in report["assertions"]],
        list(zip(KINDS, (True, True, passed))),
        "JSON assertion outcomes",
    )
    require(report["assertions"][-1]["detail"], detail, "JSON credit evidence")


def verify_junit(output, passed, detail):
    root = ElementTree.fromstring(output)
    counts = {"tests": "3", "failures": "0" if passed else "1"}
    require((root.tag, root.attrib), ("testsuites", counts), "JUnit root")
    require(len(root), 1, "JUnit suite count")
    suite = root[0]
    require(
        (suite.tag, suite.attrib),
        ("testsuite", {"name": "payment-captured-duplicate", **counts}),
        "JUnit suite",
    )
    require(
        [(case.tag, case.attrib) for case in suite],
        [
            ("testcase", {"classname": "hookguard", "name": f"{index}. {kind}"})
            for index, kind in enumerate(KINDS, 1)
        ],
        "JUnit assertion cases",
    )
    failures = [(case.attrib["name"], failure.text) for case in suite for failure in case]
    require(failures, [] if passed else [("3. state_json", detail)], "JUnit failures")
    if not passed:
        require(suite[-1][0].tag, "failure", "JUnit failure tag")


def verify_run(mode, credits, report_format, directory, cli):
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("HOOKGUARD_")
    }
    with listen(mode, environment) as origin:
        config = directory / "duplicate.yaml"
        config.write_text(
            (SCENARIOS / config.name).read_text(encoding="utf-8").replace(
                "http://127.0.0.1:3000", origin
            ),
            encoding="utf-8",
        )
        result = run(
            [
                "node", str(cli), "run", "--config", str(config),
                "--target", origin + "/webhook", "--format", report_format,
            ],
            cwd=directory,
            env=environment,
            capture_output=True,
            encoding="utf-8",
            timeout=TIMEOUT_SECONDS,
            check=False,
        )
        passed = credits == 1
        if result.stderr:
            raise SystemExit(f"{mode} {report_format} CLI stderr: {result.stderr}")
        require(result.returncode, 0 if passed else 1, f"{mode} CLI exit")
        # Connect directly to the ephemeral local server even on proxy-configured hosts.
        with build_opener(ProxyHandler({})).open(
            origin + "/_test/state", timeout=TIMEOUT_SECONDS
        ) as response:
            require(
                json.load(response),
                {"orders": {"order_123": {"creditsApplied": credits}}},
                f"{mode} consumer state",
            )

    detail = f"Expected 1, observed {credits}."
    check = {"json": verify_json, "junit": verify_junit}[report_format]
    check(result.stdout, passed, detail)
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reports", type=Path, help="Directory to save verified reports")
    parser.add_argument("--cli", type=Path, default=CLI, help="Built or installed CLI entry point")
    args = parser.parse_args()
    cli = args.cli.resolve()

    reports = {}
    with TemporaryDirectory(prefix="hookguard-demo-") as temporary:
        directory = Path(temporary)
        fixture = Path("fixtures/payment-captured.json")
        (directory / fixture.parent).mkdir()
        shutil.copyfile(SCENARIOS / fixture, directory / fixture)
        for mode, credits in (("buggy", 3), ("fixed", 1)):
            for report_format, extension in (("json", "json"), ("junit", "xml")):
                reports[f"{mode}.{extension}"] = verify_run(
                    mode, credits, report_format, directory, cli
                )
            print(f"{mode} consumer verified with {credits} credit(s) in JSON and JUnit")

    if args.reports is not None:
        args.reports.mkdir(parents=True, exist_ok=True)
        for name, content in reports.items():
            (args.reports / name).write_bytes(content.encode("utf-8"))


if __name__ == "__main__":
    main()
