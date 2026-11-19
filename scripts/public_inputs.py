"""Shared bounded, regular-file-only distribution primitives (no discovery policy)."""
import hashlib
import json
import os
import stat
from pathlib import Path, PurePosixPath

MAX_FILES = 8192
MAX_BYTES = 2 * 1024**3

def relative(value):
    if not isinstance(value, str) or not value or '\\' in value or ':' in value or any(ord(c) < 32 for c in value) or any(p in ('', '.', '..') or p.endswith((' ', '.')) for p in value.split('/')) or PurePosixPath(value).is_absolute():
        raise ValueError(f'unsafe relative path: {value!r}')
    return value

def regular(path):
    path = Path(os.path.abspath(path))
    for part in [*reversed(path.parents), path]:
        mode = part.lstat().st_mode
        if stat.S_ISLNK(mode):
            raise ValueError(f'symlink input: {part}')
    if not stat.S_ISREG(path.stat().st_mode):
        raise ValueError(f'not a regular file: {path}')
    return path

def identity(path):
    path = regular(path)
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('file exceeds input budget')
    with path.open('rb') as stream:
        return {'bytes': path.stat().st_size, 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()}

def inventory(root):
    result = {}
    for parent, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            p = Path(parent) / name
            if p.is_symlink():
                raise ValueError(f'symlink directory: {p}')
        for name in files:
            p = Path(parent) / name
            result[p.relative_to(root).as_posix()] = identity(p)
            if len(result) > MAX_FILES or sum(v['bytes'] for v in result.values()) > MAX_BYTES:
                raise ValueError('input budget exceeded')
    return dict(sorted(result.items()))

def write_json(path, value):
    with path.open('x') as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write('\n')

def new_directory(path):
    path = Path(os.path.abspath(path))
    for part in [*reversed(path.parents)]:
        if part.is_symlink():
            raise ValueError(f'symlink output ancestor: {part}')
    path.mkdir(parents=True, exist_ok=False)
    return path
