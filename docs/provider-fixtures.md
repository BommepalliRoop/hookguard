# Provider fixture guide

Start with the [synthetic payment fixture](../examples/scenarios/fixtures/payment-captured.json). Put a new fixture in the scenario directory and reference its relative path. Give each logical event a synthetic ID and set `fixture.eventIdPath` to the matching JSONPath. Duplicate deliveries reuse the same ID and exact wire bytes.

Model the receiver behavior you need to prove. Assert both the delivery outcome and the observable business effect. The [duplicate scenario](../examples/scenarios/duplicate.yaml) expects three attempts and a single applied credit. A provider-specific fixture can preserve an envelope and event shape while replacing all customer identifiers, credentials, and payment details with synthetic values.

The [security model](security-model.md) describes the local target and signature contract. HookGuard's demo HMAC format is for the local test receiver. A provider's signature protocol can have different headers, canonicalization, or timestamp rules.
