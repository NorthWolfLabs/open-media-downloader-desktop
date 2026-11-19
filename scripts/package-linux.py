# /// script
# requires-python = ">=3.12"
# ///
"""Build an Ubuntu Debian or Arch package from verified x86-64 v2 inputs.

Run on the target distribution with dpkg-deb or makepkg. Cross compilation is separate from packaging and
target acceptance. No user profiles or source checkouts are changed.
"""
import argparse
import hashlib
import json
import os
import re
import platform
import shutil
import subprocess
import tempfile
import tarfile
from pathlib import Path, PurePosixPath

parser = argparse.ArgumentParser(description=__doc__)
for name in ('desktop-binary', 'resources', 'config', 'hooks', 'icon', 'output', 'build-receipt'):
    parser.add_argument('--' + name, type=Path, required=True)
parser.add_argument('--format', choices=('deb', 'arch'), default='deb')
args = parser.parse_args()
if platform.system() != 'Linux':
    parser.error('Run packaging on the target Linux distribution.')
for tool in ('strip', 'dpkg-deb' if args.format == 'deb' else 'makepkg'):
    if shutil.which(tool) is None:
        parser.error(f'Install the packaging prerequisite {tool} before assembling the installer (dpkg-dev/binutils on Ubuntu, base-devel on Arch).')
if args.output.exists() or args.output.with_suffix('.json').exists():
    parser.error('Retain existing immutable packages; choose a new output path.')
config = json.loads(args.config.read_text())
inventory = json.loads((args.resources / 'build-inventory.json').read_text())
if inventory['platform'] != 'linux' or inventory['arch'] != 'x64':
    raise ValueError('Resources must be staged explicitly for linux-x64.')
receipt = json.loads(args.build_receipt.read_text())
if receipt.get('status') != 'built_requires_installer_acceptance' or receipt.get('target') != 'x86_64-unknown-linux-gnu':
    raise ValueError('Use a successful public Linux build receipt')
identity = receipt.get('identity', {})
if identity.get('identifier') != 'labs.northwolf.omd' or identity.get('productName') != 'OMD' or not re.fullmatch(r'\d+\.\d+\.\d+', identity.get('version', '')):
    raise ValueError('Public package identity/version is invalid')
if inventory.get('staging_mode') != 'release' or inventory.get('plugins', {}).get('mode') != 'public' or inventory.get('plugins', {}).get('publishable') is not True:
    raise ValueError('Public installers require reviewed release-staged resources')
product = 'OMD'
package = 'omd'
version = identity['version']

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def elf(path):
    with path.open('rb') as source:
        header = source.read(20)
    if header[:6] != b'\x7fELF\x02\x01' or int.from_bytes(header[18:20], 'little') != 62:
        raise ValueError(f'Expected x86-64 Linux executable: {path.name}')

def stage_file(source, destination):
    source = Path(source)
    mode = source.stat().st_mode & 0o7777
    normalized = 0o755 if mode & 0o111 else 0o644
    # Package assembly never changes linked inputs. A same-filesystem link for
    # already-normalized immutable resources avoids another full browser copy.
    if mode == normalized and source.stat().st_dev == Path(destination).parent.stat().st_dev:
        os.link(source, destination)
    else:
        shutil.copy2(source, destination)
        Path(destination).chmod(normalized)
    return str(destination)

elf(args.desktop_binary)
if digest(args.desktop_binary) != receipt.get('executable_sha256') or digest(args.resources / 'build-inventory.json') != receipt.get('resources', {}).get('inventory_sha256'):
    raise ValueError('The executable or staged runtime differs from the public build receipt')
expected = set()
for entry in inventory['files']:
    relative = PurePosixPath(entry['path'])
    if relative.is_absolute() or '..' in relative.parts or str(relative) in expected:
        raise ValueError('Invalid or repeated inventory path')
    expected.add(str(relative))
    source = args.resources.joinpath(*relative.parts)
    if source.is_symlink() or not source.is_file() or source.stat().st_size != entry['size'] or digest(source) != entry['sha256']:
        raise ValueError(f'Input integrity mismatch: {relative}')
    if str(relative).startswith('bin/'):
        elf(source)
actual = set()
for source in args.resources.rglob('*'):
    if source.is_symlink():
        raise ValueError('Staged resources cannot contain symlinks')
    if source.is_file():
        actual.add(source.relative_to(args.resources).as_posix())
if actual != expected | {'build-inventory.json'}:
    raise ValueError('The staged directory differs from its complete inventory')

args.output.parent.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='omd-deb-', dir=args.output.parent) as temporary:
    root = Path(temporary)
    resources = root / 'usr/lib' / product / 'resources/v2'
    shutil.copytree(args.resources, resources, copy_function=stage_file)
    binary = root / 'usr/bin/omd-desktop'
    binary.parent.mkdir(parents=True)
    shutil.copy2(args.desktop_binary, binary)
    binary.chmod(0o755)
    # Keep the input executable as the symbol artifact; ship without DWARF.
    subprocess.run(['strip', '--strip-debug', str(binary)], check=True)
    shipped_desktop_sha256 = digest(binary)
    icon = root / f'usr/share/icons/hicolor/128x128/apps/{package}.png'
    icon.parent.mkdir(parents=True)
    shutil.copy2(args.icon, icon)
    launcher = root / f'usr/share/applications/{package}.desktop'
    launcher.parent.mkdir(parents=True)
    launcher.write_text(f'[Desktop Entry]\nType=Application\nName={product}\nComment=Discover and download media\nExec=omd-desktop\nIcon={package}\nTerminal=false\nCategories=Utility;\nStartupWMClass=OMD\n')
    licenses = root / 'usr/share/licenses' / package
    licenses.mkdir(parents=True)
    shutil.copy2(Path(__file__).resolve().parents[1] / 'LICENSE', licenses / 'LICENSE')
    (licenses / 'BUNDLED-COMPONENTS.txt').write_text('OMD code is MIT licensed. Bundled components retain their own terms and source rights; see /usr/lib/OMD/resources/v2/third-party and the matching release source/materials packet.\n')
    if args.format == 'deb':
        policy = root / 'etc/apparmor.d/omd-v2-helper'
        policy.parent.mkdir(parents=True)
        shutil.copy2(args.hooks / 'omd-v2-helper.apparmor', policy)
        control = root / 'DEBIAN'
        control.mkdir()
        dependencies = config['bundle']['linux']['deb']['depends']
        size = sum(p.stat().st_size for p in root.rglob('*') if p.is_file()) // 1024
        (control / 'control').write_text(f'Package: {package}\nVersion: {version}\nArchitecture: amd64\nMaintainer: North Wolf Labs LLC\nInstalled-Size: {size}\nDepends: {", ".join(dependencies)}\nSection: utils\nPriority: optional\nDescription: Source-extensible media download manager\n Discover media through independently installed sources and keep local copies.\n')
        (control / 'conffiles').write_text('/etc/apparmor.d/omd-v2-helper\n')
        for name in ('postinst', 'postrm'):
            shutil.copy2(args.hooks / (name + '.sh'), control / name)
            (control / name).chmod(0o755)
    # dpkg-deb records root ownership without requiring the build to run as root.
    for path in root.rglob('*'):
        mode = 0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644
        if path.stat().st_mode & 0o7777 != mode:
            path.chmod(mode)
    environment = dict(os.environ, SOURCE_DATE_EPOCH='1788652800')
    if args.format == 'deb':
        subprocess.run(['dpkg-deb', '--root-owner-group', '-Zgzip', '-z6', '--build', str(root), str(args.output)], env=environment, check=True)
    else:
        # makepkg builds a standard pacman package, including its .MTREE and
        # .BUILDINFO. Never strip or otherwise rewrite hashed managed tools.
        dependencies = ['gtk3', 'webkit2gtk-4.1', 'libayatana-appindicator', 'openssl',
                        'glibc', 'gcc-libs', 'dbus', 'libsecret', 'nss', 'alsa-lib',
                        'at-spi2-core', 'libcups', 'libxcomposite', 'libxdamage',
                        'libxrandr', 'mesa', 'pango', 'cairo', 'ttf-dejavu']
        with tempfile.TemporaryDirectory(prefix='omd-arch-build-', dir=args.output.parent) as workspace:
            workspace = Path(workspace)
            payload = workspace / 'payload.tar'
            with tarfile.open(payload, 'w', format=tarfile.PAX_FORMAT) as archive:
                for path in sorted(root.rglob('*')):
                    entry = archive.gettarinfo(str(path), path.relative_to(root).as_posix())
                    entry.uid = entry.gid = 0
                    entry.uname = entry.gname = 'root'
                    entry.mtime = int(environment['SOURCE_DATE_EPOCH'])
                    if path.is_file():
                        with path.open('rb') as source:
                            archive.addfile(entry, source)
                    else:
                        archive.addfile(entry)
            build = f"""pkgname={package}
pkgver={version}
pkgrel=1
pkgdesc='Discover and download media and follow source collections'
arch=('x86_64')
license=('MIT' 'LicenseRef-OMD-Bundled-Components')
source=('payload.tar')
options=('!strip' '!debug' '!purge' '!zipman' 'staticlibs' 'libtool' 'emptydirs')
optdepends=('gnome-keyring: Secret Service credentials, unless another provider is configured')
"""
            build += 'depends=(' + ' '.join("'" + value + "'" for value in dependencies) + ')\n'
            build += "sha256sums=('" + digest(payload) + "')\n"
            build += 'package() { cp -a "$srcdir/usr" "$pkgdir/"; }\n'
            (workspace / 'PKGBUILD').write_text(build)
            configuration = workspace / 'makepkg.conf'
            configuration.write_text("source /etc/makepkg.conf\nPKGEXT='.pkg.tar.zst'\nCOMPRESSZST=(zstd -c -T2 -6 -)\n")
            environment.update(PKGDEST=str(workspace), SRCDEST=str(workspace), BUILDDIR=str(workspace))
            subprocess.run(['makepkg', '--config', str(configuration), '--noconfirm', '--nosign'],
                           cwd=workspace, env=environment, check=True)
            packages = list(workspace.glob(package + '-*.pkg.tar.zst'))
            if len(packages) != 1:
                raise ValueError('Expected one complete Arch package')
            with packages[0].open('rb') as source, args.output.open('xb') as destination:
                shutil.copyfileobj(source, destination)

report = {'status': 'packaged_requires_target_acceptance', 'package': str(args.output.resolve()),
          'sha256': digest(args.output), 'architecture': 'amd64' if args.format == 'deb' else 'x86_64', 'format': args.format,
          'desktop_input_sha256': digest(args.desktop_binary),
          'desktop_sha256': shipped_desktop_sha256,
          'inventory_sha256': digest(args.resources / 'build-inventory.json'),
          'resources': len(expected), 'dependencies': dependencies}
args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
