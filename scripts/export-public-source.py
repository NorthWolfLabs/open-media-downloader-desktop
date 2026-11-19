# /// script
# requires-python = ">=3.12"
# ///
"""Prepare reviewed source inventory, then archive that exact tree separately."""
import argparse
import gzip
import hashlib
import json
import os
import shutil
import tarfile
from pathlib import Path
from public_inputs import identity, inventory, regular, relative, write_json, MAX_BYTES, MAX_FILES, new_directory


def prepare(project, policy, output):
    rules = json.loads(regular(policy).read_text())
    if rules.get('format') != 2 or not rules.get('files') or len(rules['files']) > MAX_FILES:
        raise ValueError('invalid source policy')
    selected = {}
    folded = set()
    total = 0
    for row in rules['files']:
        if set(row) - {'source', 'destination', 'sha256'}:
            raise ValueError('source rows cannot select another project')
        name = relative(row['source'])
        forbidden = {'artifacts', 'target', 'profiles', 'profile', '.local', '.reports', 'reports', 'evidence', 'logs', 'node_modules', '.git', '.venv', 'ffbuild', '__pycache__', 'dist', 'dist-v2', 'resources', 'design-qa'}
        if set(Path(name).parts) & forbidden or name.endswith('.omdp') or any(part.startswith(('review-20','user-audit-20')) for part in Path(name).parts) or Path(name).name in {'instance.json','credentials.json','cookies.txt','REPORT.md','report.md'} or Path(name).name.startswith('.env') and Path(name).name != '.env.example':
            raise ValueError('excluded source input')
        source = regular(project / name)
        dest = relative(row['destination'])
        if dest.casefold() in folded:
            raise ValueError('destination collision')
        folded.add(dest.casefold())
        info = identity(source)
        if 'sha256' in row and row['sha256'] != info['sha256']:
            raise ValueError(f'reviewed binary digest mismatch: {dest}')
        # Binary assets require deliberate review, including vendor archives.
        with source.open('rb') as stream:
            sample = stream.read(8192)
        if sample.startswith(b'OMDP2\0'):
            raise ValueError('plugin packages are excluded')
        if (b'\0' in sample or source.suffix in ('.tgz', '.png', '.ico', '.icns', '.wasm')) and 'sha256' not in row:
            raise ValueError(f'unreviewed binary: {dest}')
        total += info['bytes']
        if len(folded) > MAX_FILES or total > MAX_BYTES:
            raise ValueError('source budget exceeded')
        selected[dest] = (source, info)
    new_directory(output)
    tree = output / 'source'
    tree.mkdir()
    for dest, (source, info) in sorted(selected.items()):
        target = tree / dest
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(0o644)
        if identity(target) != info:
            raise ValueError('input changed during export')
    write_json(output / 'inventory.json', {'release_accepted': False, 'files': inventory(tree)})
    write_json(output / 'build-inputs.json', {'project': str(project.absolute()), 'policy': str(policy.absolute()), 'policy_identity': identity(policy)})


def archive(output):
    inventory_file = regular(output / 'inventory.json')
    reviewed_bytes = inventory_file.read_bytes()
    reviewed_identity = {'bytes': len(reviewed_bytes), 'sha256': hashlib.sha256(reviewed_bytes).hexdigest()}
    expected = json.loads(reviewed_bytes)['files']
    if inventory(output / 'source') != expected:
        raise ValueError('source tree differs from reviewed inventory')
    archive_path = output / 'public-source.tar.gz'
    with archive_path.open('xb') as raw:
        with gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as zipped:
            with tarfile.open(fileobj=zipped, mode='w') as tar:
                for name, info in sorted(expected.items()):
                    item = tarfile.TarInfo(relative(name))
                    item.size = info['bytes']
                    item.mode = 0o644
                    with regular(output / 'source' / name).open('rb') as stream:
                        tar.addfile(item, stream)
    # Validate the bytes actually archived, rather than re-hashing mutable source
    # paths after streaming. A failed attempt remains inspectable without a report.
    with tarfile.open(archive_path, 'r:gz') as tar:
        members = tar.getmembers()
        if [member.name for member in members] != sorted(expected):
            raise ValueError('archive differs from reviewed inventory')
        for member in members:
            info = expected[member.name]
            if not member.isfile() or member.size != info['bytes']:
                raise ValueError('archive member differs from reviewed inventory')
            with tar.extractfile(member) as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != info['sha256']:
                    raise ValueError('archived bytes differ from reviewed inventory')
    if identity(inventory_file) != reviewed_identity:
        raise ValueError('reviewed inventory changed while archiving')
    write_json(output / 'archive-report.json', {'release_accepted': False, 'archive': identity(archive_path), 'inventory': reviewed_identity})

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['prepare', 'archive'])
    p.add_argument('--project', type=Path, default=Path(__file__).absolute().parents[1])
    p.add_argument('--policy', type=Path)
    p.add_argument('--output', type=Path, required=True)
    a = p.parse_args()
    if a.action == 'prepare':
        if not a.policy:
            p.error('prepare requires --policy')
        prepare(a.project, a.policy, a.output)
    else:
        archive(a.output)
