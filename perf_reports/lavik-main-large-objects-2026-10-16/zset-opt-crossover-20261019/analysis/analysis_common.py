#!/usr/bin/env python3
"""Validate the ZSet crossover observations offline; never runs a benchmark.

--partial accepts a completed prefix of the fixed eight-point sequence. Incomplete
points remain pending, and any failed validation prevents output publication.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path

NET_FIELDS = 'rx_bytes rx_packets rx_errors rx_dropped rx_fifo rx_frame rx_compressed rx_multicast tx_bytes tx_packets tx_errors tx_dropped tx_fifo tx_collisions tx_carrier tx_compressed'.split()

def jload(path):
    return json.loads(Path(path).read_text())

def jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]

def network(raw):
    out={}
    for line in (raw or '').splitlines():
        if ':' not in line:continue
        nic,values=line.split(':',1);v=values.split()
        if len(v)>=16:out[nic.strip()]=dict(zip(NET_FIELDS,map(int,v[:16])))
    return out

def cpu_state(raw):
    line=next((l for l in (raw or '').splitlines()if l.startswith('cpu ')),None)
    if line is None:return None
    return dict(zip('user nice system idle iowait irq softirq steal guest guest_nice'.split(),map(int,line.split()[1:])))

def process_fields(sample):
    if 'process_stat_fields' in sample:return sample['process_stat_fields']
    raise ValueError('monitor sample has no process_stat_fields')

def monitor(path,nic):
    if not path.exists():return {'available':False,'valid':False,'reason':'missing_monitor','path':str(path)}
    rows=jsonl(path);metas=[r for r in rows if r.get('event')=='metadata'];summaries=[r for r in rows if r.get('event')=='summary'];samples=[r for r in rows if r.get('event')=='sample']
    errors=[]
    if not metas or len(samples)<2:return {'available':True,'valid':False,'reason':'missing_metadata_or_samples','path':str(path)}
    completed=bool(summaries and summaries[-1].get('completed'))
    if not completed:errors.append('monitor_not_completed')
    hz=metas[0]['clock_ticks_per_second'];a,b=samples[0],samples[-1];dt=(b['monotonic_ns']-a['monotonic_ns'])/1e9
    if dt<=0 or hz<=0:return {'available':True,'valid':False,'reason':'invalid_time_or_HZ','path':str(path)}
    pa,pb=process_fields(a),process_fields(b)
    if pa['start_ticks']!=pb['start_ticks']or a['pid']!=b['pid']:errors.append('process_identity_changed')
    user=(pb['utime_ticks']-pa['utime_ticks'])/hz;system=(pb['stime_ticks']-pa['stime_ticks'])/hz
    if min(user,system)<0:errors.append('process_cpu_counter_decreased')
    ta={t['tid']:t for t in a['tasks']if 'stat_fields'in t};tb={t['tid']:t for t in b['tasks']if 'stat_fields'in t};threads=[]
    for tid in sorted(ta.keys()&tb.keys()):
        x,y=ta[tid]['stat_fields'],tb[tid]['stat_fields']
        if x['start_ticks']!=y['start_ticks']:errors.append(f'thread_identity_changed:{tid}');continue
        u=(y['utime_ticks']-x['utime_ticks'])/hz;s=(y['stime_ticks']-x['stime_ticks'])/hz
        if min(u,s)<0:errors.append(f'thread_cpu_counter_decreased:{tid}');continue
        cpus=sorted({t['stat_fields']['processor']for row in samples for t in row['tasks']if t['tid']==tid and t.get('stat_fields',{}).get('processor') is not None})
        threads.append({'tid':tid,'comm':tb[tid].get('comm',y.get('comm')),'cpus_seen':cpus,'user_seconds':u,'system_seconds':s,'cpu_seconds':u+s,'cpu_fraction':(u+s)/dt,'cpu_percent':100*(u+s)/dt})
    threads.sort(key=lambda r:-r['cpu_seconds'])
    na,nb=network(a.get('netdev')),network(b.get('netdev'));nics={}
    for name in sorted(na.keys()&nb.keys()):
        delta={field:nb[name][field]-na[name][field]for field in NET_FIELDS}
        if any(x<0 for x in delta.values()):nics[name]={'valid':False,'reason':'counter_decreased'};continue
        nics[name]={'valid':True,'rx_mbps':delta['rx_bytes']*8/dt/1e6,'tx_mbps':delta['tx_bytes']*8/dt/1e6,'counter_delta':delta}
    if nic not in nics or not nics[nic].get('valid'):errors.append(f'selected_nic_unavailable:{nic}')
    ca,cb=cpu_state(a.get('procstat')),cpu_state(b.get('procstat'));host={}
    if ca and cb:
        delta={k:cb[k]-ca[k]for k in list(ca)[:8]};total=sum(delta.values())
        if total>0 and min(delta.values())>=0:host={'counter_delta':delta,'percent':{k:v*100/total for k,v in delta.items()}}
    return {'available':True,'valid':not errors,'path':str(path),'completed':completed,'errors':errors,
            'pid':a['pid'],'start_ticks':pa['start_ticks'],'first_sample_time':a['time'],'last_sample_time':b['time'],'elapsed_seconds':dt,'sample_count':len(samples),'HZ':hz,
            'user_seconds':user,'system_seconds':system,'cpu_seconds':user+system,'cpu_cores':(user+system)/dt,
            'thread_cpu_cores_sum':sum(t['cpu_fraction']for t in threads),'threads':threads,
            'selected_nic':nic,'selected_nic_rates':nics.get(nic),'interfaces':nics,'host_cpu':host,
            'read_error_samples':sum(bool(row.get('read_errors'))for row in samples)}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def marker(path):
    if not path.is_file():
        raise FileNotFoundError(path)


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def snmp_tcp(raw):
    lines = (raw or '').splitlines()
    for index in range(len(lines) - 1):
        header, values = lines[index].split(), lines[index + 1].split()
        if header and values and header[0] == values[0] == 'Tcp:' and 'RetransSegs' in header:
            require(len(header) == len(values), 'TCP SNMP field count mismatch')
            return {key: int(value) for key, value in zip(header[1:], values[1:])}
    raise ValueError('TCP RetransSegs missing from monitor SNMP sample')


def observation(root, side, label, identity, timing):
    directory = root / side / 'observations' / label
    marker(directory / 'COMPLETE')
    recorded = jload(directory / 'identity.json')
    require(recorded['pid'] == identity['pid'] and
            str(recorded['start_ticks']) == str(identity['start_ticks']) and
            recorded['exe'] == identity['binary'] and
            recorded['seconds'] == 45 and recorded['profile'] is False,
            f'{label}/{side}: observer identity or mode mismatch')
    codes = jload(directory / 'exit-status.json')
    require(codes and all(code == 0 for code in codes), f'{label}/{side}: observer failed')
    path = directory / 'monitor.jsonl'
    measured = monitor(path, 'eth1' if side == 'server' else 'eth0')
    require(measured['valid'] and measured['read_error_samples'] == 0,
            f'{label}/{side}: invalid monitor: {measured}')
    require(measured['pid'] == identity['pid'] and
            str(measured['start_ticks']) == str(identity['start_ticks']),
            f'{label}/{side}: monitor identity mismatch')
    rows = jsonl(path)
    samples = [row for row in rows if row.get('event') == 'sample']
    require(all(row['pid'] == identity['pid'] and
                str(row['process_stat_fields']['start_ticks']) == str(identity['start_ticks'])
                for row in samples), f'{label}/{side}: process changed within observation')
    require(44 <= measured['elapsed_seconds'] <= 55,
            f'{label}/{side}: unexpected monitor duration')
    require(timing['start'] <= samples[0]['time'] < samples[-1]['time'] <= timing['end'],
            f'{label}/{side}: monitor outside execution window')
    first, last = snmp_tcp(samples[0].get('snmp')), snmp_tcp(samples[-1].get('snmp'))
    retrans = last['RetransSegs'] - first['RetransSegs']
    outgoing = last['OutSegs'] - first['OutSegs']
    require(retrans >= 0 and outgoing >= 0, f'{label}/{side}: TCP counter decreased')
    measured['tcp'] = {
        'scope': 'host-wide TCP, first-to-last monitor sample',
        'retrans_segments_delta': retrans,
        'retrans_segments_per_second': retrans / measured['elapsed_seconds'],
        'out_segments_delta': outgoing,
        'retrans_to_out_segments_percent': 100 * retrans / outgoing if outgoing else None,
    }
    return measured


def metric(value, elapsed, context):
    require(set(METRIC_KEYS) <= set(value), f'{context}: missing metric fields')
    require(type(value['count']) is int and value['count'] > 0,
            f'{context}: invalid completed count')
    for key in METRIC_KEYS:
        require(type(value[key]) in (int, float) and math.isfinite(value[key]) and value[key] >= 0,
                f'{context}: invalid {key}')
    # The client prints elapsed seconds and QPS with six decimal places.
    # Compare their rounding intervals rather than a fixed relative tolerance:
    # a short load can have a larger relative elapsed-rounding error.
    from decimal import Decimal, localcontext
    with localcontext() as precision:
        precision.prec = 50
        half_unit = Decimal('0.0000005')
        reported_time = Decimal(str(elapsed))
        reported_qps = Decimal(str(value['qps']))
        count = Decimal(value['count'])
        require(reported_time > 0 and reported_qps > 0,
                f'{context}: invalid rounded elapsed/QPS')
        minimum = max(Decimal(0), reported_time - half_unit) * max(Decimal(0), reported_qps - half_unit)
        maximum = (reported_time + half_unit) * (reported_qps + half_unit)
        require(minimum <= count <= maximum,
                f'{context}: QPS does not match count/elapsed rounding intervals')
    require(value['p50_ms'] <= value['p99_ms'] <= value['p999_ms'] <= value['max_ms'] and
            value['avg_ms'] <= value['max_ms'], f'{context}: invalid latency ordering')
    return {key: value[key] for key in METRIC_KEYS}


METRIC_KEYS = ('count', 'qps', 'avg_ms', 'p50_ms', 'p99_ms', 'p999_ms', 'max_ms')
