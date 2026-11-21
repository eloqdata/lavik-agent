Whole-Hash replacement (`LAVIK.HREPLACE`) checks existing key/type/expiry and
the preceding grouped decision, but does not load old field payloads. Its
after-image comes entirely from admitted request data. A large replacement
publishes a fresh incarnation through the grouped command decision; a small
replacement may demote to a compact record. The append funnel retires the old
graph after publication while preserving transaction/snapshot ownership. This
does not change the durable format or the incremental HSET/HMSET path.
