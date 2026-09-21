# Run: ruby ruby-client.rb. Fixture only.
require 'redis'
require 'json'
checks=[]
check=lambda{|name,actual,expected|raise "#{name}: #{actual.inspect}" unless actual==expected;checks<<name}
client=Redis.new(host:'127.0.0.1',port:6379,username:'default',password:'manual-test-only',timeout:5)
begin
  check.call('authenticated PING',client.ping,'PONG')
  check.call('SET',client.set('ruby:text','Hello 世界'),'OK')
  check.call('Unicode GET',client.get('ruby:text'),'Hello 世界')
  check.call('missing GET',client.get('ruby:missing'),nil)
  client.set('ruby:binary',"\x00\xff\r\n".b)
  check.call('binary round trip',client.get('ruby:binary').b,"\x00\xff\r\n".b)
  client.hset('ruby:hash','field','value');check.call('HGET',client.hget('ruby:hash','field'),'value')
  values=client.pipelined{|p|p.set('ruby:counter','1');p.incr('ruby:counter');p.get('ruby:counter')}
  check.call('pipeline',values,['OK',2,'2'])
  values=client.multi{|t|t.set('ruby:counter','3');t.incr('ruby:counter')}
  check.call('MULTI/EXEC',values,['OK',4])
  check.call('Lua EVAL',client.eval("return redis.call('GET',KEYS[1])",keys:['ruby:counter']),'4')
ensure
  client.close
end
puts JSON.generate(library:'redis',version:Gem.loaded_specs['redis'].version.to_s,checks:checks,status:'passed')
