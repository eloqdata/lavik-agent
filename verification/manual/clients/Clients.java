// Run: java -cp '/clients:/clients/jars/*' Clients jedis|valkey|lettuce
import java.util.*;
import redis.clients.jedis.Jedis;

public class Clients {
  static String installedVersion(String group, String artifact) {
    String file="META-INF/maven/"+group+"/"+artifact+"/pom.properties";
    try(var input=Clients.class.getClassLoader().getResourceAsStream(file)) {
      if(input==null)throw new IllegalStateException("Missing installed package metadata: "+file);
      var properties=new Properties();properties.load(input);return Objects.requireNonNull(properties.getProperty("version"));
    } catch(java.io.IOException error){throw new RuntimeException(error);}
  }
  static List<String> checks = new ArrayList<>();
  static void check(String name, Object actual, Object expected) {
    if (!Objects.equals(actual, expected)) throw new AssertionError(name+": "+actual+" != "+expected);
    checks.add(name);
  }
  public static void main(String[] args) {
    String library=args[0], version="";
    if (library.equals("jedis")) {
      version=installedVersion("redis.clients","jedis");
      try (var client=new Jedis("127.0.0.1",6379)) {
        client.auth("default","manual-test-only");
        check("authenticated PING",client.ping(),"PONG");
        check("SET",client.set("java:text","Hello 世界"),"OK");
        check("Unicode GET",client.get("java:text"),"Hello 世界");
        check("missing GET",client.get("java:missing"),null);
        client.hset("java:hash","field","value");check("HGET",client.hget("java:hash","field"),"value");
        try(var p=client.pipelined()){p.set("java:counter","1");var n=p.incr("java:counter");p.sync();check("pipeline",n.get(),2L);}
        try(var tx=client.multi()){tx.set("java:counter","3");tx.incr("java:counter");check("MULTI/EXEC",tx.exec(),List.of("OK",4L));}
        check("Lua EVAL",client.eval("return redis.call('GET',KEYS[1])",List.of("java:counter"),List.of()),"4");
        client.psetex("java:expiry",60000,"value");long ttl=client.pttl("java:expiry");check("PSETEX/PTTL",ttl>0&&ttl<=60000,true);
      }
    } else if(library.equals("valkey")) {
      version=installedVersion("io.valkey","valkey-java");
      try (var client=new io.valkey.Jedis("127.0.0.1",6379)) {
        client.auth("default","manual-test-only");
        check("authenticated PING",client.ping(),"PONG");
        check("SET",client.set("java:text","Hello 世界"),"OK");
        check("Unicode GET",client.get("java:text"),"Hello 世界");
        check("missing GET",client.get("java:missing"),null);
        client.hset("java:hash","field","value");check("HGET",client.hget("java:hash","field"),"value");
        try(var p=client.pipelined()){p.set("java:counter","1");var n=p.incr("java:counter");p.sync();check("pipeline",n.get(),2L);}
        try(var tx=client.multi()){tx.set("java:counter","3");tx.incr("java:counter");check("MULTI/EXEC",tx.exec(),List.of("OK",4L));}
        check("Lua EVAL",client.eval("return redis.call('GET',KEYS[1])",List.of("java:counter"),List.of()),"4");
      }
    } else {
      version=installedVersion("io.lettuce","lettuce-core");
      var uri=io.lettuce.core.RedisURI.Builder.redis("127.0.0.1",6379).withAuthentication("default","manual-test-only").withTimeout(java.time.Duration.ofSeconds(5)).build();
      var client=io.lettuce.core.RedisClient.create(uri);
      try(var connection=client.connect()) {
        var c=connection.sync();check("authenticated PING",c.ping(),"PONG");
        check("SET",c.set("java:text","Hello 世界"),"OK");check("Unicode GET",c.get("java:text"),"Hello 世界");check("missing GET",c.get("java:missing"),null);
        c.hset("java:hash","field","value");check("HGET",c.hget("java:hash","field"),"value");
        c.multi();c.set("java:counter","3");c.incr("java:counter");var results=c.exec();check("MULTI/EXEC count",results.size(),2);check("MULTI/EXEC value",results.get(1),4L);
        check("Lua EVAL",c.eval("return redis.call('GET',KEYS[1])",io.lettuce.core.ScriptOutputType.VALUE,new String[]{"java:counter"}),"4");
      } finally {client.shutdown();}
    }
    String names=String.join(",",checks.stream().map(x->"\""+x+"\"").toList());
    System.out.println("{\"library\":\""+library+"\",\"version\":\""+version+"\",\"checks\":["+names+"],\"status\":\"passed\"}");
  }
}
