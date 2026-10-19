"""Fixed 8 KiB client interface; importing performs no I/O."""
from pathlib import Path
import json, math, struct
CLIENT_ROOT = Path('/opt/benchmark/objects8k-fourdb-20261019/clients')
READ_OPS = frozenset(('hgetall','hkeys','hvals','lrange','smembers','zrange'))
WRITE_OPS = ('set','setrange','hash','list','zincr','zswap','stream','sswap')
OPS = tuple(WRITE_OPS) + tuple(sorted(READ_OPS))
STATEFUL = frozenset(('zswap','sswap'))
KEYS, CONNECTIONS, THREADS = 8192, 80, 16
SEEDS = {'load':101,'validate':101,'warm':10180,'run':20180}
METRICS = {'set':['SET'],'setrange':['SETRANGE'],'hash':['HSET'],'list':['LPUSH','RPOP'],'zincr':['ZINCRBY'],'zswap':['ZREM','ZADD'],'stream':['XADD_MAXLEN'],'sswap':['SADD','SREM'],'hgetall':['HGETALL'],'hkeys':['HKEYS'],'hvals':['HVALS'],'lrange':['LRANGE'],'smembers':['SMEMBERS'],'zrange':['ZRANGE_WITHSCORES']}

def binary_name(op):
    if op not in OPS: raise ValueError(op)
    if op in ('hgetall','hkeys','hvals'): return 'bench_hash'
    if op == 'lrange': return 'bench_lrange'
    if op in ('smembers','zrange'): return 'bench_workdist'
    if op == 'sswap': return 'bench_sswap'
    return 'bench'

def prefix(op):
    binary_name(op)
    return 'objects8k:' + op

def shape(op):
    binary_name(op)
    typ = ('string' if op in ('set','setrange') else 'hash' if op in ('hash','hgetall','hkeys','hvals') else 'list' if op in ('list','lrange') else 'zset' if op in ('zincr','zswap','zrange') else 'set' if op in ('sswap','smembers') else 'stream')
    count = 1 if typ == 'string' else 256 if typ in ('set','zset') else 32
    return {'structure':typ,'logical_payload_bytes':8192,'items_per_key':count,'item_bytes':8192//count}

def load_op(op): return 'hgetall' if op in ('hkeys','hvals') else op

def expected_load_count(op):
    return KEYS * (32 if op == 'stream' else 2 if shape(op)['structure'] in ('set','zset') else 1)

def initialize_state(path, op):
    if op not in STATEFUL: raise ValueError(op)
    path = Path(path)
    with path.open('xb') as f:
        f.write(struct.pack('<ii',1280,KEYS)); f.write(bytes(1280*KEYS))

def command(op, phase, output, state=None, *, root=CLIENT_ROOT, host='10.84.1.4', port=6379):
    binary = binary_name(op)
    if phase not in SEEDS: raise ValueError(phase)
    if phase == 'validate' and op not in READ_OPS: raise ValueError('Write validation is controller-owned')
    if op in STATEFUL and phase in ('warm','run') and state is None: raise ValueError('Persistent pair state required')
    c,t = (1,1) if phase=='validate' else (CONNECTIONS,THREADS)
    args = {'--op':load_op(op) if phase=='load' else op,'--phase':phase,'--host':host,'--port':port,'--prefix':prefix(op),'--connections':c,'--threads':t,'--keys':KEYS,'--seconds':90 if phase=='warm' else 60 if phase=='run' else 1,'--seed':SEEDS[phase],'--out':output}
    if op in READ_OPS: args['--load-seed']=SEEDS['load']
    if state is not None:
        if op not in STATEFUL: raise ValueError('State unsupported for this op')
        args['--state']=state
    return [str(Path(root)/binary)] + [str(x) for kv in args.items() for x in kv]

def validate_result(value, op, phase):
    expected_op=load_op(op) if phase=='load' else op
    assert value['op']==expected_op and value['phase']==phase
    assert value['keys']==KEYS and value['prefix']==prefix(op)
    assert value['connections']==(1 if phase=='validate' else CONNECTIONS)
    assert value['threads']==(1 if phase=='validate' else THREADS)
    assert value['seed']==SEEDS[phase] and value['pipeline']==1
    assert value['errors']==0 and value['interrupted'] is False and value['test_mode'] is False
    assert value['data_shape']==shape(op)
    elapsed=value['elapsed_seconds']; assert math.isfinite(elapsed) and elapsed>0
    metrics=value['metrics']
    if phase=='load':
        assert set(metrics)=={'LOAD'} and metrics['LOAD']['count']==expected_load_count(op)
    else:
        assert set(metrics)==set(['OPERATIONS']+METRICS[op])
        n=metrics['OPERATIONS']['count']; assert n>0
        for name in METRICS[op]: assert metrics[name]['count']==n
        if phase=='validate': assert n==3 and value['validation_keys']==[0,KEYS//2,KEYS-1]
        else: assert elapsed >= (90 if phase=='warm' else 60)
    for m in metrics.values():
        assert isinstance(m['count'],int) and m['count']>0
        for k in ('qps','avg_ms','p50_ms','p99_ms','p999_ms','max_ms'): assert math.isfinite(m[k]) and m[k]>=0
        assert m['p50_ms']<=m['p99_ms']<=m['p999_ms']<=m['max_ms']
    return value
