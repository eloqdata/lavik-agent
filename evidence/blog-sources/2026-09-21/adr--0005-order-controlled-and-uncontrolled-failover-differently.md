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

# Order controlled and uncontrolled failover differently

## Status

Accepted

A Controlled Failover keeps the Source Owner's committed authority in place
behind a reversible write pause while the Candidate catches up and completes
Promotion Preparation; only then does one Cutover advance the term and install
the new authority. An Uncontrolled Failover instead advances the term and
fences the unavailable Owner when its transition begins, then may replace
Candidates within that same term. This asymmetry preserves the original Owner
when planned maintenance fails while preventing a failed Owner from regaining
authority during automatic recovery.

The Uncontrolled fence does not intentionally terminate the former Owner's
already established, authenticated downstream replication exports; their
remaining data is useful on a best-effort basis and cannot restore write
authority. Natural flow loss does not create a recovery obligation. If the
former Owner later applies the target-term fence and can produce an ordinary
Ready population proof for its current incarnation and history, it may compete
as a Candidate, including for a Cutover that keeps the same topology node. It
receives authority only through a fresh Candidate Action, Promotion
Preparation, and Cutover; recovery never directly reinstates its excluded
grant.
