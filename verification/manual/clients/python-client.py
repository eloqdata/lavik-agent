"""Run: python3 python-client.py redis|valkey|glide [2|3]. Fixture only."""
import asyncio
import importlib.metadata
import json
import sys

library = sys.argv[1]
protocol = int(sys.argv[2]) if len(sys.argv) > 2 else 3
checks = []


def check(feature, value, expected):
    assert value == expected, (feature, value, expected)
    checks.append(feature)


def standard():
    if library == "redis":
        from redis import Redis as Client
    else:
        from valkey import Valkey as Client
    client = Client(host="127.0.0.1", port=6379, username="default", password="manual-test-only",
                    protocol=protocol, socket_timeout=5, socket_connect_timeout=5)
    try:
        check("authenticated PING", client.ping(), True)
        client.delete("client:text", "client:hash", "client:list", "client:counter")
        check("SET", client.set("client:text", "Hello 世界"), True)
        check("Unicode GET", client.get("client:text"), "Hello 世界".encode())
        check("missing GET", client.get("client:missing"), None)
        client.set("client:binary", b"\x00\xff\r\n")
        check("binary round trip", client.get("client:binary"), b"\x00\xff\r\n")
        check("HSET", client.hset("client:hash", "field", "value"), 1)
        check("HGETALL", client.hgetall("client:hash"), {b"field": b"value"})
        client.rpush("client:list", "a", "b")
        check("LRANGE", client.lrange("client:list", 0, -1), [b"a", b"b"])
        pipe = client.pipeline(transaction=False)
        pipe.set("client:counter", "1").incr("client:counter").get("client:counter")
        check("pipeline", pipe.execute(), [True, 2, b"2"])
        tx = client.pipeline(transaction=True)
        tx.set("client:counter", "3").incr("client:counter")
        check("MULTI/EXEC", tx.execute(), [True, 4])
        check("Lua EVAL", client.eval("return redis.call('GET',KEYS[1])", 1, "client:counter"), b"4")
        client.set("client:expiry", "value", px=60000)
        ttl = client.pttl("client:expiry")
        check("PX/PTTL", 0 < ttl <= 60000, True)
        client.connection_pool.disconnect()
        check("reconnect", client.get("client:text"), "Hello 世界".encode())
    finally:
        client.close()


async def glide():
    from glide import GlideClient, GlideClientConfiguration, NodeAddress, ServerCredentials, ProtocolVersion
    client = await GlideClient.create(GlideClientConfiguration(
        addresses=[NodeAddress("127.0.0.1", 6379)],
        credentials=ServerCredentials(password="manual-test-only", username="default"),
        protocol=ProtocolVersion.RESP3, request_timeout=5000))
    try:
        check("authenticated PING", await client.ping(), b"PONG")
        check("SET", await client.set("glide:text", "Hello 世界"), "OK")
        check("Unicode GET", await client.get("glide:text"), "Hello 世界".encode())
        check("missing GET", await client.get("glide:missing"), None)
        await client.set("glide:binary", b"\x00\xff\r\n")
        check("binary round trip", await client.get("glide:binary"), b"\x00\xff\r\n")
        await client.hset("glide:hash", {"field": "value"})
        check("HGET", await client.hget("glide:hash", "field"), b"value")
        check("Lua EVAL (raw API)", await client.custom_command(["EVAL", "return redis.call('GET',KEYS[1])", "1", "glide:text"]), "Hello 世界".encode())
    finally:
        await client.close()


if library == "glide": asyncio.run(glide())
else: standard()
package = {"redis": "redis", "valkey": "valkey", "glide": "valkey-glide"}[library]
print(json.dumps({"library": package, "version": importlib.metadata.version(package), "protocol": protocol, "checks": checks, "status": "passed"}))
