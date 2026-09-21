<!--
Copyright (C) 2026 EloqData Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Separate failover intent from live observation

## Status

Accepted

Each Failover Transition has an immutable random identity and a revision used
to reject stale mutations, and it pins the selected Data Node incarnations.
Its progress is derived from committed topology and authority facts plus fresh
observations rather than a committed phase enum. In particular, a controlled
source's paused frontier remains a live observation: if that source incarnation
cannot report after Meta Leader replacement, the controlled attempt fails
instead of preserving a durable source-proof lifecycle. An operator-triggered
transition references its durable Operation, but execution state is not copied
into the Operation journal.
