# /// script
# requires-python = ">=3.11"
# ///
"""Export the approved shared-card SVG sources: uv run src-tauri/icons/export-icons.py."""
import argparse
import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLATFORM = HERE / 'platform'


def run(args):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, timeout=120)


def export(root):
    pins = json.loads((PLATFORM / 'source-sha256.json').read_text())
    actual = {str(p.relative_to(PLATFORM)) for p in PLATFORM.rglob('*') if p.is_file() and p.name != 'source-sha256.json'}
    if actual != set(pins):
        raise ValueError('Icon source set differs from the approved manifest')
    for name, expected in pins.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Invalid icon source path')
        if hashlib.sha256((PLATFORM / relative).read_bytes()).hexdigest() != expected:
            raise ValueError(f'Unreviewed icon source change: {name}')
    icons = root / 'src-tauri/icons'
    assets = root / 'src/assets'
    icons.mkdir(parents=True, exist_ok=True)
    assets.mkdir(parents=True, exist_ok=True)
    written = []

    def copy(source, target):
        shutil.copyfile(source, target)
        written.append(target)

    with tempfile.TemporaryDirectory(prefix='omd-icon-export-', dir=root) as temporary:
        work = Path(temporary)
        native = work / 'native'
        native.mkdir()
        run(['xcrun', 'actool', '--app-icon', 'OMD', '--include-all-app-icons', '--standalone-icon-behavior', 'all',
             '--target-device', 'mac', '--platform', 'macosx', '--minimum-deployment-target', '13.5',
             '--output-partial-info-plist', work / 'partial.plist', '--compile', native, PLATFORM / 'OMD.icon'])
        iconset = work / 'OMD.iconset'
        run(['/usr/bin/iconutil', '-c', 'iconset', native / 'OMD.icns', '-o', iconset])
        expected = {f'icon_{n}x{n}{suffix}.png' for n in (16, 32, 128, 256, 512) for suffix in ('', '@2x')}
        if {p.name for p in iconset.iterdir()} != expected:
            raise ValueError('Incomplete native iconset')
        copy(native / 'OMD.icns', icons / 'icon.icns')
        copy(iconset / 'icon_256x256.png', assets / 'app-icon-macos.png')
        frames = []
        sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
        for platform, numbers in [('windows', sizes), ('linux', [32, 128, 256])]:
            for n in numbers:
                png = work / f'{platform}-{n}.png'
                run(['rsvg-convert', '-w', n, '-h', n, PLATFORM / f'omd-{platform}.svg', '-o', png])
                data = png.read_bytes()
                if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != (n, n):
                    raise ValueError('Incorrect PNG dimensions')
                if platform == 'windows':
                    frames.append(data)
                else:
                    copy(png, icons / {32: '32x32.png', 128: '128x128.png', 256: '128x128@2x.png'}[n])
                if n == 256:
                    copy(png, assets / f'app-icon-{platform}.png')
        header = bytearray(struct.pack('<HHH', 0, 1, len(frames)))
        offset = 6 + 16 * len(frames)
        for n, data in zip(sizes, frames):
            header.extend(struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(data), offset))
            offset += len(data)
        (icons / 'icon.ico').write_bytes(header + b''.join(frames))
        written.append(icons / 'icon.ico')
    return {str(p.relative_to(root)): {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in written}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-root', type=Path, default=HERE.parent.parent)
    args = parser.parse_args()
    print(json.dumps(export(args.output_root.resolve()), indent=2))
