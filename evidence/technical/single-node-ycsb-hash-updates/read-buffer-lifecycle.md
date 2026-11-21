Eligible single-chunk reads explicitly admitted for coalescing join a bounded
in-flight registry on the actual submitting worker. Remote compact reads use
their connection worker; ordinary GET, MGET waves, read-only compact owner
calls and group/page loads use the physical block owner, including after
relocation retry. Staging, chunked assembly and ordinary compact
mutation/maintenance readers bypass the Flight registry. This admission choice
is preserved across buffer waits, owner routing and relocation retry; stored
physical versions are immutable regardless of admission. Group/page snapshot
loads may also serve mutation preparation; those consumers edit owned decoded
or re-encoded outputs, never shared bytes. Exact physical record identity and
population fences determine sharing; workers never share a registry. Remote
compact reads do not add a key-owner hop. The producer owns its pin, DMA
buffer and stable completion object independently of request frames.
Cancellation detaches a waiter without cancelling that producer. Completion
removes the entry before waking consumers, so the registry never caches
completed results. Every consumer validates its own record and population
context before exposing bytes. Admission exhaustion or metadata allocation
failure preserves the exclusive read path.

A result with one remaining consumer retains an exclusive lease and GET adds
bulk framing in that buffer. Multiple consumers receive immutable handles over
the same physical bytes, with separate GET headers and tails. Shared retained
bytes have a worker-local limit that lasts through the final consumer's return,
including socket backpressure. Only the buffer owner changes reference state;
foreign consumers send generation-fenced return tickets to that owner.
An in-transit return retains its consumer reference until the owner handles it.
Slots are reused after their final return, with wrapping 48-bit generations
matched by equality; stale tickets are assumed not to survive a complete
generation cycle of the same slot.
Collection handlers share compact evaluation and reply semantics with owner
reads. Connection-worker compact Hash full projections can encode directly from
the held read lease; other collection paths retain owned results through reply
streaming. Command parsing precedes
consumption of any captured read error. No borrowed index entry survives
suspension.

The index snapshot orders the read before a subsequently admitted writer. The
block pin survives I/O and cancellation cleanup, so writes can append and retire
old live-byte accounting while the read finishes. Defrag closes remote pin
admission before inspecting the count; the last pin on a pending block asks its
owner to reconsider reclamation. Flush uses the same close-before-count order
when retiring a sealed staging buffer: either it releases the buffer immediately
or the last pin notifies the owner to finish the release. Local fallback reads
retain their existing pin rules. Database/replication epoch and population-generation
changes invalidate an in-flight payload read. Worker shutdown drains I/O and
