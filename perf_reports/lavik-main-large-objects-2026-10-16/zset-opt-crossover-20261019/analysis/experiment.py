"""Fixed, ordered crossover; two freshly loaded namespaces, no reset/reload."""
NAME = 'zset-opt-crossover-20261019'
SERVER_ROOT = '/mnt/dev/benchmark/' + NAME
CLIENT_ROOT = '/opt/benchmark/' + NAME
HOST = '10.84.1.4'
KEYS, CONNECTIONS, THREADS = 8192, 80, 16
WARM_SECONDS, FORMAL_SECONDS, OBSERVATION_SECONDS = 90, 60, 45
VARIANTS = ('main', 'candidate')
MEMBERS = {'compact': 256, 'grouped': 32768}
REVISIONS = {'main': '684894d973878ca0e0649b54404ce77521f1695f',
             'candidate': '32bdd6b474733c2850b80e3cc217461075e73af5'}
BYCORF = '86d686724ddd1c5617fb1b62f8131e05571e8423'
OPS = ('zincr', 'zswap')
METRICS = {'zincr': ('ZINCRBY',), 'zswap': ('ZREM', 'ZADD')}
SEQUENCE = tuple((variant, size, op) for variant in VARIANTS
                 for size in MEMBERS for op in OPS)


def stem(variant, size, op):
    if (variant, size, op) not in SEQUENCE:
        raise ValueError('Unknown crossover point')
    return '-'.join((variant, size, op))


def needs_load(variant, size, op):
    return variant == 'main' and op == 'zincr'


def expected_entries(index):
    return KEYS if index < 2 else 2 * KEYS
