# /// script
# requires-python = ">=3.12"
# ///
"""Cross-build the v2 desktop against an explicit Ubuntu 24.04 x86-64 sysroot.

This produces an executable, not an accepted installer. Package and exercise it
on the target OS. Node/Cargo/UV are needed only on this build host.
"""
import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--desktop', type=Path, required=True)
parser.add_argument('--sysroot', type=Path, required=True)
parser.add_argument('--target-dir', type=Path, required=True)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--release', action='store_true')
args = parser.parse_args()
desktop = args.desktop.resolve()
sysroot = args.sysroot.resolve()
assert not args.report.exists()
assert (sysroot / 'usr/lib/x86_64-linux-gnu/pkgconfig/gtk+-3.0.pc').is_file()

def merge(base, override):
    for key, value in override.items():
        if value is None:
            base.pop(key, None)
        elif isinstance(value, dict) and isinstance(base.get(key), dict):
            merge(base[key], value)
        else:
            base[key] = value

config = json.loads((desktop / 'src-tauri/tauri.v2.package.conf.json').read_text())
merge(config, json.loads((desktop / 'src-tauri/tauri.v2.linux.conf.json').read_text()))
assert config['app']['windows'][0]['url'] == 'v2.html'
# Direct Cargo builds do not receive Tauri CLI's production-protocol feature.
# Without it, even a successfully packaged binary loads the inherited dev URL.
config['build']['devUrl'] = None
environment = os.environ.copy()
environment.update(CARGO_INCREMENTAL='0', CARGO_BUILD_JOBS='4', CARGO_TARGET_DIR=str(args.target_dir.resolve()),
                   PKG_CONFIG_ALLOW_CROSS='1', PKG_CONFIG_SYSROOT_DIR=str(sysroot),
                   PKG_CONFIG_LIBDIR=os.pathsep.join(str(sysroot / p) for p in ['usr/lib/x86_64-linux-gnu/pkgconfig', 'usr/share/pkgconfig']),
                   TAURI_CONFIG=json.dumps(config))
report = {'status': 'building', 'target': 'x86_64-unknown-linux-gnu', 'glibc': '2.39',
          'sysroot': str(sysroot), 'desktop': str(desktop), 'configuration': config,
          'profile': 'release' if args.release else 'debug'}
args.report.parent.mkdir(parents=True, exist_ok=True)

def save():
    args.report.write_text(json.dumps(report, indent=2) + '\n')

try:
    save()
    subprocess.run(['vp', 'build', '--config', 'vite.v2.config.ts'], cwd=desktop, check=True)
    command = ['uv', 'tool', 'run', 'cargo-zigbuild==0.23.4', 'build', '--locked', '--features', 'v2,tauri/custom-protocol', '--target', 'x86_64-unknown-linux-gnu.2.39']
    if args.release:
        command.append('--release')
    subprocess.run(command, cwd=desktop / 'src-tauri', env=environment, check=True)
    binary = args.target_dir.resolve() / 'x86_64-unknown-linux-gnu' / report['profile'] / 'open-media-downloader-desktop'
    with binary.open('rb') as source:
        header = source.read(20)
        assert header[:6] == b'\x7fELF\x02\x01' and int.from_bytes(header[18:20], 'little') == 62
        source.seek(0)
        report.update(status='built_requires_target_acceptance', executable=str(binary), sha256=hashlib.file_digest(source, 'sha256').hexdigest())
    save()
except Exception as error:
    report.update(status='failed', failure=str(error))
    save()
    raise
