"""Build and validate the pinned grouped-optimization plus PR #357 stack.

Every source/build/test-data tree belongs to this new experiment. No existing
server controller, benchmark data or previous binary is opened or changed.
"""
from pathlib import Path, PurePosixPath
import concurrent.futures
import fcntl
import hashlib
import json
import os
import resource
import signal
import subprocess as sp
import tarfile
import time
import traceback
import xml.etree.ElementTree as ET

R = Path('/mnt/dev/benchmark/compact-pr357-stack-20261019')
PREVIOUS = R.parent / 'zset-compact-20261019'
D = R.parent / 'pr342-packed-20261017'
MAIN = '684894d973878ca0e0649b54404ce77521f1695f'
CANDIDATE = 'd0084f4a9a869e38ab91ecef6291a89483940123'
OPTIMIZATION_BASE = '001442e89129468d974cef8c30f8b70ad249f80a'
PR357 = '48ca16c10680899a81b31a6e6c16c54a2d21a666'
BYCORF = '86d686724ddd1c5617fb1b62f8131e05571e8423'
GROUPS = ('GroupedCollectionTest', 'GroupedSortedRewriteTest', 'GroupedHashTest',
          'HashGroupPointProbe', 'HashGroupEdits', 'CompactHashEdit', 'OrderedCompactCodecTest')
UNIT_FILTER = ':'.join(group + '.*' for group in GROUPS)
DEMOTION = 'GroupedDemotionE2e.StringListSetSortedSetGeoAndStreamRecoverCompact'
EXCLUDED = 'GroupedSortedSetWriteE2e.AggregateAbove512MiBRemainsBoundedAndRecovers'
E2E_FILTER = 'GroupedSortedSetWriteE2e.*:' + DEMOTION + '-' + EXCLUDED
COMPACT_GROUPS = ('CompactStringWriteE2e', 'CompactPointWriteE2e',
                  'SmallTypes/CompactCollectionWriteE2e')
COMPACT_FILTER = ':'.join(group + '.*' for group in COMPACT_GROUPS)
ENV = {key: value for key, value in os.environ.items()
       if not key.startswith(('LAVIK_', 'BYCORF_', 'MIMALLOC_', 'GTEST_'))}
ENV.update(GOPATH='/home/azureuser/go', GOCACHE='/mnt/dev/benchmark/go-build-cache',
           TARGET_ARCHITECTURE='x86-64-v2', LAVIK_TEST_DATA_DIR=str(R / 'test-data'))
COMMON = ['-G', 'Ninja', '-DCMAKE_C_COMPILER=/usr/bin/gcc-13',
          '-DCMAKE_CXX_COMPILER=/usr/bin/g++-13', '-DLAVIK_MARCH=x86-64-v2']
OWNED = False


def require(value, message):
    if not value:
        raise RuntimeError(message)


def sha(path):
    with Path(path).open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def utc():
    return time.strftime('%FT%TZ', time.gmtime())


def save(name, value):
    with (R / name).open('x') as target:
        target.write(json.dumps(value, indent=2) + '\n')


def run(args, name, timeout=7200):
    record = {'args': list(map(str, args)), 'started': utc(), 'cwd': str(R),
              'environment': {key: ENV[key] for key in
                              ('GOPATH', 'GOCACHE', 'TARGET_ARCHITECTURE', 'LAVIK_TEST_DATA_DIR')}}
    save(name + '-command.json', record)
    print(record['started'], name, flush=True)
    with (R / (name + '.log')).open('x') as log:
        process = sp.Popen(record['args'], cwd=R, env=ENV, stdout=log,
                           stderr=sp.STDOUT, start_new_session=True)
        record['pid'] = process.pid
        try:
            code = process.wait(timeout=timeout)
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=60)
                except sp.TimeoutExpired:
                    record['cleanup'] = 'SIGTERM timed out; inspect owned process group'
            record.update(returncode=process.poll(), ended=utc(), exception=traceback.format_exc())
            save(name + '-exit.json', record)
            raise
    record.update(returncode=code, ended=utc(), log=str(R / (name + '.log')),
                  log_sha256=sha(R / (name + '.log')))
    save(name + '-exit.json', record)
    require(code == 0, name + ' failed; inspect preserved log before retrying')
    return record


def extract(archive, target):
    require(target.is_absolute() and target.is_relative_to(R / 'sources'), 'Unexpected source target')
    with tarfile.open(archive, 'r:gz') as bundle:
        entries = bundle.getmembers()
        require(entries, 'Empty source archive')
        prefix = PurePosixPath(entries[0].name).parts[0]
        for entry in entries:
            path = PurePosixPath(entry.name)
            require(not path.is_absolute() and '..' not in path.parts and path.parts[0] == prefix,
                    'Unsafe/multiple-root source archive')
            require(entry.isfile() or entry.isdir() or entry.issym(), 'Unexpected archive entry type')
            if entry.issym():
                link = PurePosixPath(entry.linkname)
                require(not link.is_absolute(), 'Absolute source symlink')
    target.mkdir(parents=True, exist_ok=False)
    sp.run(['tar', 'xzf', str(archive), '-C', str(target), '--strip-components=1'], check=True)


def prepare_source(variant, label, manifest):
    tree = R / 'sources' / label
    extract(R / variant['archive'], tree)
    for dep in manifest['dependencies']:
        target = tree / dep['path']
        require(target.is_relative_to(tree) and '..' not in Path(dep['path']).parts,
                'Dependency path escapes source')
        if target.exists():
            require(target.is_dir() and not target.is_symlink() and not any(target.iterdir()),
                    'Nonempty dependency placeholder')
            target.rmdir()
        extract(Path(dep['archive_root']) / dep['archive'], target)
    return tree


def build(tree, label, revision, production):
    directory = tree / ('build-gcc13' if production else 'build-test')
    cfg = ['cmake', '-S', str(tree), '-B', str(directory), *COMMON]
    if production:
        cfg += ['-DCMAKE_BUILD_TYPE=Release', '-DLAVIK_ENABLE_OPT=ON',
                '-DLAVIK_KERNEL_BYPASS=ON', '-DBUILD_TESTING=OFF',
                '-DBYCORF_SPDK_C_COMPILER=/usr/bin/gcc-13',
                '-DBYCORF_SPDK_CXX_COMPILER=/usr/bin/g++-13']
        targets = ['lavik']
    else:
        cfg += ['-DCMAKE_BUILD_TYPE=Debug', '-DLAVIK_ENABLE_OPT=OFF',
                '-DLAVIK_KERNEL_BYPASS=OFF', '-DBUILD_TESTING=ON',
                '-DFETCHCONTENT_SOURCE_DIR_GOOGLETEST=' + str(D / 'test-deps/googletest')]
        targets = ['lavik', 'lavik_unit_tests', 'lavik_grouped_ordered_write_e2e_test',
                   'lavik_compact_collection_write_e2e_test']
    configure = run(cfg, label + '-configure')
    compiled = run(['cmake', '--build', str(directory), '--parallel', '8', '--target', *targets],
                   label + '-build')
    record = {'revision': revision, 'binary': str(directory / 'lavik'),
              'sha256': sha(directory / 'lavik'), 'configure': cfg,
              'cmake_cache': (directory / 'CMakeCache.txt').read_text(),
              'source_tree': str(tree), 'configure_command': configure, 'build_command': compiled}
    save(label + '-build-result.json', record)
    return record


def test_result(name, groups, expected):
    xml = R / (name + '.xml')
    require(xml.is_file(), 'Missing test XML: ' + name)
    root = ET.parse(xml).getroot()
    cases = list(root.iter('testcase'))
    require(root.tag == 'testsuites' and len(cases) == int(root.attrib['tests']) and len(cases) == expected,
            'Unexpected test inventory: ' + name)
    require(all(int(root.attrib.get(key, 0)) == 0 for key in ('failures', 'errors', 'disabled')) and
            not list(root.iter('failure')) and not list(root.iter('skipped')) and
            all(case.get('status') == 'run' and case.get('result') == 'completed' for case in cases),
            'Failed/skipped tests: ' + name)
    require(all(any(case.get('classname') == group for case in cases) for group in groups),
            'Requested suite absent: ' + name)
    return {'xml': str(xml), 'xml_sha256': sha(xml), 'results': root.attrib,
            'test_names': [case.get('classname') + '.' + case.get('name') for case in cases]}


def main():
    global OWNED
    require(os.geteuid() == 0 and Path(__file__).resolve().parent == R,
            'Run as root from exact new experiment directory')
    require(os.uname().release == '6.17.0-1022-azure', 'Unexpected server kernel')
    lock = (R / 'build.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    require(not any((R / path).exists() for path in
                    ('BUILD_STARTED', 'sources', 'BUILD_COMPLETE', 'build-failure.json')),
            'Prior attempt exists; inspect it instead of rerunning')
    manifest = json.loads((R / 'source-manifest.json').read_text())
    require(manifest['base_revision'] == MAIN and
            {label: entry['revision'] for label, entry in manifest['variants'].items()} ==
            {'candidate': CANDIDATE} and
            manifest['optimization_base_revision'] == OPTIMIZATION_BASE and
            manifest['stacked_pull_request']['head_revision'] == PR357 and
            manifest['stacked_pull_request']['base_revision'] == MAIN,
            'Source revisions changed')
    require(next(dep['sha'] for dep in manifest['dependencies'] if dep['path'] == 'bycorf') == BYCORF,
            'Unexpected Bycorf dependency')
    for entry in manifest['variants'].values():
        require(Path(entry['archive']).name == entry['archive'] and
                sha(R / entry['archive']) == entry['archive_sha256'], 'Source archive mismatch')
    for entry in manifest['dependencies']:
        require(entry['archive_root'] in (str(PREVIOUS), str(D)) and
                Path(entry['archive']).name == entry['archive'] and
                sha(Path(entry['archive_root']) / entry['archive']) == entry['archive_sha256'],
                'Dependency archive mismatch: ' + entry['path'])
    with (R / 'BUILD_STARTED').open('x') as target:
        target.write(utc() + '\n')
    OWNED = True
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, 65535))
    resource.setrlimit(resource.RLIMIT_MEMLOCK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
    (R / 'test-data').mkdir(exist_ok=False)
    trees = {label: prepare_source(entry, label, manifest) for label, entry in manifest['variants'].items()}
    trees['test'] = prepare_source(manifest['variants']['candidate'], 'test', manifest)
    save('prepared-sources.json', {'source_manifest_sha256': sha(R / 'source-manifest.json'),
                                 'source': manifest, 'trees': {key: str(value) for key, value in trees.items()}})
    # Limit aggregate compilation to sixteen jobs; all source and generated
    # dependency trees are independent, with no writable hardlinks or symlinks.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {label: pool.submit(build, trees[label], label, manifest['variants'][label]['revision'], True)
                   for label in ('candidate',)}
        futures['test'] = pool.submit(build, trees['test'], 'test', CANDIDATE, False)
        builds = {label: future.result() for label, future in futures.items()}
    require(not sp.check_output(['ss', '-H', '-ltn', 'sport = :6379'], text=True).strip(),
            'Benchmark listener active before isolated tests; do not overlap measurements')
    directory = trees['test'] / 'build-test'
    units_command = run([str(directory / 'lavik_unit_tests'), '--gtest_filter=' + UNIT_FILTER,
                         '--gtest_output=xml:' + str(R / 'candidate-unit-tests.xml')], 'candidate-unit-tests', 1800)
    units = test_result('candidate-unit-tests', GROUPS, 128)
    units['command'] = units_command
    compact_command = run([str(directory / 'lavik_compact_collection_write_e2e_test'),
                           str(directory / 'lavik'), '--gtest_filter=' + COMPACT_FILTER,
                           '--gtest_output=xml:' + str(R / 'candidate-compact-tests.xml')],
                          'candidate-compact-tests', 1800)
    compact = test_result('candidate-compact-tests', COMPACT_GROUPS, 13)
    compact['command'] = compact_command
    require('CompactPointWriteE2e.MixedEightKiBEditsMatchModelsAndRecover' in compact['test_names'] and
            'CompactPointWriteE2e.FailedInlineEncodingKeepsValueAndWatch' in compact['test_names'] and
            'CompactPointWriteE2e.SingleReadSlotUsesOwnedFallback' in compact['test_names'] and
            'CompactStringWriteE2e.ColdRangeWriteYieldsStateAndRetainsKey' in compact['test_names'],
            'PR357 compact regression tests missing')
    e2e_command = run([str(directory / 'lavik_grouped_ordered_write_e2e_test'), str(directory / 'lavik'),
                       '--gtest_filter=' + E2E_FILTER,
                       '--gtest_output=xml:' + str(R / 'candidate-zset-tests.xml')], 'candidate-zset-tests', 5400)
    e2e = test_result('candidate-zset-tests', ('GroupedSortedSetWriteE2e', 'GroupedDemotionE2e'), 33)
    require(DEMOTION in e2e['test_names'] and EXCLUDED not in e2e['test_names'] and
            'GroupedSortedSetWriteE2e.EncodedMemberInsertionsKeepFlagsBinaryOrderAndRecovery' in e2e['test_names'],
            'Wrong end-to-end test inventory')
    e2e['command'] = e2e_command
    (R / 'TESTS_COMPLETE').write_text(utc() + '\n')
    result = {'source': manifest, 'source_manifest_sha256': sha(R / 'source-manifest.json'),
              'variants': {'candidate': builds['candidate']}, 'test_build': builds['test'],
              'compiler': sp.check_output(['/usr/bin/g++-13', '--version'], text=True),
              'kernel': os.uname().release,
              'tests': {'unit': units, 'compact_e2e': compact, 'sorted_set_e2e': e2e,
                        'unit_filter': UNIT_FILTER, 'compact_filter': COMPACT_FILTER,
                        'e2e_filter': E2E_FILTER, 'excluded': [EXCLUDED],
                        'baseline_regression': 'Existing main binary/results reused; no baseline build or rerun'},
              'completed': utc()}
    save('build-manifest.json', result)
    (R / 'BUILD_COMPLETE').write_text(utc() + '\n')
    print('Stack Release/Debug builds and 128 unit, 13 compact, 33 grouped tests complete', flush=True)


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        if OWNED:
            save('build-failure.json', {'time': utc(), 'traceback': traceback.format_exc()})
        raise
