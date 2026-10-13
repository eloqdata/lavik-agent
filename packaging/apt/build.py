#!/usr/bin/env python3
"""Build Debian packages from locked upstream archives and publish with aptly."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

WORK = Path('/work')
INPUTS = Path('/inputs')
DOWNLOADS = Path('/downloads')


def run(*argv, **kw):
    return subprocess.check_output(argv, text=True, **kw).strip()


def main():
    lock = json.loads(Path('/release-lock.json').read_text())
    version = lock['debianVersion']
    tag = lock['tag_name']
    release_version = tag.removeprefix('v')
    revision = lock['commit']
    previous = json.loads((INPUTS / 'previous.json').read_text())
    prior_public = Path('/previous')
    for f in previous['files']:
        data = (prior_public / f['path']).read_bytes()
        assert hashlib.sha256(data).hexdigest() == f['sha256'] and len(data) == f['size']
    out = WORK / 'debs'
    out.mkdir(exist_ok=True)
    for arch, upstream_arch in [('amd64', 'x86_64'), ('arm64', 'aarch64')]:
        for variant in ['minimal', 'standard']:
            package = 'lavik' if variant == 'minimal' else 'lavik-standard'
            other = 'lavik-standard' if variant == 'minimal' else 'lavik'
            suffix = '-minimal' if variant == 'minimal' else ''
            name = f'lavik-{tag}-linux-{upstream_arch}{suffix}.tar.gz'
            asset = next(a for a in lock['assets'] if a['name'] == name)
            archive = DOWNLOADS / name
            if not archive.exists():
                run('curl', '--fail', '--location', '--retry', '3', '--output', str(archive), asset['browser_download_url'])
            assert hashlib.sha256(archive.read_bytes()).hexdigest() == asset['digest'].split(':')[1]
            root = WORK / f'{package}-{arch}'
            root.mkdir()  # Fail instead of mutating an old build.
            unpack = root / 'unpack'
            with tarfile.open(archive) as tf:
                tf.extractall(unpack, filter='data')
            release = next(unpack.iterdir())
            assert (release / 'REVISION').read_text().strip() == revision
            assert (release / 'VERSION').read_text().strip() == tag
            for directory in ['usr/bin', 'usr/lib/lavik', 'usr/lib/systemd/system', 'etc/default', f'usr/share/doc/{package}', 'DEBIAN']:
                (root / directory).mkdir(parents=True)
            for metadata in ['VERSION', 'REVISION']:
                shutil.copy2(release / metadata, root / 'usr/lib/lavik' / metadata)
            for binary in ['lavik', 'lavik-meta', 'lavik-ctl']:
                shutil.move(release / binary, root / 'usr/bin' / binary)
            # Server packages exclude the separately distributed Admin/Node runtime.
            for item in [release / name for name in ['LICENSE', 'THIRD_PARTY_NOTICES', 'VERSION', 'REVISION']]:
                target = root / f'usr/share/doc/{package}' / item.name
                if item.is_dir(): shutil.copytree(item, target)
                else: shutil.copy2(item, target)
            shutil.rmtree(unpack)
            for source, dest in [('lavik.service','usr/lib/systemd/system/lavik.service'), ('default','etc/default/lavik'), ('start','usr/lib/lavik/start'), ('postinst','DEBIAN/postinst'), ('prerm','DEBIAN/prerm'), ('postrm','DEBIAN/postrm')]:
                shutil.copyfile(INPUTS / 'templates' / source, root / dest)
                os.chmod(root / dest, 0o755 if source in ('start','postinst','prerm','postrm') else 0o644)
            deps = 'libc6 (>= 2.39), libstdc++6 (>= 13.1), libgcc-s1, adduser, init-system-helpers, util-linux'
            if variant == 'standard': deps += ', libnuma1, libuuid1'
            (root / 'DEBIAN/control').write_text(f'''Package: {package}
Version: {version}
Architecture: {arch}
Maintainer: Lavik Project <packages@lavik.dev>
Section: database
Priority: optional
Depends: {deps}
Conflicts: {other}
Replaces: {other}
Homepage: https://lavik.dev
Description: Lavik key-value store ({variant} {release_version} release)
 Official {release_version} binaries, Meta and lavik-ctl, with a standalone systemd unit.
 Requires Linux 6.1+ with io_uring enabled and Ubuntu 24.04-compatible glibc.
''')
            (root / 'DEBIAN/conffiles').write_text('/etc/default/lavik\n')
            run('dpkg-deb', '--root-owner-group', '-Zxz', '--build', str(root), str(out / f'{package}_{version}_{arch}.deb'))
    keyhome = Path(os.environ['GNUPGHOME'])
    keyhome.mkdir(mode=0o700, exist_ok=True)
    os.chmod(keyhome, 0o700)
    # Keep agent sockets on the container filesystem, not a macOS bind mount.
    persistent = Path('/signing')
    for item in persistent.iterdir():
        if item.is_dir(): shutil.copytree(item, keyhome / item.name, dirs_exist_ok=True)
        elif item.is_file() and not item.name.endswith('.lock'):
            shutil.copy2(item, keyhome / item.name)
    keys = run('gpg', '--batch', '--with-colons', '--list-secret-keys')
    if not keys:
        if os.environ.get('LAVIK_APT_INITIALIZE_KEY') != '1':
            raise RuntimeError('Signing key missing. Restore the production key; set LAVIK_APT_INITIALIZE_KEY=1 only for an intentional first-time setup.')
        run('gpg', '--batch', '--pinentry-mode', 'loopback', '--passphrase', '', '--quick-generate-key', 'Lavik APT Repository', 'rsa3072', 'sign', '2y')
        keys = run('gpg', '--batch', '--with-colons', '--list-secret-keys')
    # Persist key material only; never copy agent sockets or transient locks.
    for item in keyhome.iterdir():
        if item.is_dir(): shutil.copytree(item, persistent / item.name, dirs_exist_ok=True)
        elif item.is_file() and not item.name.endswith('.lock'):
            shutil.copy2(item, persistent / item.name)
    fingerprint = next(l.split(':')[9] for l in keys.splitlines() if l.startswith('fpr:'))
    assert fingerprint == previous['fingerprint'], 'Refusing to rotate the production signing key'
    config = WORK / 'aptly.json'
    config.write_text(json.dumps({'rootDir': str(WORK / 'aptly'), 'architectures': ['amd64','arm64']}))
    aptly = ['aptly', '-config='+str(config)]
    run(*aptly, 'repo', 'create', '-distribution=noble', '-component=main', 'lavik')
    run(*aptly, 'repo', 'add', 'lavik', str(prior_public / 'pool'))
    run(*aptly, 'repo', 'add', 'lavik', str(out))
    run(*aptly, 'snapshot', 'create', 'lavik-' + version, 'from', 'repo', 'lavik')
    run(*aptly, 'publish', 'snapshot', '-batch', '-gpg-key='+fingerprint, '-acquire-by-hash', '-origin=Lavik', '-label=Lavik', 'lavik-' + version)
    public = WORK / 'aptly/public'
    with (public / 'lavik-archive-keyring.asc').open('w') as f:
        subprocess.run(['gpg','--batch','--armor','--export',fingerprint],stdout=f,check=True)
    # Keep old immutable packages and by-hash indexes for cached Release metadata.
    for f in previous['files']:
        name = f['path']
        if name.startswith('pool/') or '/by-hash/' in name:
            target = public / name
            if target.exists():
                # Aptly also writes mutable aliases inside by-hash directories.
                if name.startswith('pool/') or len(target.name) in (32, 40, 64, 128):
                    assert hashlib.sha256(target.read_bytes()).hexdigest() == f['sha256'], name
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(prior_public / name, target)
    assert (public / 'lavik-archive-keyring.asc').read_bytes() == (prior_public / 'lavik-archive-keyring.asc').read_bytes()
    files = []
    for p in sorted(public.rglob('*')):
        if p.is_file():
            assert p.stat().st_size < 25*1024*1024, f'Cloudflare static asset too large: {p}'
            files.append(dict(path=str(p.relative_to(public)), sha256=hashlib.sha256(p.read_bytes()).hexdigest(), size=p.stat().st_size))
    manifest = dict(version=version,release=release_version,sourceCommit=revision,distribution='noble',architectures=['amd64','arm64'],fingerprint=fingerprint,files=files)
    (WORK / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Only public assets are archived. No signing key, private aptly database or build tree.
    with tarfile.open(WORK / f'lavik-apt-{version}.tar.gz','w:gz',dereference=True) as tf:
        for item in public.iterdir(): tf.add(item,arcname=item.name)
    print(json.dumps({'status':'built','fingerprint':fingerprint,'files':len(files),'aptly':run('aptly','version')}))


if __name__ == '__main__': main()
