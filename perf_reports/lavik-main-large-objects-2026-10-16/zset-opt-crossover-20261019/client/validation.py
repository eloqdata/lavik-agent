"""Small shared runtime/offline checks, with no I/O side effects."""


def info(snapshot, section):
    raw = snapshot['info'][section]
    if snapshot.get('info_' + section, raw) != raw:
        raise ValueError('INFO aliases differ')
    return dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)


def transaction_delta(before, after, size, phase):
    first, last = info(before, 'stats'), info(after, 'stats')
    if not all(first[k] == last[k] == '0' for k in ('tx_commit_queue_depth', 'storage_tx_commits_pending')):
        raise ValueError('Transaction endpoints are not drained')
    keys = ('tx_commit_batches', 'tx_commit_batch_transactions', 'tx_commit_input_fences',
            'tx_commit_merged_fences', 'tx_commit_backpressure_waits', 'tx_cleaner_rounds',
            'tx_cleaner_retired_blocks')
    delta = {k: int(last[k]) - int(first[k]) for k in keys}
    if min(delta.values()) < 0 or (size == 'compact' and delta['tx_commit_batch_transactions'] != 0):
        raise ValueError('Unexpected compact transaction count or decreased counter')
    if size == 'grouped' and phase != 'load' and delta['tx_commit_batch_transactions'] <= 0:
        raise ValueError('Grouped mutation did not produce a transaction')
    return {'delta': delta, 'compact_zero_required': size == 'compact', 'endpoints_drained': True}
