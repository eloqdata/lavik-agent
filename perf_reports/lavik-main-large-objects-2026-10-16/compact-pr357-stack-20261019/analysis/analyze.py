#!/usr/bin/env python3
"""Validate the Lavik stack 8 KiB experiment offline; never runs a benchmark.

--partial accepts a completed prefix of the fixed 14-point sequence. Incomplete
points remain pending, and any failed validation prevents output publication.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path

NET_FIELDS = 'rx_bytes rx_packets rx_errors rx_dropped rx_fifo rx_frame rx_compressed rx_multicast tx_bytes tx_packets tx_errors tx_dropped tx_fifo tx_collisions tx_carrier tx_compressed'.split()

def jload(path):
    return json.loads(Path(path).read_text())

def jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]

def network(raw):
    out={}
    for line in (raw or '').splitlines():
        if ':' not in line:continue
        nic,values=line.split(':',1);v=values.split()
        if len(v)>=16:out[nic.strip()]=dict(zip(NET_FIELDS,map(int,v[:16])))
    return out

def cpu_state(raw):
    line=next((l for l in (raw or '').splitlines()if l.startswith('cpu ')),None)
    if line is None:return None
    return dict(zip('user nice system idle iowait irq softirq steal guest guest_nice'.split(),map(int,line.split()[1:])))

def process_fields(sample):
    if 'process_stat_fields' in sample:return sample['process_stat_fields']
    raise ValueError('monitor sample has no process_stat_fields')

def monitor(path,nic):
    if not path.exists():return {'available':False,'valid':False,'reason':'missing_monitor','path':str(path)}
    rows=jsonl(path);metas=[r for r in rows if r.get('event')=='metadata'];summaries=[r for r in rows if r.get('event')=='summary'];samples=[r for r in rows if r.get('event')=='sample']
    errors=[]
    if not metas or len(samples)<2:return {'available':True,'valid':False,'reason':'missing_metadata_or_samples','path':str(path)}
    completed=bool(summaries and summaries[-1].get('completed'))
    if not completed:errors.append('monitor_not_completed')
    hz=metas[0]['clock_ticks_per_second'];a,b=samples[0],samples[-1];dt=(b['monotonic_ns']-a['monotonic_ns'])/1e9
    if dt<=0 or hz<=0:return {'available':True,'valid':False,'reason':'invalid_time_or_HZ','path':str(path)}
    pa,pb=process_fields(a),process_fields(b)
    if pa['start_ticks']!=pb['start_ticks']or a['pid']!=b['pid']:errors.append('process_identity_changed')
    user=(pb['utime_ticks']-pa['utime_ticks'])/hz;system=(pb['stime_ticks']-pa['stime_ticks'])/hz
    if min(user,system)<0:errors.append('process_cpu_counter_decreased')
    ta={t['tid']:t for t in a['tasks']if 'stat_fields'in t};tb={t['tid']:t for t in b['tasks']if 'stat_fields'in t};threads=[]
    for tid in sorted(ta.keys()&tb.keys()):
        x,y=ta[tid]['stat_fields'],tb[tid]['stat_fields']
        if x['start_ticks']!=y['start_ticks']:errors.append(f'thread_identity_changed:{tid}');continue
        u=(y['utime_ticks']-x['utime_ticks'])/hz;s=(y['stime_ticks']-x['stime_ticks'])/hz
        if min(u,s)<0:errors.append(f'thread_cpu_counter_decreased:{tid}');continue
        cpus=sorted({t['stat_fields']['processor']for row in samples for t in row['tasks']if t['tid']==tid and t.get('stat_fields',{}).get('processor') is not None})
        threads.append({'tid':tid,'comm':tb[tid].get('comm',y.get('comm')),'cpus_seen':cpus,'user_seconds':u,'system_seconds':s,'cpu_seconds':u+s,'cpu_fraction':(u+s)/dt,'cpu_percent':100*(u+s)/dt})
    threads.sort(key=lambda r:-r['cpu_seconds'])
    na,nb=network(a.get('netdev')),network(b.get('netdev'));nics={}
    for name in sorted(na.keys()&nb.keys()):
        delta={field:nb[name][field]-na[name][field]for field in NET_FIELDS}
        if any(x<0 for x in delta.values()):nics[name]={'valid':False,'reason':'counter_decreased'};continue
        nics[name]={'valid':True,'rx_mbps':delta['rx_bytes']*8/dt/1e6,'tx_mbps':delta['tx_bytes']*8/dt/1e6,'counter_delta':delta}
    if nic not in nics or not nics[nic].get('valid'):errors.append(f'selected_nic_unavailable:{nic}')
    ca,cb=cpu_state(a.get('procstat')),cpu_state(b.get('procstat'));host={}
    if ca and cb:
        delta={k:cb[k]-ca[k]for k in list(ca)[:8]};total=sum(delta.values())
        if total>0 and min(delta.values())>=0:host={'counter_delta':delta,'percent':{k:v*100/total for k,v in delta.items()}}
    return {'available':True,'valid':not errors,'path':str(path),'completed':completed,'errors':errors,
            'pid':a['pid'],'start_ticks':pa['start_ticks'],'first_sample_time':a['time'],'last_sample_time':b['time'],'elapsed_seconds':dt,'sample_count':len(samples),'HZ':hz,
            'user_seconds':user,'system_seconds':system,'cpu_seconds':user+system,'cpu_cores':(user+system)/dt,
            'thread_cpu_cores_sum':sum(t['cpu_fraction']for t in threads),'threads':threads,
            'selected_nic':nic,'selected_nic_rates':nics.get(nic),'interfaces':nics,'host_cpu':host,
            'read_error_samples':sum(bool(row.get('read_errors'))for row in samples)}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def marker(path):
    if not path.is_file():
        raise FileNotFoundError(path)


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def snmp_tcp(raw):
    lines = (raw or '').splitlines()
    for index in range(len(lines) - 1):
        header, values = lines[index].split(), lines[index + 1].split()
        if header and values and header[0] == values[0] == 'Tcp:' and 'RetransSegs' in header:
            require(len(header) == len(values), 'TCP SNMP field count mismatch')
            return {key: int(value) for key, value in zip(header[1:], values[1:])}
    raise ValueError('TCP RetransSegs missing from monitor SNMP sample')


def observation(root, side, label, identity, timing):
    directory = root / side / 'observations' / label
    marker(directory / 'COMPLETE')
    recorded = jload(directory / 'identity.json')
    require(recorded['pid'] == identity['pid'] and
            str(recorded['start_ticks']) == str(identity['start_ticks']) and
            recorded['exe'] == identity['binary'] and
            recorded['seconds'] == 45 and recorded['profile'] is False,
            f'{label}/{side}: observer identity or mode mismatch')
    codes = jload(directory / 'exit-status.json')
    require(codes and all(code == 0 for code in codes), f'{label}/{side}: observer failed')
    path = directory / 'monitor.jsonl'
    measured = monitor(path, 'eth1' if side == 'server' else 'eth0')
    require(measured['valid'] and measured['read_error_samples'] == 0,
            f'{label}/{side}: invalid monitor: {measured}')
    require(measured['pid'] == identity['pid'] and
            str(measured['start_ticks']) == str(identity['start_ticks']),
            f'{label}/{side}: monitor identity mismatch')
    rows = jsonl(path)
    samples = [row for row in rows if row.get('event') == 'sample']
    require(all(row['pid'] == identity['pid'] and
                str(row['process_stat_fields']['start_ticks']) == str(identity['start_ticks'])
                for row in samples), f'{label}/{side}: process changed within observation')
    require(44 <= measured['elapsed_seconds'] <= 55,
            f'{label}/{side}: unexpected monitor duration')
    require(timing['start'] <= samples[0]['time'] < samples[-1]['time'] <= timing['end'],
            f'{label}/{side}: monitor outside execution window')
    first, last = snmp_tcp(samples[0].get('snmp')), snmp_tcp(samples[-1].get('snmp'))
    retrans = last['RetransSegs'] - first['RetransSegs']
    outgoing = last['OutSegs'] - first['OutSegs']
    require(retrans >= 0 and outgoing >= 0, f'{label}/{side}: TCP counter decreased')
    measured['tcp'] = {
        'scope': 'host-wide TCP, first-to-last monitor sample',
        'retrans_segments_delta': retrans,
        'retrans_segments_per_second': retrans / measured['elapsed_seconds'],
        'out_segments_delta': outgoing,
        'retrans_to_out_segments_percent': 100 * retrans / outgoing if outgoing else None,
    }
    return measured


def metric(value, elapsed, context):
    require(set(METRIC_KEYS) <= set(value), f'{context}: missing metric fields')
    require(type(value['count']) is int and value['count'] > 0,
            f'{context}: invalid completed count')
    for key in METRIC_KEYS:
        require(type(value[key]) in (int, float) and math.isfinite(value[key]) and value[key] >= 0,
                f'{context}: invalid {key}')
    # The client prints elapsed seconds and QPS with six decimal places.
    # Compare their rounding intervals rather than a fixed relative tolerance:
    # a short load can have a larger relative elapsed-rounding error.
    from decimal import Decimal, localcontext
    with localcontext() as precision:
        precision.prec = 50
        half_unit = Decimal('0.0000005')
        reported_time = Decimal(str(elapsed))
        reported_qps = Decimal(str(value['qps']))
        count = Decimal(value['count'])
        require(reported_time > 0 and reported_qps > 0,
                f'{context}: invalid rounded elapsed/QPS')
        minimum = max(Decimal(0), reported_time - half_unit) * max(Decimal(0), reported_qps - half_unit)
        maximum = (reported_time + half_unit) * (reported_qps + half_unit)
        require(minimum <= count <= maximum,
                f'{context}: QPS does not match count/elapsed rounding intervals')
    require(value['p50_ms'] <= value['p99_ms'] <= value['p999_ms'] <= value['max_ms'] and
            value['avg_ms'] <= value['max_ms'], f'{context}: invalid latency ordering')
    return {key: value[key] for key in METRIC_KEYS}


NAME = 'compact-pr357-stack-20261019'
CROOT, SROOT = '/opt/benchmark/' + NAME, '/mnt/dev/benchmark/' + NAME
KEYS, CONNECTIONS = 8192, 80
PRODUCTS = ('lavik',)
OPS = ('hgetall', 'hkeys', 'hvals', 'smembers', 'lrange', 'zrange', 'set',
       'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')
READS, PAIRED, STATEFUL = frozenset(OPS[:6]), {'list', 'zswap', 'sswap'}, {'zswap', 'sswap'}
SEQUENCE = tuple((p, op) for p in PRODUCTS for op in OPS)
METRICS = {'hgetall': ('HGETALL',), 'hkeys': ('HKEYS',), 'hvals': ('HVALS',),
           'smembers': ('SMEMBERS',), 'lrange': ('LRANGE',), 'zrange': ('ZRANGE_WITHSCORES',),
           'set': ('SET',), 'setrange': ('SETRANGE',), 'hash': ('HSET',),
           'list': ('LPUSH', 'RPOP'), 'zincr': ('ZINCRBY',), 'zswap': ('ZREM', 'ZADD'),
           'stream': ('XADD_MAXLEN',), 'sswap': ('SADD', 'SREM')}
LOAD_COMMANDS = dict(zip(OPS, ('HSET', 'HSET', 'HSET', 'SADD', 'RPUSH', 'ZADD',
                              'SET', 'SET', 'HSET', 'RPUSH', 'ZADD', 'ZADD', 'XADD', 'SADD')))
METRIC_KEYS = ('count', 'qps', 'avg_ms', 'p50_ms', 'p99_ms', 'p999_ms', 'max_ms')
SEEDS = {'load': 101, 'validate': 101, 'warm': 10180, 'run': 20180}
SECONDS = {'load': 1, 'validate': 1, 'warm': 90, 'run': 60}
CLIENT_NAMES = {'bench', 'bench_sswap', 'bench_hash', 'bench_lrange', 'bench_workdist'}
ORIGINAL_CLIENT_ROOT = '/opt/benchmark/objects8k-fourdb-20261019'


def shape(op):
    kind = ('string' if op in ('set', 'setrange') else
            'hash' if op in ('hash', 'hgetall', 'hkeys', 'hvals') else
            'list' if op in ('list', 'lrange') else
            'zset' if op in ('zincr', 'zswap', 'zrange') else
            'set' if op in ('sswap', 'smembers') else 'stream')
    count = 1 if kind == 'string' else 256 if kind in ('set', 'zset') else 32
    return {'structure': kind, 'logical_payload_bytes': 8192,
            'items_per_key': count, 'item_bytes': 8192 // count}


def binary_name(op):
    return ('bench_hash' if op in ('hgetall', 'hkeys', 'hvals') else
            'bench_lrange' if op == 'lrange' else
            'bench_workdist' if op in ('smembers', 'zrange') else
            'bench_sswap' if op == 'sswap' else 'bench')


def load_count(op):
    return KEYS * (32 if op == 'stream' else 2 if shape(op)['structure'] in ('set', 'zset') else 1)


def options(args):
    require(isinstance(args, list) and len(args) % 2 == 1 and
            len(set(args[1::2])) == len(args[1::2]), 'Malformed/duplicate client options')
    return dict(zip(args[1::2], args[2::2]))


def check_command(args, op, phase, relative, state=None):
    expected = {'--host': '10.84.1.4', '--port': '6379',
                '--op': 'hgetall' if phase == 'load' and op in ('hkeys', 'hvals') else op,
                '--phase': phase, '--prefix': 'objects8k:' + op, '--keys': '8192',
                '--connections': '1' if phase == 'validate' else '80',
                '--threads': '1' if phase == 'validate' else '16',
                '--seconds': str(SECONDS[phase]), '--seed': str(SEEDS[phase]),
                '--out': CROOT + '/' + relative + '/result.json'}
    if op in READS:
        expected['--load-seed'] = '101'
    if state is not None:
        expected['--state'] = state
    require(args[0] == ORIGINAL_CLIENT_ROOT + '/clients/' + binary_name(op) and options(args) == expected,
            relative + ': exact command/seed mismatch')


def check_raw(raw, op, phase, context):
    fields = {'op': 'hgetall' if phase == 'load' and op in ('hkeys', 'hvals') else op,
              'phase': phase, 'keys': KEYS, 'prefix': 'objects8k:' + op,
              'connections': 1 if phase == 'validate' else 80,
              'threads': 1 if phase == 'validate' else 16,
              'seed': SEEDS[phase], 'pipeline': 1, 'errors': 0,
              'test_mode': False, 'interrupted': False, 'data_shape': shape(op)}
    require(all(raw.get(k) == v for k, v in fields.items()), context + ': result identity/shape/errors')
    require(raw['test_mode'] is False and raw['interrupted'] is False, context + ': non-formal result')
    # bench_hash emits load_seed; bench_lrange/bench_workdist consume the same
    # pinned --load-seed option but do not repeat it in their JSON metadata.
    # check_command validates that option for every read and every phase.
    if op in ('hgetall', 'hkeys', 'hvals') or 'load_seed' in raw:
        require(raw.get('load_seed') == 101, context + ': read load seed mismatch')
    if op in ('hgetall', 'hkeys', 'hvals'):
        require(raw.get('fields_per_key') == 32 and raw.get('value_bytes') == 256,
                context + ': Hash dimensions mismatch')
    elapsed = raw['elapsed_seconds']
    require(isinstance(elapsed, (int, float)) and math.isfinite(elapsed) and elapsed > 0,
            context + ': invalid duration')
    metrics = {key: metric(value, elapsed, context + '/' + key) for key, value in raw['metrics'].items()}
    expected = {'LOAD'} if phase == 'load' else {'OPERATIONS', *METRICS[op]}
    require(set(metrics) == expected, context + ': metric command set mismatch')
    if phase == 'load':
        require(metrics['LOAD']['count'] == load_count(op), context + ': incomplete loader acknowledgements')
    else:
        count = metrics['OPERATIONS']['count']
        require(all(m['count'] == count for m in metrics.values()), context + ': incomplete command/pair counts')
        if phase == 'validate':
            require(count == 3 and raw.get('validation_keys') == [0, 4096, 8191], context + ': sample keys/count')
        else:
            require(SECONDS[phase] <= elapsed <= SECONDS[phase] + 240, context + ': incomplete timed run')
            buckets = raw['operations_per_second']
            require(len(buckets) == SECONDS[phase] and all(type(n) is int and n >= 0 for n in buckets)
                    and sum(buckets) <= count, context + ': invalid per-second counts')
    return metrics


def parse_info(snapshot, section):
    raw = snapshot['info'][section]
    require(snapshot.get('info_' + section, raw) == raw, 'Snapshot info aliases disagree')
    return dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)


def command_calls(snapshot, command):
    raw = parse_info(snapshot, 'commandstats').get('cmdstat_' + command.lower(), 'calls=0')
    return int(dict(item.strip().split('=', 1) for item in raw.split(',') if '=' in item)['calls'])


def check_command_errors(before, after, commands):
    for command in commands:
        values = []
        for snapshot in (before, after):
            raw = parse_info(snapshot, 'commandstats').get('cmdstat_' + command.lower(), '')
            values.append(dict(item.strip().split('=', 1) for item in raw.split(',') if '=' in item))
        for key in ('failed_calls', 'rejected_calls'):
            require(int(values[1].get(key, '0')) - int(values[0].get(key, '0')) == 0,
                    command + ': server reported ' + key)


def transactions(before, after, product, op, expected_commands):
    if product != 'lavik':
        return None
    first, last = (parse_info(s, 'stats') for s in (before, after))
    endpoints = ('tx_commit_queue_depth', 'storage_tx_commits_pending')
    require(all(first.get(k) == last.get(k) == '0' for k in endpoints), 'Transaction endpoints not drained')
    keys = ('tx_commit_batches', 'tx_commit_batch_transactions', 'tx_commit_input_fences',
            'tx_commit_merged_fences', 'tx_commit_backpressure_waits',
            'tx_cleaner_rounds', 'tx_cleaner_retired_blocks')
    delta = {k: int(last[k]) - int(first[k]) for k in keys}
    require(all(v >= 0 for v in delta.values()), 'Transaction counters decreased')
    observed = delta['tx_commit_batch_transactions']
    if op in ('zincr', 'zswap', 'zrange'):
        require(observed == 0, '8 KiB ZSet unexpectedly admitted grouped transactions')
    return {'delta': delta, 'checked_command_count': expected_commands,
            'zero_grouped_tx_required': op in ('zincr', 'zswap', 'zrange'),
            'transactions_per_batch': observed / delta['tx_commit_batches'] if delta['tx_commit_batches'] else None,
            'endpoints': {k: [int(first[k]), int(last[k])] for k in endpoints},
            'note': 'Diagnostic for other structures; no global zero-transaction assumption.'}


def check_configuration(snapshot, product):
    expected = {'lavik': {'defrag-paused': 'no'},
                'redis': {'save': '', 'appendonly': 'no', 'io-threads': '16', 'daemonize': 'no'},
                'valkey': {'save': '', 'appendonly': 'no', 'io-threads': '8', 'daemonize': 'no'},
                'kvrocks': {'workers': '16', 'rocksdb.disable_auto_compactions': 'no',
                            'daemonize': 'no', 'rocksdb.write_options.disable_wal': 'yes'}}[product]
    require(set(snapshot['config']) == set(expected), 'Configuration keys differ')
    for key, wanted in expected.items():
        acceptable = {'no', 'false', '0'} if wanted == 'no' else {'yes', 'true', '1'} if wanted == 'yes' else {wanted}
        require(snapshot['config'][key] in acceptable, 'Unexpected config ' + key)
    if product == 'lavik':
        require(snapshot.get('defrag_paused') == 'no' and snapshot.get('transaction_drain_confirmed') is True,
                'Lavik defrag/drain receipt mismatch')


def check_phase(root, product, op, phase, active, clients):
    label = product + '-' + op + '-' + ('c80' if phase == 'run' else phase)
    relative = 'results/' + label
    directory = root / 'client' / relative
    marker(directory / 'COMPLETE')
    raw, case, args = (jload(directory / name) for name in ('result.json', 'case.json', 'command.json'))
    state = CROOT + '/states/' + product + '-' + op + '.bin' if op in STATEFUL else None
    check_command(args, op, phase, relative, state)
    metrics = check_raw(raw, op, phase, label)
    fields = {'label': label, 'product': product, 'op': op, 'phase': phase, 'keys': KEYS,
              'connections': 80, 'client_threads': 16, 'seconds': SECONDS[phase], 'shape': shape(op),
              'pipeline': 1, 'revision': active['revision'], 'binary_sha256': active['binary_sha256'],
              'active': active, 'profiled': False, 'observed': phase == 'run',
              'observation_seconds': 45 if phase == 'run' else 0, 'state_path': state,
              'client_binary_sha256': clients['clients'][binary_name(op)]['binary_sha256']}
    require(all(case.get(k) == v for k, v in fields.items()), label + ': case identity mismatch')
    before, after = (jload(directory / ('server-' + when + '.json')) for when in ('before', 'after'))
    for when, snapshot in (('before', before), ('after', after)):
        require(snapshot == jload(root / 'server/snapshots' / (label + '-' + when + '.json')),
                label + ': server/client snapshot copies differ')
        require(snapshot['active'] == active, label + ': active identity changed')
        check_configuration(snapshot, product)
    expected = {LOAD_COMMANDS[op]: metrics['LOAD']['count']} if phase == 'load' else {
        command.split('_', 1)[0]: metrics[command]['count'] for command in METRICS[op]}
    observed = {command: command_calls(after, command) - command_calls(before, command) for command in expected}
    require(expected == observed, label + ': commandstats/replies mismatch')
    check_command_errors(before, after, expected)
    require(jload(directory / 'command-counts.json') == {'expected': expected, 'observed': observed, 'matched': True},
            label + ': command-count receipt mismatch')
    timing = jload(directory / 'timing.json')
    require(before['time'] <= timing['start'] < after['time'] <= timing['end'] and
            raw['elapsed_seconds'] <= timing['end'] - timing['start'] + .001,
            label + ': invalid phase chronology')
    for when in ('before', 'after'):
        local = jload(directory / ('client-' + when + '.json'))
        require(isinstance(local['stat'], str) and isinstance(local['net/dev'], str), label + ': client snapshot missing')
    distribution_path = directory / 'result.json.workdist.json'
    if distribution_path.exists():
        distribution = jload(distribution_path)
        count = metrics['LOAD' if phase == 'load' else 'OPERATIONS']['count']
        require(distribution['completed'] == count and distribution['seed'] == SEEDS[phase], label + ': work distribution count')
        require(sum(row['completed'] for row in distribution['connections']) == count and
                sum(row['completed'] for row in distribution['threads']) == count, label + ': work distribution totals')
    result = {'label': label, 'metrics': metrics, 'elapsed_seconds': raw['elapsed_seconds'],
              'timing': timing, 'source_sha256': sha(directory / 'result.json'),
              'command_counts': expected,
              'transactions': transactions(before, after, product, op, sum(expected.values()))}
    if phase == 'run':
        identity = jload(directory / 'client-identity.json')
        require(identity['binary'] == args[0] and identity['binary_sha256'] == case['client_binary_sha256'],
                label + ': client identity binary mismatch')
        result['observations'] = {side: observation(root, side, label, item, timing)
                                  for side, item in (('server', active), ('client', identity))}
    return result


def valid_sha(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None


def state_data(path):
    data = path.read_bytes()
    require(len(data) == 8 + 1280 * KEYS and struct.unpack('<ii', data[:8]) == (1280, KEYS),
            str(path) + ': invalid pair-state dimensions')
    require(all(v in (0, 1) for v in data[8:]) and not any(data[8 + CONNECTIONS * KEYS:]),
            str(path) + ': invalid pair-state flags/inactive slots')
    return data


def state_transition(before, after, count, load=False):
    require(len(before) == len(after), 'Pair-state lengths differ')
    changed = sum(a != b for a, b in zip(before[8:], after[8:]))
    require((not load or before == after) and changed <= count and changed % 2 == count % 2,
            'Pair-state changed flags/count parity mismatch')
    return changed


def check_states(root, product, op, phases):
    if op not in STATEFUL:
        for phase in phases:
            directory = root / 'client/results' / phase['label']
            require(not any(directory.glob('state-*')), phase['label'] + ': unexpected pair state')
        return None
    previous = None
    digests = {}
    for phase, name in zip(phases, ('load', 'warm', 'run')):
        directory = root / 'client/results' / phase['label']
        before, after = (state_data(directory / ('state-' + when + '.bin')) for when in ('before', 'after'))
        require(previous == before if previous is not None else not any(before[8:]),
                phase['label'] + ': pair-state continuity/initial flags mismatch')
        count = 0 if name == 'load' else phase['metrics']['OPERATIONS']['count']
        changed = state_transition(before, after, count, name == 'load')
        manifest = jload(directory / 'state-manifest.json')
        expected = {'path': CROOT + '/states/' + product + '-' + op + '.bin', 'changed_flags': changed,
                    **{when: {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}
                       for when, data in (('before', before), ('after', after))}}
        require(manifest == expected, phase['label'] + ': pair-state receipt mismatch')
        digests[name] = manifest['after']['sha256']
        previous = after
    require(state_data(root / 'client/states' / (product + '-' + op + '.bin')) == previous,
            product + '/' + op + ': final pair-state differs')
    return {'sha256_after_phase': digests, 'active_slots': 80, 'slots': 1280, 'keys': KEYS,
            'continuity_verified': True, 'parity_verified': True}


def check_samples(root, product, op, states):
    evidence = []
    for when, phase in (('loaded', 'load'), ('before', 'warm'), ('after', 'run')):
        relative = 'validations/' + product + '-' + op + '-' + when
        directory = root / 'client' / relative
        if op in READS:
            marker(directory / 'COMPLETE')
            check_command(jload(directory / 'command.json'), op, 'validate', relative)
            check_raw(jload(directory / 'result.json'), op, 'validate', relative)
            evidence.append({'path': 'client/' + relative + '/result.json',
                             'sha256': sha(directory / 'result.json')})
        else:
            path = directory.with_suffix('.json')
            values = jload(path)
            expected = {'objects8k:' + op + ':' + str(key) for key in (0, 4096, 8191)}
            require(set(values) == expected, relative + ': bounded sample keys mismatch')
            state_sha = states['sha256_after_phase'][phase] if states else None
            for value in values.values():
                require(value.get('size') == (8192 if shape(op)['structure'] == 'string' else shape(op)['items_per_key'])
                        and value.get('shape_verified') is True and valid_sha(value.get('payload_sha256'))
                        and value.get('state_sha256') == state_sha, relative + ': invalid bounded sample')
            evidence.append({'path': str(path.relative_to(root)), 'sha256': sha(path)})
    return evidence


def check_lifecycle(root, product, op, family, variants, previous_lavik_stop=None):
    label = 'session-' + product + '-' + op
    directory = root / 'server' / label
    active = family['active']
    require(family.get('state') == 'complete' and family.get('product') == product and family.get('op') == op
            and family.get('server_session') == label and re.fullmatch('[0-9a-f]{32}', family['owner_token']),
            label + ': invalid completed family identity')
    expected = {'root': SROOT, 'product': product, 'label': label,
                'owner_token': family['owner_token'], 'cpu_affinity': list(range(16)), **variants[product]}
    require(all(active.get(k) == v for k, v in expected.items()), label + ': service identity/provenance mismatch')
    require(type(active['pid']) is int and active['pid'] > 0 and str(active['start_ticks']).isdecimal()
            and active['args'][0] == active['binary'], label + ': invalid direct-exec process identity')
    launch = jload(directory / 'launch.json')
    require(all(active.get(k) == v for k, v in launch.items())
            and set(active) == set(launch) | {'pid', 'start_ticks', 'supervisor_pid'}, label + ': launch/active mismatch')
    require(jload(directory / 'process.json') == active, label + ': process receipt mismatch')
    manifest_path = root / 'server' / 'stack-manifest.json'
    require(active['manifest_sha256'] == sha(manifest_path), label + ': launch manifest SHA mismatch')
    ready = jload(directory / 'ready.json')
    require(ready['active'] == active and active['time'] <= ready['time'], label + ': startup readiness mismatch')
    require(ready == family['ready'] == jload(root/'client/families'/(product+'-'+op+'-ready.json')),
            label + ': startup readiness copies differ')
    require(ready.get('normal_request_ready') is True and ready['recovery'].get('mode') == 'checkpoint'
            and ready['recovery'].get('recovery_collection_complete') is True
            and len(ready['recovery'].get('storage_devices', [])) == 6
            and ready['recovery']['checkpoint'] == ready['loaded_checkpoint'], label + ': incomplete storage recovery')
    # Startup uses the same CONFIG GET values, without the later drained-stats fields.
    check_configuration(dict(ready, defrag_paused='no', transaction_drain_confirmed=True), product)
    stopped = jload(directory / 'stop.json')
    require(stopped == family['stop'] == jload(root / 'client/families' / (product + '-' + op + '-stop.json')),
            label + ': clean-stop receipt copies disagree')
    require(stopped.get('active') == active and stopped.get('signal') == 15 and stopped.get('returncode') == 0
            and stopped.get('clean_stop_confirmed') is True, label + ': unclean or unowned stop')
    stop_request, exit_status = (jload(directory / name) for name in ('stop-request.json', 'server-exit.json'))
    require(stop_request == {'time': stopped['requested_at'], 'active': active, 'signal': 15}
            and exit_status['active'] == active and exit_status['returncode'] == 0
            and ready['time'] < stopped['requested_at'] <= exit_status['time'] <= stopped['time'] <= family['time'],
            label + ': stop lifecycle chronology/ownership mismatch')
    require(not list(directory.glob('*failure.json')), label + ': failed lifecycle receipt present')
    log = (directory / 'server.log').read_text()
    if product == 'lavik':
        require(active['data_dir'] is None and active['config_sha256'] is None, label + ': unexpected Lavik directory/config')
        devices = jload(root / 'server/spdk-devices.json')
        expected_args = [active['binary'], '--storage=spdk', '--alsologtostderr', '--bind=10.84.1.4',
                         '--threads=16', '--pin-workers', '--metrics-port=0', '--spdk-max-completions-per-poll=16',
                         '--log-dir=' + SROOT + '/' + label + '/logs', '--shutdown-checkpoint']
        expected_args += ['--data-file=spdk://' + item['bdf'] + '/1' for item in devices]
        require(len(devices) == 6 and len({item['bdf'] for item in devices}) == 6
                and active['args'] == expected_args and active['environment'] == {
                    'LC_ALL': 'C', 'BYCORF_EAL_ARGS': ' '.join('-a ' + item['bdf'] for item in devices),
                    'BYCORF_DPDK_MEMORY_MB': '8192'}, label + ': Lavik runtime args/environment mismatch')
        reset = jload(directory / 'reset-data.json')
        require(reset == jload(root / 'client/families' / (product + '-' + op + '-reset.json'))
                and reset.get('active') == active and reset.get('command') == ['FLUSHDB']
                and reset.get('completed') is True and reset.get('response') == 'OK'
                and ready['time'] <= reset['time'] <= reset['completed_at'] < stopped['requested_at'],
                label + ': fresh-data reset not confirmed')
        loaded = re.findall(r'loaded shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', log)
        published = re.findall(r'published shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', log)
        require(len(loaded) == len(published) == 1, label + ': checkpoint log count mismatch')
        loaded, published = tuple(map(int, loaded[0])), tuple(map(int, published[0]))
        require(ready['loaded_checkpoint'] == dict(zip(('generation', 'entries'), loaded)), label + ': loaded checkpoint receipt mismatch')
        require(stopped.get('clean_checkpoint_confirmed') is True and stopped.get('checkpoint_entries') == KEYS
                and published == (stopped['checkpoint_generation'], KEYS) and published[0] == loaded[0] + 1,
                label + ': checkpoint publication mismatch')
        if previous_lavik_stop is not None:
            require(loaded == (previous_lavik_stop['checkpoint_generation'], previous_lavik_stop['checkpoint_entries']), label + ': checkpoint chain broken')
        for text in ('shutdown requested by signal 15', 'all active requests drained; flushing storage buffers',
                     'all storage buffers durably flushed'):
            require(text in log, label + ': missing shutdown log: ' + text)
        fresh_time = reset['completed_at']
    else:
        require(ready['loaded_checkpoint'] is None and not (directory / 'reset-data.json').exists(),
                label + ': peer unexpectedly reset/checkpointed')
        require(active['environment'] == {'LC_ALL': 'C'}, label + ': peer environment override')
        require(parse_info({'info': {'server': ready['info_server']}}, 'server').get(product + '_version') == active['version'],
                label + ': live peer version mismatch')
        data_dir = '/mnt/storage-peers-20261014/' + NAME + '/' + label
        fresh = jload(directory / 'fresh-data.json')
        require(active['data_dir'] == data_dir and fresh['root'] == SROOT and fresh['data_dir'] == data_dir
                and fresh['empty_before_start'] is True and fresh['time'] <= active['time']
                and fresh['raid_receipt_sha256'] == sha(root / 'server/raid-ready.json'), label + ': peer data directory is not fresh')
        if product in ('redis', 'valkey'):
            require('Received SIGTERM scheduling shutdown' in log and 'is now ready to exit' in log,
                    label + ': peer shutdown log missing')
            args = options(active['args'])
            require(args == {'--bind': '10.84.1.4', '--protected-mode': 'no', '--port': '6379', '--dir': data_dir,
                             '--save': '', '--appendonly': 'no', '--io-threads': '16' if product == 'redis' else '8',
                             '--maxclients': '10000'} and active['config_sha256'] is None, label + ': peer launch config mismatch')
        else:
            config_path = directory / 'server.conf'
            original = (root / 'server/kvrocks-template.conf').read_text()
            expected_config = '\n'.join('dir ' + data_dir if line.strip().startswith('dir ') else line
                                        for line in original.splitlines()) + '\n'
            require(config_path.read_text() == expected_config and sha(config_path) == active['config_sha256']
                    and active['args'] == [active['binary'], '-c', SROOT + '/' + label + '/server.conf'],
                    label + ': Kvrocks config mismatch')
        fresh_time = ready['time']
    return active, stopped, fresh_time


def check_case(root, product, op, family, clients, variants, previous_lavik_stop=None):
    active, stopped, fresh_time = check_lifecycle(root, product, op, family, variants, previous_lavik_stop)
    phases = [check_phase(root, product, op, phase, active, clients) for phase in ('load', 'warm', 'run')]
    require(fresh_time <= phases[0]['timing']['start'] and
            phases[0]['timing']['end'] <= phases[1]['timing']['start'] and
            phases[1]['timing']['end'] <= phases[2]['timing']['start'] and
            phases[2]['timing']['end'] <= stopped['requested_at'], product + '/' + op + ': phase order mismatch')
    for phase, name in zip(phases, ('load', 'warm', 'formal')):
        require(family['results'][name] == jload(root / 'client/results' / phase['label'] / 'result.json'),
                phase['label'] + ': family result differs from raw JSON')
    states = check_states(root, product, op, phases)
    samples = check_samples(root, product, op, states)
    formal = phases[-1]
    return dict(formal, product=product, op=op, raw_dir='client/results/' + formal['label'],
                identity={k: active[k] for k in ('version', 'revision', 'binary', 'binary_sha256')},
                unit='pairs/s' if op in PAIRED else 'ops/s', connections=CONNECTIONS, errors=0,
                shape=shape(op), validation={'complete': True, 'load_acknowledgements': load_count(op),
                    'full_replies_checked': True, 'commandstats_match': True, 'bounded_samples': samples,
                    'state': states, 'clean_stop': stopped, 'load': phases[0], 'warm': phases[1]}), stopped


def safe_file(root, relative):
    path = Path(relative)
    require(not path.is_absolute() and '..' not in path.parts and bool(path.parts), 'Unsafe manifest path')
    target = root / path
    require(target.is_file() and not target.is_symlink(), 'Missing or symlinked manifest file: ' + str(target))
    return target


def check_manifests(root):
    from provenance import stack, clients as check_clients, initial
    runtime = jload(root / 'client/runtime-manifest.json')
    require(runtime == jload(root / 'server/runtime-manifest.json') and runtime['experiment'] == NAME
            and runtime['operations'] == list(OPS), 'Runtime manifest copies/experiment differ')
    expected_shapes = {'string_bytes': 8192, 'hash_fields': 32, 'hash_value_bytes': 256,
                       'list_elements': 32, 'list_element_bytes': 256, 'set_members': 256,
                       'zset_members': 256, 'member_bytes': 32, 'stream_entries': 32,
                       'stream_payload_bytes': 256}
    require(runtime['shapes'] == expected_shapes and runtime['phases'] == {'lavik': ['lavik']},
            'Runtime shape/phase dimensions differ')
    for side in ('client', 'server'):
        require(isinstance(runtime[side], dict) and runtime[side], 'Empty runtime manifest')
        for relative, digest in runtime[side].items():
            require(valid_sha(digest) and sha(safe_file(root / side, relative)) == digest,
                    side + ': deployed runtime changed: ' + relative)
    identity = stack(root / 'server')
    require(identity == stack(root / 'client'), 'Host stack manifests differ')
    require(initial(root / 'server') == initial(root / 'client'), 'Host initial checkpoint receipts differ')
    variants = {'lavik': {'revision': identity['revision'], 'version': identity['revision'],
                         'binary': identity['binary'], 'binary_sha256': identity['binary_sha256']}}
    clients = check_clients(root / 'client')
    require(clients == jload(root / 'client/client-manifest.json'), 'Runtime client manifest differs')
    return runtime, clients, variants


def completed_prefix(root):
    rows, missing = [], False
    expected_names = {p + '-' + op for p, op in SEQUENCE}
    directory = root / 'client/families'
    if directory.exists():
        for path in directory.glob('*.json'):
            stem = path.stem
            if stem.endswith('-reset') or stem.endswith('-stop') or stem.endswith('-ready'):
                stem = stem.rsplit('-', 1)[0]
            require(stem in expected_names, 'Unexpected family/dimension: ' + path.name)
    for product, op in SEQUENCE:
        path = directory / (product + '-' + op + '.json')
        if not path.exists():
            missing = True
            continue
        row = jload(path)
        require(row.get('product') == product and row.get('op') == op and row.get('state') in ('started', 'complete'),
                'Invalid family identity/state: ' + path.name)
        if row['state'] != 'complete':
            missing = True
            continue
        require(not missing, 'Completed result after a sequence gap: ' + path.name)
        rows.append((product, op, row))
    return rows


def check_plans(root, runtime, clients, count):
    from provenance import stack
    phase = 'lavik'
    plan = jload(root / 'client/lavik-plan.json')
    expected = {'experiment': NAME, 'phase': phase,
                'sequence': [[p, op] for p, op in SEQUENCE], 'keys': 8192,
                'connections': 80, 'client_threads': 16, 'pipeline': 1, 'shapes': runtime['shapes'],
                'warm_seconds': 90, 'formal_seconds': 60, 'observation_seconds': 45,
                'seeds': SEEDS, 'client_manifest': clients, 'profiled': False,
                'fresh_service_and_data_per_operation': True, 'runs_per_point': 1,
                'stack_manifest': stack(root / 'client'), 'initial_checkpoint': {'generation': 8, 'entries': 16384}}
    require(plan == expected, 'Plan differs from fixed experiment')
    marker(root / 'client/LAVIK_STARTED')
    if count == 14:
        marker(root / 'client/LAVIK_COMPLETE')
        completion = jload(root / 'client/lavik-completion.json')
        require(completion['phase'] == phase and completion['status'] == 'complete'
                and completion['formal_results'] == 14, 'Completion count mismatch')


def digest_row(point, command):
    return {'product': point['product'], 'op': point['op'], 'command': command,
            **point['metrics'][command], 'unit': point['unit'] if command == 'OPERATIONS' else 'ops/s',
            'errors': 0, 'connections': 80, 'raw_path': point['raw_dir'] + '/result.json',
            'source_sha256': point['source_sha256']}


def analyze(root, partial=False, write_outputs=True):
    root = Path(root).resolve()
    require(not any((root/'client'/name).exists() for name in ('lavik-failure.json','lavik-suite-failure.json')), 'Experiment has a failure marker')
    runtime, clients, variants = check_manifests(root)
    families = completed_prefix(root)
    require(partial or len(families) == 14, 'Incomplete experiment; use --partial for a completed prefix')
    check_plans(root, runtime, clients, len(families))
    from provenance import initial
    last_stop = initial(root/'client')
    points, previous_end = [], last_stop['time']
    tokens = set()
    for product, op, family in families:
        require(family['owner_token'] not in tokens, 'Owner token reused across sessions')
        tokens.add(family['owner_token'])
        point, stopped = check_case(root, product, op, family, clients, variants, last_stop)
        require(previous_end is None or family['active']['time'] >= previous_end, 'Service sessions overlap')
        previous_end = stopped['time']
        if product == 'lavik':
            last_stop = stopped
        points.append(point)
    complete = len(points) == 14
    result = {'schema_version': 1, 'experiment': NAME, 'complete': complete,
              'completed_points': len(points), 'expected_points': 14, 'points': points,
              'client_manifest_sha256': sha(root / 'client/client-manifest.json'),
              'runtime_manifest_sha256': sha(root / 'client/runtime-manifest.json'),
              'pending': [{'product': p, 'op': op} for p, op in SEQUENCE[len(points):]]}
    reviewed = {'schema_version': 1, 'experiment': NAME, 'complete': complete,
                'completed_points': len(points), 'expected_points': 14,
                'rows': [digest_row(point, 'OPERATIONS') for point in points],
                'child_rows': [digest_row(point, command) for point in points for command in METRICS[point['op']]]}
    # Validate all points before publishing either output; failures leave previous outputs untouched.
    for name, value in ((('comparison.json', result), ('reviewed_rows.json', reviewed)) if write_outputs else ()):
        path = root / name
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
        temporary.replace(path)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2] / 'outputs' / NAME)
    parser.add_argument('--partial', action='store_true')
    arguments = parser.parse_args()
    result = analyze(arguments.root, arguments.partial)
    print(json.dumps({'complete': result['complete'], 'completed_points': result['completed_points'],
                      'expected_points': result['expected_points'], 'root': str(arguments.root)}))
