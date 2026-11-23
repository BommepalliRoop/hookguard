#!/usr/bin/env python3
"""Check local Markdown links without requiring external services or dependencies."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
FENCE = re.compile(r"^\s*(?:`{3,}|~{3,})")


def markdown_without_fences(markdown: str) -> str:
    lines = []
    in_fence = False
    for line in markdown.splitlines():
        if FENCE.match(line):
            in_fence = not in_fence
            continue
        if not in_fence:
            lines.append(line)
    return "\n".join(lines)


def check() -> int:
    errors = []
    count = 0
    for md in sorted(ROOT.rglob("*.md")):
        if any(x in md.parts for x in (".git", "node_modules", "dist")):
            continue
        count += 1
        for match in LINK.finditer(markdown_without_fences(md.read_text(encoding="utf-8"))):
            raw = match.group(1).strip().strip("<>")
            link = raw.split(" \"", 1)[0]
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc or link.startswith(("#", "mailto:")):
                continue
            destination = (md.parent / unquote(parsed.path)).resolve()
            if not destination.is_relative_to(ROOT) or not destination.exists():
                errors.append(f"{md.relative_to(ROOT)} -> missing local link: {link}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    print(f"Checked {count} Markdown files; broken links: {len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(check())
