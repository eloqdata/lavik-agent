import com.aerospike.client.AerospikeClient;
import com.aerospike.client.Key;
import com.aerospike.client.Record;
import com.aerospike.client.policy.Policy;
import java.nio.file.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
public class VerifyAerospike {
 public static void main(String[] args) throws Exception {
  AerospikeClient client=new AerospikeClient(args[0],3000);Policy policy=new Policy();policy.timeout=10000;
  int count=0;StringBuilder rows=new StringBuilder();
  try {for(String key:Files.readAllLines(Paths.get(args[1]))) {
   Record rec=client.get(policy,new Key("ycsb","usertable",key));
   if(rec==null||rec.bins.size()!=8)throw new IllegalStateException("Missing record/bins: "+key);
   MessageDigest hash=MessageDigest.getInstance("SHA-256");
   for(int i=0;i<8;i++){String field="field"+i;Object value=rec.bins.get(field);if(!(value instanceof byte[])||((byte[])value).length!=128)throw new IllegalStateException("Invalid field: "+key+"/"+field);hash.update(field.getBytes(StandardCharsets.UTF_8));hash.update((byte[])value);}
   StringBuilder hex=new StringBuilder();for(byte v:hash.digest())hex.append(String.format("%02x",v&255));if(count++>0)rows.append(",\n");rows.append("\"").append(key).append("\":\"").append(hex).append("\"");
  }} finally {client.close();}
  System.out.println("{\"sample_count\":"+count+",\"sample_sha256\":{\n"+rows+"\n}}");
 }
}
