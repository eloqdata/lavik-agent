#!/usr/bin/env python3
"""Build Debian packages from locked upstream archives and publish with aptly."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile

VERSION = '0.1.0~beta.1-1'
REVISION = '3955b98d43b312324aa8d52775df52cfb111c0d0'
WORK = Path('/work')
INPUTS = Path('/inputs')
DOWNLOADS = Path('/downloads')


def run(*argv, **kw):
    return subprocess.check_output(argv, text=True, **kw).strip()


def main():
    lock = json.loads(Path('/release-lock.json').read_text())
    out = WORK / 'debs'
    out.mkdir(exist_ok=True)
    for arch, upstream_arch in [('amd64', 'x86_64'), ('arm64', 'aarch64')]:
        for variant in ['minimal', 'standard']:
            package = 'lavik' if variant == 'minimal' else 'lavik-standard'
            other = 'lavik-standard' if variant == 'minimal' else 'lavik'
            suffix = '-minimal' if variant == 'minimal' else ''
            name = f'lavik-v0.1.0-beta.1-linux-{upstream_arch}{suffix}.tar.gz'
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
            assert (release / 'REVISION').read_text().strip() == REVISION
            assert (release / 'VERSION').read_text().strip() == 'v0.1.0-beta.1'
            for directory in ['usr/bin', 'usr/lib/lavik', 'usr/lib/systemd/system', 'etc/default', f'usr/share/doc/{package}', 'DEBIAN']:
                (root / directory).mkdir(parents=True)
            for metadata in ['VERSION', 'REVISION']:
                shutil.copy2(release / metadata, root / 'usr/lib/lavik' / metadata)
            for binary in ['lavik', 'lavik-meta', 'lavik-ctl']:
                shutil.move(release / binary, root / 'usr/bin' / binary)
            for item in release.iterdir():
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
Version: {VERSION}
Architecture: {arch}
Maintainer: Lavik Project <packages@lavik.dev>
Section: database
Priority: optional
Depends: {deps}
Conflicts: {other}
Replaces: {other}
Homepage: https://lavik.dev
Description: Lavik key-value store ({variant} beta.1 release)
 Official beta.1 binaries, Meta and lavik-ctl, with a standalone systemd unit.
 Requires Linux 6.1+ with io_uring enabled and Ubuntu 24.04-compatible glibc.
''')
            (root / 'DEBIAN/conffiles').write_text('/etc/default/lavik\n')
            run('dpkg-deb', '--root-owner-group', '-Zxz', '--build', str(root), str(out / f'{package}_{VERSION}_{arch}.deb'))
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
    config = WORK / 'aptly.json'
    config.write_text(json.dumps({'rootDir': str(WORK / 'aptly'), 'architectures': ['amd64','arm64']}))
    aptly = ['aptly', '-config='+str(config)]
    run(*aptly, 'repo', 'create', '-distribution=noble', '-component=main', 'lavik-beta1')
    run(*aptly, 'repo', 'add', 'lavik-beta1', str(out))
    run(*aptly, 'snapshot', 'create', 'lavik-beta1-1', 'from', 'repo', 'lavik-beta1')
    run(*aptly, 'publish', 'snapshot', '-batch', '-gpg-key='+fingerprint, '-acquire-by-hash', '-origin=Lavik', '-label=Lavik', 'lavik-beta1-1')
    public = WORK / 'aptly/public'
    with (public / 'lavik-archive-keyring.asc').open('w') as f:
        subprocess.run(['gpg','--batch','--armor','--export',fingerprint],stdout=f,check=True)
    files = []
    for p in sorted(public.rglob('*')):
        if p.is_file():
            assert p.stat().st_size < 25*1024*1024, f'Cloudflare static asset too large: {p}'
            files.append(dict(path=str(p.relative_to(public)), sha256=hashlib.sha256(p.read_bytes()).hexdigest(), size=p.stat().st_size))
    manifest = dict(version=VERSION,release='0.1.0-beta.1',sourceCommit=REVISION,distribution='noble',architectures=['amd64','arm64'],fingerprint=fingerprint,files=files)
    (WORK / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    # Only public assets are archived. No signing key, private aptly database or build tree.
    with tarfile.open(WORK / 'lavik-apt-0.1.0-beta.1-1.tar.gz','w:gz',dereference=True) as tf:
        for item in public.iterdir(): tf.add(item,arcname=item.name)
    print(json.dumps({'status':'built','fingerprint':fingerprint,'files':len(files),'aptly':run('aptly','version')}))


if __name__ == '__main__': main()
