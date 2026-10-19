"""Fixed two-size ZSet crossover interface. Importing has no side effects."""
from pathlib import Path
import math, struct
ROOT=Path('/opt/benchmark/zset-opt-crossover-20261019/clients')
KEYS,CONNECTIONS,THREADS=8192,80,16
SIZES={'compact':256,'grouped':32768}
OPS=('zincr','zswap')
SEEDS={'load':101,'warm':10180,'run':20180}
SECONDS={'load':1,'warm':90,'run':60}
METRICS={'zincr':('ZINCRBY',),'zswap':('ZREM','ZADD')}

def prefix(size):
    if size not in SIZES:raise ValueError(size)
    return 'zset-opt:'+size

def shape(size):
    return {'structure':'zset','members_per_key':SIZES[size],'member_bytes':32,'logical_payload_bytes':SIZES[size]*32}

def expected_load_count(size):return KEYS*SIZES[size]//128

def initialize_state(path):
    with Path(path).open('xb') as f:f.write(struct.pack('<ii',1280,KEYS));f.write(bytes(1280*KEYS))

def command(size,op,phase,output,state,*,root=ROOT,host='10.84.1.4',port=6379):
    if op not in OPS or phase not in SEEDS:raise ValueError((op,phase))
    if phase=='load' and op!='zincr':raise ValueError('Only initial ZINCRBY dataset loader is supported')
    if state is None:raise ValueError('Shared size-specific state required in all phases')
    args={'--op':op,'--phase':phase,'--host':host,'--port':port,'--prefix':prefix(size),'--members':SIZES[size],'--connections':CONNECTIONS,'--threads':THREADS,'--keys':KEYS,'--seconds':SECONDS[phase],'--seed':SEEDS[phase],'--state':state,'--out':output}
    return [str(Path(root)/'bench')]+[str(x) for kv in args.items() for x in kv]

def validate_result(value,size,op,phase):
    expected={'op':op,'phase':phase,'prefix':prefix(size),'members':SIZES[size],'keys':KEYS,'connections':CONNECTIONS,'threads':THREADS,'seed':SEEDS[phase],'pipeline':1,'errors':0,'test_mode':False,'interrupted':False,'data_shape':shape(size)}
    for key,val in expected.items():
        if value.get(key)!=val:raise ValueError('Client result differs: '+key)
    if value['interrupted'] is not False or value['test_mode'] is not False:raise ValueError('Non-formal client result')
    elapsed=value['elapsed_seconds']
    if not math.isfinite(elapsed) or elapsed<=0:raise ValueError('Invalid elapsed time')
    metrics=value['metrics'];names={'LOAD'} if phase=='load' else {'OPERATIONS',*METRICS[op]}
    if set(metrics)!=names:raise ValueError('Wrong command metrics')
    if phase=='load':
        if metrics['LOAD']['count']!=expected_load_count(size):raise ValueError('Incomplete load')
    else:
        n=metrics['OPERATIONS']['count']
        if n<=0 or any(v['count']!=n for v in metrics.values()):raise ValueError('Incomplete pair/command count')
        if elapsed<SECONDS[phase]:raise ValueError('Incomplete measured duration')
    for metric in metrics.values():
        if type(metric['count']) is not int or metric['count']<=0:raise ValueError('Invalid sample count')
        if any(not math.isfinite(metric[k]) or metric[k]<0 for k in ('qps','avg_ms','p50_ms','p99_ms','p999_ms','max_ms')):raise ValueError('Invalid metric')
        if not metric['p50_ms']<=metric['p99_ms']<=metric['p999_ms']<=metric['max_ms']:raise ValueError('Percentiles out of order')
    return value
