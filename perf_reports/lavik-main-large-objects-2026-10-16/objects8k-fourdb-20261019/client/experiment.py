"""Fixed dimensions; two manually launched storage phases."""
NAME = 'objects8k-fourdb-20261019'
SERVER_ROOT = '/mnt/dev/benchmark/' + NAME
CLIENT_ROOT = '/opt/benchmark/' + NAME
HOST = '10.84.1.4'
KEYS = 8192
CONNECTIONS = 80
THREADS = 16
WARM_SECONDS = 90
FORMAL_SECONDS = 60
OBSERVATION_SECONDS = 45
LOAD_SEED, WARM_SEED, FORMAL_SEED = 101, 10180, 20180
OPS = ('hgetall', 'hkeys', 'hvals', 'smembers', 'lrange', 'zrange',
       'set', 'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')
READ_OPS = OPS[:6]
PRODUCTS = ('lavik', 'redis', 'valkey', 'kvrocks')
PHASES = {'lavik': ('lavik',), 'peers': ('redis', 'valkey', 'kvrocks')}
SHAPES = {'string_bytes': 8192, 'hash_fields': 32, 'hash_value_bytes': 256,
          'list_elements': 32, 'list_element_bytes': 256, 'set_members': 256,
          'zset_members': 256, 'member_bytes': 32, 'stream_entries': 32,
          'stream_payload_bytes': 256}
PAIRED = ('list', 'zswap', 'sswap')
LOAD_COMMANDS = {'hgetall': 'HSET', 'hkeys': 'HSET', 'hvals': 'HSET',
                 'smembers': 'SADD', 'lrange': 'RPUSH', 'zrange': 'ZADD',
                 'set': 'SET', 'setrange': 'SET', 'hash': 'HSET', 'list': 'RPUSH',
                 'zincr': 'ZADD', 'zswap': 'ZADD', 'stream': 'XADD', 'sswap': 'SADD'}
METRICS = {'hgetall': ('HGETALL',), 'hkeys': ('HKEYS',), 'hvals': ('HVALS',),
           'smembers': ('SMEMBERS',), 'lrange': ('LRANGE',), 'zrange': ('ZRANGE_WITHSCORES',),
           'set': ('SET',), 'setrange': ('SETRANGE',), 'hash': ('HSET',),
           'list': ('LPUSH', 'RPOP'), 'zincr': ('ZINCRBY',), 'zswap': ('ZREM', 'ZADD'),
           'stream': ('XADD_MAXLEN',), 'sswap': ('SADD', 'SREM')}


def sequence(phase):
    return tuple((product, op) for product in PHASES[phase] for op in OPS)


def label(product, op):
    if product not in PRODUCTS or op not in OPS:
        raise ValueError('Unknown product/operation')
    return product + '-' + op
