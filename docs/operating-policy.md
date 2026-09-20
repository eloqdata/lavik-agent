# Operating policy · 0.1.0

The machine-readable defaults are in `policies/operating-policy.json`. The runtime
enforces its publishing switch, enabled website destination and attempt/turn limits.
Other accuracy constraints are encoded in schemas, the gate and role instructions.
Changing policy does not grant a model new credentials or execution capabilities.

## Publishing

The default workflow automatically publishes a paired English/Chinese blog campaign
to the local content repository after execution checks and independent review pass.
Production deployment follows validated CI when the Cloudflare connection is configured.
There is no mandatory per-post human approval. The only initial destination is the
owned website; social channels require their own actual account integrations.

Admin-assigned manual/blog work currently produces private drafts and independent
reviews. Its publication adapter is not connected yet; this technical boundary adds
no per-post approval requirement to the agreed automatic publishing policy. Feedback
guides a linked revision, and does not silently change global policy or tool access.

Writer and reviewer outputs are untrusted. The application creates review/evidence
bindings, derives destination paths, and checks the final artifact before writing.
The reviewer must actually retrieve every cited source through its read tool; a
self-reported checklist is insufficient. Pattern checks are regression detectors,
not a complete factuality proof.

## Product truth

- Preserve the beta status and release/commit identity.
- Do not invent customers, customer stories, users, installations or production SLAs.
- Attribute benchmarks to their tested code, workload, hardware and settings.
- Preserve durability, compatibility and experimental-backend limitations.
- Distinguish real execution from intended or expected outputs.
- A graceful restart is not a crash, power-loss, HA, or throughput test.

## Derived claims

Reason from the available reports before escalating. Calculations and clearly labeled
conditional estimates can publish automatically. State whether a price is sourced,
historical, or an illustrative assumption, and expose the formula. Never treat a
component-price ratio as complete TCO or a throughput measurement as a universal SLA.
If a broad claim is unsupported, derive and publish the narrower useful conclusion
with its assumptions rather than asking the owner to approve unsupported wording.

## Execution and exceptions

The writer may select a registered command recipe. New commands/harness behavior are
reviewed repository code. The current verifier never runs arbitrary generated shell.
Its runtime has no network, no host mounts and no publisher credentials. The Docker
seccomp exception exists specifically for audited io_uring execution, so this runner
must not be generalized into an unrestricted code tool.

Missing sources, failed examples, conflicting content revisions, provider failures,
or exhausted revision budgets produce a persisted exception. They never manufacture
success. Already completed campaigns retain their records; a model failure does not
take down the public site. Change a brief/policy/model under a new campaign ID so prior
decisions remain inspectable. If a process dies holding a filesystem lock, check that
it has stopped before removing the corresponding `.lock` file.

Future promotion of autonomy should depend on measured error/correction rates. Model
or skill upgrades run against preserved scenarios, use limited trials, and retain a
rollback path. Credential changes, new external actions and spending capabilities
remain explicit application configuration.
