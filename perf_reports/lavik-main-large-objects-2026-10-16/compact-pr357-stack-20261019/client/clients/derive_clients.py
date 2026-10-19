"""One-time, explicit semantic transformations from archived clients (not run remotely)."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
HERE=Path(__file__).resolve().parent
sources={'bench.cpp':'main-large-writes-20261018-1412/bench.cpp','bench_sswap.cpp':'main-large-writes-20261018-1412/bench_sswap.cpp','bench_hash.cpp':'pr342-packed-20261017/bench_hash.cpp','bench_lrange.cpp':'pr342-packed-20261017/bench_lrange.cpp','bench_workdist.cpp':'pr342-packed-20261017/bench_workdist.cpp'}
ops={'bench.cpp':['set','setrange','hash','list','zincr','zswap','stream'],'bench_sswap.cpp':['sswap'],'bench_hash.cpp':['hgetall','hkeys','hvals'],'bench_lrange.cpp':['lrange'],'bench_workdist.cpp':['smembers','zrange']}
manifest={}
for name,source in sources.items():
    p=ROOT/'work'/source
    raw=p.read_bytes();s=raw.decode()
    s='// Derived for fixed 8 KiB objects; see client-interface.md and source-manifest.json.\n#include "bench8k.h"\n'+s
    # Shape-specific replacements. Deliberately retain score +/-32768 and sequence%32768.
    replacements={
      'data(1048576,':'data(8192,','payload.resize(1048576)':'payload.resize(8192)',
      'rng()%(1048576-256+1)':'rng()%(8192-256+1)','integer(1048576)':'integer(8192)',
      '4096-c.loadpos':'32-c.loadpos','rng()%4096':'rng()%32','<4097':'<33','>4096+connections':'>32+connections',
      '"MAXLEN","=","4096"':'"MAXLEN","=","32"',
      '32768-c.loadpos':'256-c.loadpos','c.slot=rng()%32768':'c.slot=rng()%256',
      '?32768:4096':'?256:32','kFields = 4096':'kFields = 32',
      'v>=32768':'v>=256','?4096:32768':'?32:256','slot>=4096':'slot>=32',
      'spans.size()!=4096':'spans.size()!=32','packed-hash-field-key-le-v1':'packed-hash-32x256-8k-v1',
    }
    for a,b in replacements.items():s=s.replace(a,b)
    # Strict argument parser, bounds, and signal handling are common to every binary.
    if name=='bench_hash.cpp':
        a=s.index(' const set<string> allowed=',s.index('int main('));b=s.index(' op=opts.at',a)
        s=s[:a]+' opts=b8::arguments(argc,argv);\n'+s[b:]
        marker=' stats.resize(threads);'
    else:
        a=s.index('for(int i=1;i<argc;i+=2)',s.index('int main('));b=s.index('op=opts.at',a)
        s=s[:a]+'opts=b8::arguments(argc,argv);'+s[b:]
        marker=' mt19937_64 gen(17);'
    strict=' b8::validate(opts,op,phase,host,prefix,connections,stoi(opts.at("--threads")),keys,seconds,port,{'+','.join('"'+o+'"' for o in ops[name])+'});\n'
    s=s.replace(marker,strict+marker,1)
    if name!='bench_hash.cpp':
        a=s.index(' if(opts.count("--state"))');b=s.index('\n',a)
        s=s[:a]+' if(opts.count("--state"))b8::load_state(opts.at("--state"),toggles,keys,connections,phase=="load");'+s[b:]
        a=s.index(' if(',s.index('double elapsed='))
        # Old conditional state save occupies one full line.
        if 'ofstream f(opts["--state"]' not in s[a:s.index('\n',a)]:
            a=s.index('\n if(',s.index('double elapsed='))+1
        if 'ofstream f(opts["--state"]' in s[a:s.index('\n',a)]:
            b=s.index('\n',a);s=s[:a]+' if((op=="zswap"||op=="sswap")&&phase!="load")b8::save_state(opts.at("--state"),toggles,keys);'+s[b:]
    # Three bounded sample keys for read-only validators.
    if name in ('bench_lrange.cpp','bench_workdist.cpp'):
        s=s.replace('if(c.stage==0){c.key=rng()%keys;c.seq++;c.slot=rng()%256;}', 'if(c.stage==0){if(phase=="validate"){if(c.seq>=3)throw runtime_error("Unexpected fourth validation request");c.key=c.seq==0?0:c.seq==1?keys/2:keys-1;c.seq++;}else{c.key=rng()%keys;c.seq++;c.slot=rng()%256;}}')
        s=s.replace('next=now<start_ns+uint64_t(seconds*1e9);','next=phase=="validate"?c.seq<3:now<start_ns+uint64_t(seconds*1e9);')
        s=s.replace('result<<"},\\"operations_per_second\\":[";', 'result<<"}";if(phase=="validate")result<<",\\"validation_keys\\":[0,"<<keys/2<<","<<keys-1<<"]";result<<",\\"operations_per_second\\":[";')
    # A signal never bypasses an in-flight second half. Only stop at full-operation boundaries.
    s=s.replace('next=c.loadkey<keys;','next=c.loadkey<keys&&!b8::interrupted;')
    s=s.replace('next=now<start_ns+uint64_t(seconds*1e9);','next=!b8::interrupted&&now<start_ns+uint64_t(seconds*1e9);')
    s=s.replace('next=phase=="validate"?c.seq<3:now<start_ns+uint64_t(seconds*1e9);','next=!b8::interrupted&&(phase=="validate"?c.seq<3:now<start_ns+uint64_t(seconds*1e9));')
    s=s.replace('stol(r.value)!=expected','b8::integer(r.value)!=expected').replace('stod(r.value);','b8::numeric(r.value);')
    # Every output has an explicit fixed data shape and successful-interruption marker.
    s=s.replace('<<"{\\"op\\":\\""<<op','<<"{"<<b8::metadata(op,prefix,threads,seed,b8::test_mode(opts))<<"\\"op\\":\\""<<op')
    if name=='bench_hash.cpp':
        s=s.replace('<<",\\"threads\\":"<<threads<<",\\"seed\\":"<<seed','')
        s=s.replace('<<",\\"prefix\\":\\""<<prefix<<"\\",\\"elapsed_seconds\\":"','<<",\\"elapsed_seconds\\":"')
    s=s.replace('}return 0;','}return b8::interrupted?130:0;')
    if name!='bench_hash.cpp':
        s=s.replace('ofstream f(opts["--out"]);f<<result.str();','ofstream f(opts["--out"]);if(!f)throw runtime_error("Cannot open output");f<<result.str();if(!f)throw runtime_error("Cannot write output");')
    (HERE/name).write_text(s)
    manifest[name]={'source':str(p.relative_to(ROOT)),'source_sha256':hashlib.sha256(raw).hexdigest(),'derived_sha256':hashlib.sha256(s.encode()).hexdigest(),'allowed_ops':ops[name]}
(HERE/'source-manifest.json').write_text(json.dumps({'source_clients':manifest,'shape':'8192-byte logical payload, fixed per client','score_semantics':'ZINCRBY +/-32768, ZADD sequence%32768 unchanged'},indent=2)+'\n')
