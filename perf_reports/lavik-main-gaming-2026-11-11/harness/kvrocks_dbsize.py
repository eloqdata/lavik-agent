import re, time

def refresh_dbsize(r):
    # Kvrocks 2.17.0 DBSIZE reads a scan cache. A completed metadata scan
    # counts unexpired keys separately from expired metadata, unlike Redis's
    # dictionary cardinality. Only call outside every measured window.
    def stamp(info):
        match = re.search(r'^last_dbsize_scan_timestamp:(\d+)',info,re.M)
        assert match, info
        return int(match.group(1))
    before = r.call('INFO','keyspace').decode()
    old = stamp(before)
    started = time.time()
    # Scan timestamps have one-second resolution. Ensure a new completion
    # cannot be mistaken for the previous scan completed in the same second.
    while int(r.call('TIME')[0]) <= old:
        assert time.time()-started < 5
        time.sleep(.05)
    assert r.call('DBSIZE','SCAN') == b'OK'
    while True:
        after = r.call('INFO','keyspace').decode()
        if stamp(after) > old: break
        assert time.time()-started < 300, 'Kvrocks DBSIZE scan timeout'
        time.sleep(.1)
    return {'keys':r.call('DBSIZE'), 'started_at':started, 'ended_at':time.time(),
            'before':before, 'after':after,
            'semantics':'unexpired metadata keys; expired metadata counted separately in INFO keyspace'}
