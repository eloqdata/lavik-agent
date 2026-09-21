<?php
// Run: php php-client.php predis|phpredis. Fixture only.
$library=$argv[1]; $checks=[];
function verify($name,$actual,$expected) {global $checks;if($actual!==$expected)throw new Exception($name.': '.json_encode($actual));$checks[]=$name;}
if($library==='predis') {
  require '/clients/vendor/autoload.php';
  $client=new Predis\Client(['scheme'=>'tcp','host'=>'127.0.0.1','port'=>6379,'username'=>'default','password'=>'manual-test-only','read_write_timeout'=>5]);
  $version=Composer\InstalledVersions::getPrettyVersion('predis/predis');
} else {
  $client=new Redis();$client->connect('127.0.0.1',6379,5);$client->auth(['default','manual-test-only']);
  $version=phpversion('redis');
}
try {
  verify('authenticated PING',(string)$client->ping(),$library==='predis'?'PONG':'1');
  $set=$client->set('php:text','Hello 世界');verify('SET',$library==='predis'?(string)$set:$set,$library==='predis'?'OK':true);
  verify('Unicode GET',$client->get('php:text'),'Hello 世界');
  verify('missing GET',$client->get('php:missing'),$library==='predis'?null:false);
  $client->set('php:binary',"\0\xff\r\n");verify('binary round trip',$client->get('php:binary'),"\0\xff\r\n");
  $client->hset('php:hash','field','value');verify('HGET',$client->hget('php:hash','field'),'value');
  if($library==='predis') {
    $values=$client->transaction(function($t){$t->set('php:counter','1');$t->incr('php:counter');});
    verify('MULTI/EXEC',$values[1],2);
    verify('Lua EVAL',$client->eval("return redis.call('GET',KEYS[1])",1,'php:counter'),'2');
  } else {
    $values=$client->multi()->set('php:counter','1')->incr('php:counter')->exec();verify('MULTI/EXEC',$values,[true,2]);
    verify('Lua EVAL',$client->eval("return redis.call('GET',KEYS[1])",['php:counter'],1),'2');
  }
} finally {if($library==='predis')$client->disconnect();else $client->close();}
echo json_encode(['library'=>$library,'version'=>$version,'checks'=>$checks,'status'=>'passed'])."\n";
