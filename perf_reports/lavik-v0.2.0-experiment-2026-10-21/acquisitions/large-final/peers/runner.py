#!/usr/bin/env python3
"""Fresh v0.2.0 comparison peers, preserving the October 14 workload.

Run one stage at a time on the dedicated benchmark server. The raw stages
require --allow-clear-benchmark-disks and erase only the six checked NVMe disks.
All logs and datasets created here have a new, dedicated output directory.
"""
import argparse, contextlib, hashlib, json, os, pathlib, re, resource, shlex
import signal, socket, subprocess as sp, sys, time, urllib.request
R = pathlib.Path(__file__).resolve().parent
S = '10.96.1.4'; CLIENT = 'azureuser@10.96.0.5'; PORT = 6379
REMOTE = '/opt/bench020/peer-client-results'
CLI = '/usr/bin/redis-cli'
LAVIK = pathlib.Path('/opt/bench020/downloads/lavik-v0.2.0-linux-x86_64/lavik')
# Filesystem identity is checked by provision.py before any peer runs.
CONNECTIONS = [160,320,640,1280]
INFO_SECTIONS = ['SERVER','MEMORY','STATS']
resource.setrlimit(resource.RLIMIT_NOFILE,(65535,65535))

def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj,indent=2)+'\n')
def event(message):
    print(time.strftime('%Y-%m-%d %H:%M:%S UTC',time.gmtime()),message,flush=True)
    write(R/'status.json',{'time':time.time(),'message':message,'pid':os.getpid()})
def run(args, **kw):
    return sp.run([str(x) for x in args],check=True,**kw)
def out(args, **kw):
    return sp.check_output([str(x) for x in args],text=True,**kw).strip()
def ssh(command, **kw):
    return run(['sudo','-u','azureuser','ssh','-i','/opt/bench020/client-control','-o','BatchMode=yes','-o','UserKnownHostsFile=/opt/bench020/client-known-hosts',CLIENT,command],**kw)
def cli(*args):
    if args==('INFO','ALL') and INFO_SECTIONS:
        return '\n'.join(cli('INFO',section) for section in INFO_SECTIONS)
    return out([CLI,'-h',S,'-p',PORT,'--raw',*args],timeout=120)
def snapshot(path, pid=None):
    d={'time':time.time(),'clock_ticks':os.sysconf('SC_CLK_TCK')}
    for f in ['stat','meminfo','diskstats','interrupts','net/dev','net/softnet_stat','softirqs']:
        d[f]=pathlib.Path('/proc/'+f).read_text()
    d['irq_affinity']={str(p):p.read_text().strip() for p in pathlib.Path('/proc/irq').glob('*/smp_affinity_list')}
    if pid:
        for f in ['stat','status','io']:
            with contextlib.suppress(FileNotFoundError): d['process_'+f]=pathlib.Path(f'/proc/{pid}/{f}').read_text()
        d['threads']={t.name:sorted(os.sched_getaffinity(int(t.name))) for t in pathlib.Path(f'/proc/{pid}/task').iterdir()}
        d['info']=cli('INFO','ALL')
        
    write(path,d)
def validate(keys):
    event('checking sampled value lengths')
    d={'lengths':{str(k):cli('STRLEN',str(k)) for k in [1,2,keys//2,keys-1,keys]}}
    if set(d['lengths'].values()) != {'1024'}:
        raise RuntimeError('Dataset validation failed: '+str(d))
    return d

def memtier(directory, name, keys, kind, connections=640, seconds=30, pid=None, threads=32):
    if (R/'STOP').exists():raise RuntimeError('Stop requested')
    directory.mkdir(parents=True,exist_ok=True)
    relative=directory.relative_to(R).as_posix()+'/'+name
    remote_path=REMOTE+'/'+relative
    assert connections%threads==0
    args=['taskset','-c','0-31','memtier_benchmark','--server='+S,'--port='+str(PORT),'--protocol=redis',
          '--threads='+str(threads),'--clients='+str(connections//threads),'--pipeline=1', '--key-minimum=1','--key-maximum='+str(keys),
          '--key-prefix=','--data-size=1024','--hide-histogram','--print-percentiles=50,99,99.9,99.99','--show-config',
          '--json-out-file='+remote_path+'.json']
    if kind=='fill':
        assert keys%connections==0
        args+=['--requests='+str(keys//connections),'--ratio=1:0','--key-pattern=P:P']
    else:
        args+=['--test-time='+str(seconds),'--command='+('GET __key__' if kind=='GET' else 'SET __key__ __data__'),'--command-key-pattern=R']
        if kind=='GET': args+=['--command-is-read']
    # Independent streams are essential for a disk-backed working set: cloned
    # default seeds make clients revisit the same small sequence and inflate
    # cache locality. Keep the archived 10M-key methodology unchanged.
    if keys==10**9 and kind!='fill':args+=['--distinct-client-seed']
    write(directory/(name+'.command.json'),args)
    if pid:snapshot(directory/(name+'.before.json'),pid)
    event(relative)
    t=time.time()
    command='mkdir -p '+shlex.quote(str(pathlib.PurePosixPath(remote_path).parent))+'; ulimit -n 65535; exec '+shlex.join(args)
    with (directory/(name+'.txt')).open('w') as f:
        ssh(command,stdout=f,stderr=sp.STDOUT,timeout=172800)
    with (directory/(name+'.json')).open('w') as f:
        ssh('cat '+shlex.quote(remote_path+'.json'),stdout=f)
    write(directory/(name+'.timing.json'),{'start':t,'end':time.time()})
    stats=json.loads((directory/(name+'.json')).read_text())['ALL STATS']
    assert stats['Totals']['Connection Errors']==0, 'Connection errors'
    assert str(stats['Runtime']['Interrupted']).lower()=='false', 'Interrupted client'
    if kind=='fill':assert stats['Totals']['Count']==keys, 'Incomplete fill'
    body=(directory/(name+'.txt')).read_text().replace('\r','\n')
    totals=[line.split() for line in body.splitlines() if line.startswith('Totals')]
    if len(totals)!=1 or len(totals[0])!=10:raise RuntimeError('Bad totals: '+relative)
    if re.search(r'error response|connection error|error:|OOM command',body,re.I):raise RuntimeError('Client errors: '+relative)
    if kind=='GET':
        gets=[line.split() for line in body.splitlines() if line.startswith('Gets')]
        if len(gets)!=1 or float(gets[0][3])!=0 or abs(float(gets[0][1])-float(gets[0][2]))>.01:raise RuntimeError('GET misses: '+relative)
    if pid:snapshot(directory/(name+'.after.json'),pid)
    row=totals[0]
    result={'name':relative,'kind':kind,'keys':keys,'connections':connections,'qps':float(row[1]),
            'avg_ms':float(row[4]),'p50_ms':float(row[5]),'p99_ms':float(row[6]),'p999_ms':float(row[7]),'p9999_ms':float(row[8])}
    write(directory/(name+'.result.json'),result)
    event(relative+' done: '+str(round(result['qps']))+' QPS, p999='+str(result['p999_ms'])+' ms')
    return result

@contextlib.contextmanager
def server(args, directory, env=None, cwd=None):
    directory.mkdir(parents=True,exist_ok=True)
    try:
        with socket.create_connection((S,PORT),timeout=1):raise RuntimeError('Benchmark port already occupied')
    except ConnectionRefusedError:pass
    args=['taskset','-c','0-15',*[str(x) for x in args]]
    write(directory/'server-command.json',args)
    event('starting '+str(args[3]))
    with (directory/'server.log').open('a') as f:
        p=sp.Popen(args,stdout=f,stderr=sp.STDOUT,env=env,cwd=cwd)
    write(R/'active-server.json',{'pid':p.pid,'command':args,'directory':str(directory)})
    try:
        deadline=time.monotonic()+600
        while time.monotonic()<deadline:
            if p.poll() is not None:raise RuntimeError('Server exited: '+str(directory))
            try:
                if cli('PING')=='PONG':break
            except sp.SubprocessError:pass
            time.sleep(.5)
        else:raise TimeoutError('Server startup')
        yield p.pid
    finally:
        requested_stop = p.poll() is None
        if requested_stop:
            p.send_signal(signal.SIGTERM)
            try:p.wait(timeout=300)
            except sp.TimeoutExpired:
                raise RuntimeError('Server did not shut down cleanly; left running for inspection, no SIGKILL')
        (directory/'exit-code.txt').write_text(str(p.returncode)+'\n')
        (R/'active-server.json').unlink(missing_ok=True)
        expected_garnet_stop = requested_stop and pathlib.Path(args[3]).name == 'GarnetServer' and p.returncode == -signal.SIGTERM
        if p.returncode != 0 and not expected_garnet_stop:raise RuntimeError('Server exit code '+str(p.returncode))

M=pathlib.Path('/mnt/bench020')
KEYS=10**9
PRODUCTS=['dragonfly','garnet','kvrocks','pika','tendis']

def setup(product,smoke):
    global KEYS
    KEYS=100000 if smoke else 10**9
    prefix=M/('smoke' if smoke else 'data')
    prefix.mkdir(exist_ok=True)
    data=prefix/('keydb-flash' if product=='keydb' else product)
    data.mkdir(exist_ok=False)
    directory=R/('smoke' if smoke else 'results')/product
    assert not (directory/'COMPLETE').exists()
    directory.mkdir(parents=True,exist_ok=True)
    env=None;cwd=None
    if product=='dragonfly':
        binary=R/'downloads/dragonfly/dragonfly-x86_64'
        args=[binary,'--logtostderr','--bind='+S,'--proactor_threads=16','--maxmemory=96GB',
              '--dir='+str(data),'--dbfilename=','--tiered_prefix='+str(data/'tier'),
              '--tiering_disk_storage_initial_size=64GB','--tiered_max_file_size=2TB',
              '--backing_file_direct=false','--tiered_offload_threshold=1.0',
              '--tiered_experimental_cooling=false','--tiered_max_pending_stash_bytes=16MB']
    elif product=='garnet':
        cwd=str(R/'downloads/garnet/net10.0');binary=pathlib.Path(cwd)/'GarnetServer'
        env=dict(os.environ,DOTNET_ROOT=str(R/'dotnet'),DOTNET_CLI_TELEMETRY_OPTOUT='1',LD_LIBRARY_PATH=cwd)
        args=[binary,'--bind',S,'--protected-mode','false','--memory','64g','--page','4m','--segment','1g',
              '--index','16g','--index-max-size','16g','--storage-tier','--logdir',data/'log',
              '--checkpointdir',data/'checkpoints','--readcache','--readcache-memory','32g','--readcache-page','4m',
              '--no-obj','--no-pubsub','--device-type','Native','--device-io-backend','Libaio',
              '--device-completion-threads','4','--device-throttle-limit','512','--initial-io-record-size','8k',
              '--compaction-freq','300','--compaction-type','Lookup','--compaction-force-delete',
              '--network-connection-limit','10000','--minthreads','16','--miniothreads','16','--logger-level','Warning']
        write(directory/'server-env.json',{k:env[k] for k in ['DOTNET_ROOT','DOTNET_CLI_TELEMETRY_OPTOUT','LD_LIBRARY_PATH']})
    else:
        binary={'kvrocks':R/'sources/kvrocks/build/kvrocks', 'pika':R/'downloads/pika/bin/pika',
                'tendis':R/'downloads/tendis/tendisplus-2.8.4-rocksdb-v8.5.3/bin/tendisplus',
                'keydb':R/'sources/KeyDB/src/keydb-server'}[product]
        config=(R/'configs'/f'{product}.conf').read_text().replace(str(M)+'/',str(prefix)+'/')
        cfg=directory/'server.conf';cfg.write_text(config)
        if product=='pika':
            for d in ['db','log','dump','dbsync']:(data/d).mkdir()
        if product=='tendis':
            for d in ['db','log','dump']:(data/d).mkdir()
        args=[binary,*(['-c'] if product in ['kvrocks','pika'] else []),cfg]
    write(directory/'binary.json',{'path':str(binary),'sha256':hashlib.file_digest(binary.open('rb'),'sha256').hexdigest()})
    return args,directory,data,env,cwd

def reclamation(product,directory,phase):
    commands={'garnet':[('CONFIG','GET','compaction-type')], 'kvrocks':[('CONFIG','GET','rocksdb.disable_auto_compactions'),('CONFIG','GET','rocksdb.enable_blob_garbage_collection')],
              'pika':[('CONFIG','GET','disable_auto_compactions')],'keydb':[('INFO','memory')],
              'dragonfly':[('INFO','tiered')],'tendis':[('CONFIG','GET','rocks.disable_auto_compactions'),('CONFIG','GET','rocks.enable_blob_garbage_collection')]}
    values={" ".join(c):cli(*c) for c in commands[product]}
    write(directory/(phase+'-reclamation.json'),values)
    if product=='garnet':assert values['CONFIG GET compaction-type'].splitlines()==['compaction-type','Lookup']
    if product=='kvrocks':
        assert values['CONFIG GET rocksdb.disable_auto_compactions'].splitlines()[-1] in ['no','false','0']
        assert values['CONFIG GET rocksdb.enable_blob_garbage_collection'].splitlines()[-1] in ['yes','true','1']
    if product=='pika':assert values['CONFIG GET disable_auto_compactions'].splitlines()[-1] in ['no','false','0']
    if product=='keydb':assert 'storage_provider:flash' in values['INFO memory']

def acquire(product,smoke=False):
    args,directory,data,env,cwd=setup(product,smoke)
    with server(args,directory,env,cwd) as pid:
        reclamation(product,directory,'before-fill')
        memtier(directory,'fill',KEYS,'fill',connections=160 if smoke else 640,pid=pid)
        write(directory/'validation-before.json',validate(KEYS))
        if not smoke and product in ['dragonfly','garnet']:
            memtier(directory,'warmup',KEYS,'GET',connections=160,seconds=180,pid=pid,threads=32)
        for op in ['GET','SET']:
            for c in ([80] if smoke else CONNECTIONS):
                reclamation(product,directory,f'{op.lower()}-c{c}-before')
                memtier(directory,f'{op.lower()}-c{c}',KEYS,op,c,3 if smoke else 60,pid)
        write(directory/'validation-after.json',validate(KEYS))
        reclamation(product,directory,'after-sweep')
    if re.search(r'ProcessMessages threw an exception|DllNotFoundException|OutOfMemoryException|AddressSanitizer|Assertion.*failed', (directory/'server.log').read_text(errors='replace')):
        raise RuntimeError('Server runtime error: '+product)
    (directory/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
    event('COMPLETE '+str(directory.relative_to(R)))

if __name__=='__main__':
    import fcntl
    lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    parser=argparse.ArgumentParser();parser.add_argument('product',choices=PRODUCTS+['all']);parser.add_argument('--smoke',action='store_true');opts=parser.parse_args()
    try:
        assert out(['findmnt','-n','-o','FSTYPE','--target',M])=='xfs'
        for product in (PRODUCTS if opts.product=='all' else [opts.product]):
            if (R/('smoke' if opts.smoke else 'results')/product/'COMPLETE').exists():
                event('Skipping completed '+product); continue
            acquire(product,opts.smoke)
        if opts.product=='all':(R/('SMOKE_COMPLETE' if opts.smoke else 'COMPLETE')).write_text(time.strftime('%FT%TZ',time.gmtime()))
    except BaseException as e:
        write(R/'failure.json',{'time':time.time(),'error':repr(e)});raise
