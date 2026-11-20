# Package the independent UI

The UI consumes reviewed engine/runtime artifacts, not a sibling source checkout.
No source plugins are bundled; users import the plugins they trust.
The locked client SDK and app icons are reviewed source inputs; don't replace them
with arbitrary local builds while retaining old materials identities.

## Source export

```sh
uv run scripts/export-public-source.py prepare --project /absolute/desktop \
  --policy /absolute/desktop/packaging/public-source-inputs.json \
  --output /absolute/new-desktop-source
uv run scripts/export-public-source.py archive --output /absolute/new-desktop-source
```

Inspect the frozen source inventory before archiving. The archive contains only
this project's files, no profiles, generated resources, reports, engine or plugin
source. Run the documented frozen install/check/test/build from the exported tree.

## Runtime staging

scripts/stage-v2.mjs accepts explicit engine binaries, media-tools and browser-tools
manifests. It verifies hashes, the optimized worker marker, inventory ownership and
plugin policy before replacing staging output. Development staging and release
staging are distinct modes. For a development-only bundle:

```sh
vp exec node scripts/stage-v2.mjs \
  --engine-bin /absolute/runtime/bin \
  --tools /absolute/runtime/tools/tools-v2.json \
  --browser-tools /absolute/runtime/browser/browser-tools-v2.json \
  --plugin-mode public
```

On macOS targets the engine's sign-in window is an application bundle: --engine-bin
must contain `OMD Sign-In.app` (`Contents/Info.plist`, `Contents/MacOS/omd-signin`,
`Contents/Resources/AppIcon.icns`), as the engine's runtime packager assembles it, and
staging copies it unchanged to `bin/OMD Sign-In.app`. This project owns that icon: package
the engine runtime with `--signin-icon` set to this project's reviewed
`src-tauri/icons/icon.icns`. Staging refuses a bundle with any other icon, an extra or
missing member, a link, a seal or a non-executable helper. A bare `omd-signin` in
--engine-bin is ignored on macOS. Linux and Windows staging still copy `bin/omd-signin`.
The engine's macOS signer seals the bundle before the app.

Review the script's required inputs before running. Release staging additionally
requires --staging-mode release, --materials, --materials-locks, --version and
--supplements. The locks directory contains the exact engine Cargo, browser package,
desktop Cargo and desktop package locks.

Use --materials-binding two-phase for every public target (macOS, Windows and Linux).
scripts/build-public.mjs accepts only two-phase release staging: the desktop
executable and its embedded frontend don't exist yet when resources are staged, so
they are bound after the build/signing step by the engine's final-materials workflow.
Single-phase release staging still requires those components and therefore fails.

--supplements names a JSON array of reviewed files to install under third-party/:

```json
[
  { "name": "native-receipt.json", "path": "native-receipt.json", "sha256": "<64 hex digits>" },
  { "name": "native-NOTICES.txt", "path": "native-NOTICES.txt", "sha256": "<64 hex digits>" }
]
```

Each entry is installed as third-party/NAME. `name` uses letters, digits, `.`, `_`
and `-` (at most 128 characters); `path` is resolved relative to the JSON file and
must be a regular file of at most 256 MiB; `sha256` must match its bytes. The array
holds at most 100 entries. Release staging always reads `native-receipt.json`
(schema omd-native-notices-v2 for the six engine binaries, this target triple, the
engine Cargo.lock and --version) and the generator's matching `native-NOTICES.txt`.
Add the source/rebuild materials your materials manifest lists: every staged file,
including each supplement, must be covered by that reviewed manifest. The engine
project's materials contract guide describes the receipt, notices and manifest.

A complete release staging command for one target:

```sh
vp exec node scripts/stage-v2.mjs \
  --engine-bin /absolute/runtime/bin \
  --tools /absolute/runtime/tools/tools-v2.json \
  --browser-tools /absolute/runtime/browser/browser-tools-v2.json \
  --plugin-mode public \
  --target darwin-arm64 \
  --staging-mode release \
  --materials-binding two-phase \
  --materials /absolute/materials/materials-v1.json \
  --materials-locks /absolute/materials/locks \
  --supplements /absolute/materials/supplements.json \
  --version 0.2.3
```

Set --target to the platform you will build: darwin-arm64, darwin-x64, linux-x64 or
win32-x64. Staging and its public resource check do not themselves accept a release.
No source package should be added to the public plugin allowlist for convenience.

## Native builds

The default Tauri identity is a development identity. scripts/build-public.mjs
selects the public identity, accepts only release-staged resources with the required
materials, remaps build-host paths and checks bundle metadata. On macOS the whole
payload minimum is 13.5, ARM64 for the tested candidate. Signing/notarization and
old-OS/other CPU/platform execution remain separate checks. The same entry supports
native x64 Windows/Linux public executables with their platform overlays and strict
release-staging gates. Their installer helpers require its exact build receipt.
Follow the engine
project's version-matched materials and macOS signing guides for exact-byte binding.
Never promote an ad-hoc local preview by changing a readiness flag.

Linux package/cross-build helpers and the Windows packaging helper live in this
project's scripts/. Run on or validate on the target platform with its required
explicit inputs; cross-compilation alone isn't installation acceptance. Complete
native keyboard/window, startup/notification, destination and acquisition journeys
against a disposable profile before public distribution.

Use the [release checklist](release.md) for versioning and installer acceptance.
Users update through the [manual update flow](manual-updates.md); automatic updating
is not enabled.
