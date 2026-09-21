// Run: ./go-client redis|valkey. Fixture only; local Docker, plaintext TCP.
package main

import (
 "context"
 "encoding/json"
 "fmt"
 "os"
 "runtime/debug"
 "time"
 redis "github.com/redis/go-redis/v9"
 valkey "github.com/valkey-io/valkey-go"
)

func main() {
 ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second); defer cancel()
 checks := []string{}
 check := func(name string, got, want string, err error) { if err != nil || got != want { panic(fmt.Sprintf("%s: got %q want %q err %v", name, got, want, err)) }; checks=append(checks,name) }
 lib := "github.com/redis/go-redis/v9"
 if os.Args[1] == "redis" {
  c := redis.NewClient(&redis.Options{Addr:"127.0.0.1:6379", Username:"default", Password:"manual-test-only", Protocol:3, MaxRetries:-1}); defer c.Close()
  v,e:=c.Ping(ctx).Result();check("authenticated PING",v,"PONG",e)
  v,e=c.Set(ctx,"go:text","Hello 世界",0).Result();check("SET",v,"OK",e)
  v,e=c.Get(ctx,"go:text").Result();check("Unicode GET",v,"Hello 世界",e)
  v,e=c.Get(ctx,"go:missing").Result();if e!=redis.Nil {panic("missing GET")};checks=append(checks,"missing GET")
  c.Set(ctx,"go:binary",string([]byte{0,255,13,10}),0)
  v,e=c.Get(ctx,"go:binary").Result();check("binary round trip",v,string([]byte{0,255,13,10}),e)
  if e=c.HSet(ctx,"go:hash","field","value").Err();e!=nil {panic(e)}
  v,e=c.HGet(ctx,"go:hash","field").Result();check("HGET",v,"value",e)
  p:=c.Pipeline();p.Set(ctx,"go:counter","1",0);n:=p.Incr(ctx,"go:counter");_,e=p.Exec(ctx);check("pipeline",fmt.Sprint(n.Val()),"2",e)
  tx:=c.TxPipeline();tx.Set(ctx,"go:counter","3",0);n=tx.Incr(ctx,"go:counter");_,e=tx.Exec(ctx);check("MULTI/EXEC",fmt.Sprint(n.Val()),"4",e)
  v,e=c.Eval(ctx,"return redis.call('GET',KEYS[1])",[]string{"go:counter"}).Text();check("Lua EVAL",v,"4",e)
  if e=c.Set(ctx,"go:expiry","value",60*time.Second).Err();e!=nil {panic(e)}
  ttl,e:=c.PTTL(ctx,"go:expiry").Result();if e!=nil || ttl<=0 || ttl>60*time.Second {panic("PTTL")};checks=append(checks,"SET expiry/PTTL")
 } else {
  lib="github.com/valkey-io/valkey-go"
  // Lavik 0.1.0 does not implement CLIENT TRACKING; disable client-side caching.
  c,e:=valkey.NewClient(valkey.ClientOption{InitAddress:[]string{"127.0.0.1:6379"},Username:"default",Password:"manual-test-only",DisableCache:true});if e!=nil{panic(e)};defer c.Close()
  v,e:=c.Do(ctx,c.B().Ping().Build()).ToString();check("authenticated PING",v,"PONG",e)
  v,e=c.Do(ctx,c.B().Set().Key("go:text").Value("Hello 世界").Build()).ToString();check("SET",v,"OK",e)
  v,e=c.Do(ctx,c.B().Get().Key("go:text").Build()).ToString();check("Unicode GET",v,"Hello 世界",e)
  v,e=c.Do(ctx,c.B().Get().Key("go:missing").Build()).ToString();if !valkey.IsValkeyNil(e){panic("missing GET")};checks=append(checks,"missing GET")
  added,e:=c.Do(ctx,c.B().Hset().Key("go:hash").FieldValue().FieldValue("field","value").Build()).ToInt64();check("HSET",fmt.Sprint(added),"1",e)
  v,e=c.Do(ctx,c.B().Hget().Key("go:hash").Field("field").Build()).ToString();check("HGET",v,"value",e)
  replies:=c.DoMulti(ctx,c.B().Set().Key("go:counter").Value("1").Build(),c.B().Incr().Key("go:counter").Build(),c.B().Get().Key("go:counter").Build())
  v,e=replies[0].ToString();check("pipeline SET",v,"OK",e);n,e:=replies[1].ToInt64();check("pipeline INCR",fmt.Sprint(n),"2",e);v,e=replies[2].ToString();check("pipeline GET",v,"2",e)
  v,e=c.Do(ctx,c.B().Eval().Script("return redis.call('GET',KEYS[1])").Numkeys(1).Key("go:counter").Build()).ToString();check("Lua EVAL",v,"2",e)
 }
 version:="";if info,ok:=debug.ReadBuildInfo();ok{for _,d:=range info.Deps{if d.Path==lib{version=d.Version}}}
 if version==""{panic("Missing dependency version")}
 json.NewEncoder(os.Stdout).Encode(map[string]any{"library":lib,"version":version,"protocol":3,"checks":checks,"status":"passed"})
}
