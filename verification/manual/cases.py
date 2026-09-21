"""Repository-owned executable examples. Each case starts with an empty DB.

Expected replies are assertions, never learned from a test run. Setup and checks
are retained in the published transcript. This is example coverage, not a full
Redis/Valkey conformance suite. No generated shell or network targets are used.
"""
import hashlib
import shlex

CASES = []


def step(command, expected=None, **extra):
    return {"argv": shlex.split(command) if isinstance(command, str) else command,
            "expect": {"equals": expected}, **extra}


def match(command, rule, **extra):
    return {"argv": shlex.split(command) if isinstance(command, str) else command,
            "expect": rule, **extra}


def case(name, group, syntax, *steps, scope="example"):
    CASES.append({"name": name.upper(), "group": group, "syntax": syntax,
                  "scope": scope, "steps": list(steps)})


def build():
    CASES.clear()
    for name, argv, expected in [
        ("ping", "PING", "PONG"), ("echo", "ECHO hello", "hello"),
        ("quit", "QUIT", "OK"), ("reset", "RESET", "RESET"),
        ("auth", "AUTH manual-test-only", "OK"), ("select", "SELECT 0", "OK"),
    ]:
        case(name, "connection", argv, step(argv, expected))
    case("hello", "connection", "HELLO 3", match("HELLO 3", {"mapIncludes": {"proto": 3}}),
         step("PING", "PONG"), match("HELLO 2", {"contains": "proto"}))
    case("client", "connection", "CLIENT SETNAME name | GETNAME | ID | SETINFO LIB-NAME name",
         step("CLIENT SETNAME manual", "OK"), step("CLIENT GETNAME", "manual"),
         match("CLIENT ID", {"integerMin": 1}), step("CLIENT SETINFO LIB-NAME lavik-manual", "OK"),
         match("CLIENT TRACKING ON", {"errorContains": "subcommand"}))

    strings = [
        ("get", "GET greeting", "hello"), ("getdel", "GETDEL greeting", "hello"),
        ("getex", "GETEX greeting EX 60", "hello"), ("getrange", "GETRANGE greeting 1 3", "ell"),
        ("getset", "GETSET greeting world", "hello"), ("append", "APPEND greeting world", 10),
        ("strlen", "STRLEN greeting", 5), ("set", "SET greeting world NX", None),
        ("setex", "SETEX greeting 60 world", "OK"), ("psetex", "PSETEX greeting 60000 world", "OK"),
        ("setnx", "SETNX greeting world", 0), ("setrange", "SETRANGE greeting 0 H", 5),
        ("substr", "SUBSTR greeting 1 3", "ell"),
    ]
    for name, cmd, expected in strings:
        steps = [step("SET greeting hello", "OK"), step(cmd, expected)]
        if name in ("getdel",): steps.append(step("GET greeting", None))
        if name == "set": steps += [step("SET fresh world NX EX 60", "OK"), step("GET fresh", "world"), step("SET fresh changed XX GET", "world"), step("GET fresh", "changed")]
        if name == "setnx": steps += [step("SETNX fresh world", 1), step("GET fresh", "world")]
        if name in ("setex", "psetex", "getex"): steps.append(match("PTTL greeting", {"integerRange": [1, 60000]}))
        case(name, "strings", cmd, *steps)
    case("lcs", "strings", "LCS key1 key2", step("MSET first hello second cello", "OK"), step("LCS first second", "ello"))
    for name, cmd, result in [("incr", "INCR counter", 11), ("incrby", "INCRBY counter 3", 13),
                              ("incrbyfloat", "INCRBYFLOAT counter 0.5", "10.5"),
                              ("decr", "DECR counter", 9), ("decrby", "DECRBY counter 3", 7)]:
        case(name, "strings", cmd, step("SET counter 10", "OK"), step(cmd, result), step("GET counter", str(result)))
    case("mget", "strings", "MGET key [key ...]", step("MSET one 1 two 2", "OK"), step("MGET one missing two", ["1", None, "2"]))
    case("mset", "strings", "MSET key value [key value ...]", step("MSET one 1 two 2", "OK"), step("MGET one two", ["1", "2"]))
    case("msetnx", "strings", "MSETNX key value [key value ...]", step("MSETNX one 1 two 2", 1), step("MSETNX two changed three 3", 0), step("MGET one two three", ["1", "2", None]))

    for name, cmd, result in [("getbit", "GETBIT bits 1", 1), ("setbit", "SETBIT bits 1 0", 1),
                              ("bitcount", "BITCOUNT bits", 1), ("bitpos", "BITPOS bits 1", 1),
                              ("bitfield", "BITFIELD bits INCRBY u4 0 1 GET u4 0", [5, 5]),
                              ("bitfield_ro", "BITFIELD_RO bits GET u4 0", [4])]:
        case(name, "bitmaps", cmd, step("SETBIT bits 1 1", 0), step(cmd, result))
    case("bitop", "bitmaps", "BITOP OR destination key [key ...]", step("SET left A", "OK"), step("SET right B", "OK"), step("BITOP OR union left right", 1), step("GET union", "C"))

    list_cases = [
        ("lpush", "LPUSH queue z", 4), ("lpushx", "LPUSHX queue z", 4),
        ("rpush", "RPUSH queue z", 4), ("rpushx", "RPUSHX queue z", 4),
        ("lpop", "LPOP queue", "a"), ("rpop", "RPOP queue", "c"),
        ("llen", "LLEN queue", 3), ("lindex", "LINDEX queue 1", "b"),
        ("lrange", "LRANGE queue 0 -1", ["a", "b", "c"]), ("lset", "LSET queue 1 z", "OK"),
        ("linsert", "LINSERT queue BEFORE b z", 4), ("lrem", "LREM queue 1 b", 1),
        ("ltrim", "LTRIM queue 0 1", "OK"), ("lpos", "LPOS queue b", 1),
        ("lmove", "LMOVE queue destination LEFT RIGHT", "a"),
        ("rpoplpush", "RPOPLPUSH queue destination", "c"),
        ("lmpop", "LMPOP 1 queue LEFT COUNT 2", ["queue", ["a", "b"]]),
        ("blpop", "BLPOP queue 0.1", ["queue", "a"]), ("brpop", "BRPOP queue 0.1", ["queue", "c"]),
        ("blmove", "BLMOVE queue destination LEFT RIGHT 0.1", "a"),
        ("brpoplpush", "BRPOPLPUSH queue destination 0.1", "c"),
        ("blmpop", "BLMPOP 0.1 1 queue LEFT COUNT 2", ["queue", ["a", "b"]]),
    ]
    for name, cmd, expected in list_cases:
        steps = [step("RPUSH queue a b c", 3), step(cmd, expected)]
        if name.startswith("b"): steps.append(step(cmd.replace("queue", "missing-list"), None))
        case(name, "lists", cmd, *steps)

    hash_cases = [
        ("hset", "HSET user name Bob city Paris", 1), ("hmset", "HMSET user name Bob", "OK"),
        ("lavik.hreplace", "LAVIK.HREPLACE user city Paris", "OK"),
        ("hsetnx", "HSETNX user city Paris", 1), ("hget", "HGET user name", "Ada"),
        ("hmget", "HMGET user name missing", ["Ada", None]), ("hdel", "HDEL user name", 1),
        ("hlen", "HLEN user", 1), ("hexists", "HEXISTS user name", 1),
        ("hgetall", "HGETALL user", ["name", "Ada"]), ("hkeys", "HKEYS user", ["name"]),
        ("hvals", "HVALS user", ["Ada"]), ("hstrlen", "HSTRLEN user name", 3),
        ("hincrby", "HINCRBY user visits 2", 2), ("hincrbyfloat", "HINCRBYFLOAT user score 0.5", "0.5"),
        ("hrandfield", "HRANDFIELD user", "name"), ("hscan", "HSCAN user 0", ["0", ["name", "Ada"]]),
    ]
    for name, cmd, expected in hash_cases:
        steps = [step("HSET user name Ada", 1), step(cmd, expected)]
        if name == "lavik.hreplace":
            steps += [step("HGETALL user", ["city", "Paris"]), step("LAVIK.HREPLACE missing field value", None),
                      step("SET text value", "OK"), match("LAVIK.HREPLACE text field value", {"errorContains": "WRONGTYPE"}),
                      step("PEXPIREAT user 4102444800000", 1), step("LAVIK.HREPLACE user city Rome", "OK"), step("PEXPIRETIME user", 4102444800000)]
        case(name, "hashes", cmd, *steps)

    set_cases = [
        ("sadd", "SADD team b", 1), ("scard", "SCARD team", 1), ("sdiff", "SDIFF team other", ["a"]),
        ("sdiffstore", "SDIFFSTORE result team other", 1), ("sinter", "SINTER team other", []),
        ("sintercard", "SINTERCARD 2 team other", 0), ("sinterstore", "SINTERSTORE result team other", 0),
        ("sismember", "SISMEMBER team a", 1), ("smembers", "SMEMBERS team", ["a"]),
        ("smismember", "SMISMEMBER team a b", [1, 0]), ("smove", "SMOVE team other a", 1),
        ("spop", "SPOP team", "a"), ("srandmember", "SRANDMEMBER team", "a"),
        ("srem", "SREM team a", 1), ("sscan", "SSCAN team 0", ["0", ["a"]]),
        ("sunion", "SUNION team other", ["a"]), ("sunionstore", "SUNIONSTORE result team other", 1),
    ]
    for name, cmd, expected in set_cases:
        case(name, "sets", cmd, step("SADD team a", 1), step(cmd, expected))

    zset_cases = [
        ("zadd", "ZADD scores 3 c", 1), ("zcard", "ZCARD scores", 2), ("zcount", "ZCOUNT scores 1 2", 2),
        ("zincrby", "ZINCRBY scores 2 a", "3"), ("zlexcount", "ZLEXCOUNT scores - +", 2),
        ("zmpop", "ZMPOP 1 scores MIN COUNT 2", ["scores", [["a", "1"], ["b", "2"]]]),
        ("bzmpop", "BZMPOP 0.1 1 scores MIN COUNT 2", ["scores", [["a", "1"], ["b", "2"]]]),
        ("bzpopmax", "BZPOPMAX scores 0.1", ["scores", "b", "2"]),
        ("bzpopmin", "BZPOPMIN scores 0.1", ["scores", "a", "1"]),
        ("zmscore", "ZMSCORE scores a b missing", ["1", "2", None]),
        ("zpopmax", "ZPOPMAX scores", ["b", "2"]), ("zpopmin", "ZPOPMIN scores", ["a", "1"]),
        ("zrange", "ZRANGE scores 0 -1 WITHSCORES", ["a", "1", "b", "2"]),
        ("zrangestore", "ZRANGESTORE result scores 0 -1", 2),
        ("zrangebylex", "ZRANGEBYLEX scores - +", ["a", "b"]),
        ("zrangebyscore", "ZRANGEBYSCORE scores 1 2", ["a", "b"]), ("zrank", "ZRANK scores b", 1),
        ("zrem", "ZREM scores a", 1), ("zremrangebylex", "ZREMRANGEBYLEX scores - +", 2),
        ("zremrangebyrank", "ZREMRANGEBYRANK scores 0 0", 1),
        ("zremrangebyscore", "ZREMRANGEBYSCORE scores 1 1", 1),
        ("zrevrange", "ZREVRANGE scores 0 -1", ["b", "a"]),
        ("zrevrangebylex", "ZREVRANGEBYLEX scores + -", ["b", "a"]),
        ("zrevrangebyscore", "ZREVRANGEBYSCORE scores 2 1", ["b", "a"]),
        ("zrevrank", "ZREVRANK scores b", 0), ("zscore", "ZSCORE scores a", "1"),
        ("zscan", "ZSCAN scores 0", ["0", ["a", "1", "b", "2"]]),
        ("zdiff", "ZDIFF 1 scores", ["a", "b"]), ("zdiffstore", "ZDIFFSTORE result 1 scores", 2),
        ("zinter", "ZINTER 1 scores", ["a", "b"]), ("zintercard", "ZINTERCARD 1 scores", 2),
        ("zinterstore", "ZINTERSTORE result 1 scores", 2), ("zunion", "ZUNION 1 scores", ["a", "b"]),
        ("zunionstore", "ZUNIONSTORE result 1 scores", 2),
    ]
    for name, cmd, expected in zset_cases:
        seed = "ZADD scores 1 a 1 b" if "lex" in name else "ZADD scores 1 a 2 b"
        operation = match(cmd, {"scanPairs": {"a": "1", "b": "2"}}) if name == "zscan" else step(cmd, expected)
        steps = [step(seed, 2), operation]
        if name.startswith("bz"): steps.append(step(cmd.replace("scores", "missing-zset"), None))
        case(name, "sorted-sets", cmd, *steps)
    case("zrandmember", "sorted-sets", "ZRANDMEMBER key", step("ZADD scores 1 a", 1), step("ZRANDMEMBER scores", "a"))

    geo_seed = step("GEOADD places 13.361389 38.115556 Palermo", 1)
    for name, cmd, expected in [
        ("geoadd", "GEOADD places 15.087269 37.502669 Catania", 1),
        ("geodist", "GEODIST places Palermo Palermo km", "0.0000"),
        ("geohash", "GEOHASH places Palermo", ["sqc8b49rny0"]),
        ("georadius", "GEORADIUS places 13.361389 38.115556 1 km", ["Palermo"]),
        ("georadius_ro", "GEORADIUS_RO places 13.361389 38.115556 1 km", ["Palermo"]),
        ("georadiusbymember", "GEORADIUSBYMEMBER places Palermo 1 km", ["Palermo"]),
        ("georadiusbymember_ro", "GEORADIUSBYMEMBER_RO places Palermo 1 km", ["Palermo"]),
        ("geosearch", "GEOSEARCH places FROMMEMBER Palermo BYRADIUS 1 km", ["Palermo"]),
        ("geosearchstore", "GEOSEARCHSTORE result places FROMMEMBER Palermo BYRADIUS 1 km", 1),
    ]:
        case(name, "geospatial", cmd, geo_seed, step(cmd, expected))
    case("geopos", "geospatial", "GEOPOS key member", geo_seed,
         match("GEOPOS places Palermo", {"coordinatesNear": [13.361389, 38.115556]}))

    entry = ["1-0", ["event", "created"]]
    stream_seed = step("XADD events 1-0 event created", "1-0")
    group_seed = step("XGROUP CREATE events workers 0", "OK")
    read_seed = step("XREADGROUP GROUP workers alice STREAMS events >", [["events", [entry]]])
    for name, cmd, expected in [
        ("xadd", "XADD events 2-0 event updated", "2-0"), ("xdel", "XDEL events 1-0", 1),
        ("xlen", "XLEN events", 1), ("xrange", "XRANGE events - +", [entry]),
        ("xrevrange", "XREVRANGE events + -", [entry]), ("xtrim", "XTRIM events MAXLEN 0", 1),
        ("xsetid", "XSETID events 3-0", "OK"), ("xread", "XREAD STREAMS events 0", [["events", [entry]]]),
    ]:
        case(name, "streams", cmd, stream_seed, step(cmd, expected))
    case("xgroup", "streams", "XGROUP CREATE key group id | CREATECONSUMER key group consumer | DESTROY key group",
         stream_seed, group_seed, step("XGROUP CREATECONSUMER events workers alice", 1), step("XGROUP DESTROY events workers", 1))
    case("xreadgroup", "streams", "XREADGROUP GROUP group consumer STREAMS key id", stream_seed, group_seed, read_seed)
    for name, cmd, expected in [
        ("xack", "XACK events workers 1-0", 1),
        ("xclaim", "XCLAIM events workers bob 0 1-0", [entry]),
        ("xautoclaim", "XAUTOCLAIM events workers bob 0 0-0", ["0-0", [entry], []]),
        ("xpending", "XPENDING events workers", [1, "1-0", "1-0", [["alice", 1]]]),
    ]:
        case(name, "streams", cmd, stream_seed, group_seed, read_seed, step(cmd, expected))
    case("xinfo", "streams", "XINFO STREAM key", stream_seed, match("XINFO STREAM events", {"pairsInclude": {"length": 1, "last-generated-id": "1-0"}}))

    for name, cmd, result in [("del", "DEL sample", 1), ("unlink", "UNLINK sample", 1),
                              ("exists", "EXISTS sample missing", 1), ("touch", "TOUCH sample missing", 1),
                              ("type", "TYPE sample", "string"), ("randomkey", "RANDOMKEY", "sample"),
                              ("rename", "RENAME sample renamed", "OK"), ("renamenx", "RENAMENX sample renamed", 1),
                              ("copy", "COPY sample copied", 1), ("dbsize", "DBSIZE", 1),
                              ("keys", "KEYS sam*", ["sample"])]:
        case(name, "keys", cmd, step("SET sample value", "OK"), step(cmd, result))
    case("scan", "keys", "SCAN cursor MATCH pattern COUNT count", step("SET sample value", "OK"),
         match("SCAN 0 MATCH sam* COUNT 1000", {"equals": ["sample"]}, scanAll=True))
    for name, cmd in [("flushdb", "FLUSHDB"), ("flushall", "FLUSHALL")]:
        case(name, "keys", cmd, step("SET sample value", "OK"), step(cmd, "OK"), step("DBSIZE", 0))
    for name in ["dump", "restore"]:
        case(name, "keys", "DUMP key" if name == "dump" else "RESTORE key ttl serialized-value",
             step("SET sample value", "OK"), match("DUMP sample", {"binaryMin": 10}, capture="payload"),
             step(["RESTORE", "restored", "0", {"ref": "payload"}], "OK"), step("GET restored", "value"))
    for name in ["sort", "sort_ro"]:
        case(name, "keys", name.upper() + " key", step("RPUSH numbers 3 1 2", 3), step(f"{name} numbers", ["1", "2", "3"]))
    for name, cmd in [("expire", "EXPIRE sample 60"), ("pexpire", "PEXPIRE sample 60000"),
                      ("expireat", "EXPIREAT sample 4102444800"), ("pexpireat", "PEXPIREAT sample 4102444800000")]:
        check = match("PTTL sample", {"integerRange": [1, 60000]}) if name in ["expire", "pexpire"] else step("EXPIRETIME sample", 4102444800)
        case(name, "keys", cmd, step("SET sample value", "OK"), step(cmd, 1), check)
    for name, cmd, result in [("ttl", "TTL sample", -1), ("pttl", "PTTL sample", -1),
                              ("expiretime", "EXPIRETIME sample", -1), ("pexpiretime", "PEXPIRETIME sample", -1)]:
        case(name, "keys", cmd, step("SET sample value", "OK"), step(cmd, result), step(cmd.replace("sample", "missing"), -2))
    case("persist", "keys", "PERSIST key", step("SET sample value EX 60", "OK"), step("PERSIST sample", 1), step("TTL sample", -1))

    for name in ["multi", "exec"]:
        case(name, "transactions", name.upper(), step("MULTI", "OK"), step("SET sample value", "QUEUED"), step("GET sample", "QUEUED"), step("EXEC", ["OK", "value"]))
    case("discard", "transactions", "DISCARD", step("MULTI", "OK"), step("SET sample value", "QUEUED"), step("DISCARD", "OK"), step("GET sample", None))
    case("watch", "transactions", "WATCH key [key ...]", step("WATCH sample", "OK"), step("SET sample other", "OK", connection="other"), step("MULTI", "OK"), step("GET sample", "QUEUED"), step("EXEC", None))
    case("unwatch", "transactions", "UNWATCH", step("WATCH sample", "OK"), step("UNWATCH", "OK"), step("SET sample other", "OK", connection="other"), step("MULTI", "OK"), step("GET sample", "QUEUED"), step("EXEC", ["other"]))

    script = "return redis.call('GET', KEYS[1])"
    sha = hashlib.sha1(script.encode()).hexdigest()
    for name in ["eval", "eval_ro", "evalsha", "evalsha_ro"]:
        command = [name.upper(), sha if "sha" in name else script, "1", "sample"]
        setup = [step("SET sample value", "OK")]
        if "sha" in name: setup.append(step(["SCRIPT", "LOAD", script], sha))
        case(name, "scripting", name.upper() + (" sha numkeys key" if "sha" in name else " script numkeys key"), *setup, step(command, "value"))
    case("script", "scripting", "SCRIPT LOAD script | EXISTS sha | FLUSH", step(["SCRIPT", "LOAD", script], sha), step(["SCRIPT", "EXISTS", sha], [1]), step("SCRIPT FLUSH", "OK"), step(["SCRIPT", "EXISTS", sha], [0]))
    library = "#!lua name=manual\nredis.register_function{function_name='read_value', callback=function(keys,args) return redis.call('GET',keys[1]) end, flags={'no-writes'}}"
    for name in ["fcall", "fcall_ro", "function"]:
        setup = [step("FUNCTION FLUSH", "OK"), step(["FUNCTION", "LOAD", library], "manual"), step("SET sample value", "OK")]
        if name == "function":
            case(name, "scripting", "FUNCTION LOAD library | LIST | DUMP | RESTORE payload | DELETE library | FLUSH", *setup,
                 match("FUNCTION LIST", {"nestedContains": "manual"}), match("FUNCTION DUMP", {"binaryMin": 10}, capture="libraries"),
                 step("FUNCTION FLUSH", "OK"), step(["FUNCTION", "RESTORE", {"ref": "libraries"}], "OK"), step("FCALL read_value 1 sample", "value"), step("FUNCTION DELETE manual", "OK"))
        else: case(name, "scripting", name.upper() + " function numkeys key", *setup, step(f"{name} read_value 1 sample", "value"))

    for name in ["subscribe", "unsubscribe", "publish", "pubsub"]:
        case(name, "pubsub", {"subscribe": "SUBSCRIBE channel", "unsubscribe": "UNSUBSCRIBE channel", "publish": "PUBLISH channel message", "pubsub": "PUBSUB NUMSUB channel"}[name],
             step("SUBSCRIBE updates", ["subscribe", "updates", 1], connection="subscriber"),
             step("PUBSUB NUMSUB updates", ["updates", 1]), step("PUBLISH updates hello", 1),
             {"read": True, "connection": "subscriber", "expect": {"equals": ["message", "updates", "hello"]}},
             step("UNSUBSCRIBE updates", ["unsubscribe", "updates", 0], connection="subscriber"))
    for name in ["psubscribe", "punsubscribe"]:
        case(name, "pubsub", name.upper() + " pattern",
             step("PSUBSCRIBE news.*", ["psubscribe", "news.*", 1], connection="subscriber"), step("PUBLISH news.one hello", 1),
             {"read": True, "connection": "subscriber", "expect": {"equals": ["pmessage", "news.*", "news.one", "hello"]}},
             step("PUNSUBSCRIBE news.*", ["punsubscribe", "news.*", 0], connection="subscriber"))

    case("config", "server", "CONFIG GET parameter | SET parameter value | RESETSTAT", step("CONFIG GET maxclients", ["maxclients", "10000"]), step("CONFIG SET maxclients 9999", "OK"), step("CONFIG GET maxclients", ["maxclients", "9999"]), step("CONFIG SET maxclients 10000", "OK"), step("CONFIG RESETSTAT", "OK"))
    case("info", "server", "INFO server | replication", match("INFO server", {"contains": "lavik_version:0.1.0-beta.1"}), match("INFO replication", {"contains": "role:master"}))
    case("role", "server", "ROLE", match("ROLE", {"first": "master"}))
    case("wait", "server", "WAIT numreplicas timeout-ms", step("SET sample value", "OK"), step("WAIT 0 100", 0))
    for name in ["replicaof", "slaveof"]:
        case(name, "server", name.upper() + " NO ONE", step(name.upper() + " NO ONE", "OK"), match("ROLE", {"first": "master"}), scope="standalone-control")
    case("addreplicaof", "server", "ADDREPLICAOF NO ONE (rejected)", match("ADDREPLICAOF NO ONE", {"errorContains": "does not accept NO ONE"}), scope="rejection-only")
    case("cluster", "server", "CLUSTER KEYSLOT key", step("CLUSTER KEYSLOT foo", 12182), scope="standalone-control")
    for name in ["readonly", "readwrite"]:
        case(name, "server", name.upper(), step(name.upper(), "OK"), scope="standalone-control")
    case("command", "server", "COMMAND COUNT | GETKEYS command [arg ...]", step("COMMAND COUNT", 217), match("COMMAND INFO get", {"errorContains": "unknown subcommand"}), step("COMMAND GETKEYS MGET one two", ["one", "two"]))
    case("save", "server", "SAVE", step("SET sample value", "OK"), step("SAVE", "OK"), match("LASTSAVE", {"integerMin": 1}))
    case("bgsave", "server", "BGSAVE", step("SET sample value", "OK"), step("BGSAVE", "Background saving started"), scope="background-start")
    case("lastsave", "server", "LASTSAVE", step("SAVE", "OK"), match("LASTSAVE", {"integerMin": 1}))
    case("monitor", "server", "MONITOR", step("MONITOR", "OK", connection="monitor"), step("SET observed value", "OK"),
         {"read": True, "connection": "monitor", "expect": {"contains": "\"SET\" \"observed\" \"value\""}})
    case("slowlog", "server", "SLOWLOG LEN | GET count | RESET", step("SLOWLOG RESET", "OK"), match("SLOWLOG LEN", {"integerMin": 0}), match("SLOWLOG GET 1", {"type": "array"}))
    case("tombraider", "server", "TOMBRAIDER STATUS | OFF | ON", match("TOMBRAIDER STATUS", {"contains": "mode=interval"}), step("TOMBRAIDER OFF", "OK"), match("TOMBRAIDER STATUS", {"contains": "mode=off"}), step("TOMBRAIDER ON", "OK"))
    case("defrag", "server", "DEFRAG STATUS | PAUSE | RESUME", match("DEFRAG STATUS", {"contains": "paused=0"}), step("DEFRAG PAUSE", "OK"), match("DEFRAG STATUS", {"contains": "paused=1"}), step("DEFRAG RESUME", "OK"))
    return sorted(CASES, key=lambda c: c["name"])


if __name__ == "__main__":
    import json
    print(json.dumps(build(), ensure_ascii=False, indent=2))
