# Prepare a release

Releases use numeric application versions (0.2.0, then 0.2.1) and GitHub's
prerelease flag. Each new version must increase. Do not replace already
published versioned installers with different bytes. The app, engine components,
Cargo/npm package versions and native package metadata must agree; SDK and plugin
versions are independent. Keep labs.northwolf.omd, the per-user Windows scope,
Linux package omd and their profile locations stable across updates.

## Build boundaries

Start from separately reviewed engine and desktop source exports. Follow
[packaging](packaging.md) with explicit immutable engine/media/browser inputs and
current source/notice materials. Staging is plugin-free: no plugin is an application
resource or part of the release. Example plugins, such as the optional NASA podcast
example ([omd-source-nasa-podcast](https://github.com/NorthWolfLabs/omd-source-nasa-podcast)), are published separately from this checklist.

The public build entry supports these triples:

- aarch64-apple-darwin and x86_64-apple-darwin: macOS app build.
- x86_64-pc-windows-msvc: public Windows executable followed by NSIS packaging.
- x86_64-unknown-linux-gnu: public Linux executable followed by native packaging.

A supported build triple is not evidence of installation or runtime support.
Offer only CPU/OS combinations that passed that release's native acceptance.
macOS's declared payload minimum is 13.5; execution on that version needs its own
check. The Linux dependency set targets Ubuntu 24.04; it is not a universal Linux
installer. Keep additional CPU/distribution formats out of the published asset
list until their whole runtime, sandbox and upgrade paths are verified.

Use scripts/build-public.mjs with the explicit --target and --report. It rejects
development/private staging and conflicting compiler configuration, applies stable
public metadata and remaps builder paths. On Windows/Linux it emits an unbundled
executable and a built_requires_installer_acceptance receipt. Their packagers
require that receipt and verify executable/inventory hashes before assembly.

The public Windows build selects the static C runtime; inspect the final PE
imports and retain the native runtime terms with its materials. A developer
machine with Visual Studio installed can hide missing runtime DLLs.

Windows packaging uses scripts/package-windows.ps1 with the PowerShell parameters
-CargoTauri, -Output, -BuildReceipt and -TargetDirectory. Use Tauri CLI
2.11.4. It installs per-user, refuses downgrades and stops only the authenticated
engine for the public profile through the installed engine's --prepare-update
entry. Hook failures abort replacement. Test silent /S installation explicitly: its pre-install
guard reads the installed version independently of installer pages and rejects a
downgrade before stopping the existing engine or replacing files. That guard reads the
uninstall entry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\OMD`), which
is named after the product only. The publisher (North Wolf Labs LLC) names the key that
remembers the install folder, `HKCU\Software\North Wolf Labs LLC\OMD`. Builds made before
the publisher was set used `HKCU\Software\northwolf\OMD`. Those builds were never published,
so there is no migration: uninstall them from QA machines before running upgrade tests.
Sign with the engine project's Windows signing process (docs/windows-signing.md): sign the five engine
executables before staging and rebind their receipt and materials, then pass
-SignGate and -SignPolicy (or OMD_WINDOWS_SIGN_GATE and OMD_WINDOWS_SIGN_POLICY)
with TAURI_WINDOWS_SIGNTOOL_PATH set. Tauri then signs the desktop executable,
uninstaller and Setup through the gate. Signing is off by default; unsigned
artifacts must be explicitly identified and are not accepted on every Windows
security configuration.

Linux packaging uses scripts/package-linux.py with --build-receipt plus the
documented explicit executable, resources, config, hooks, icon and output inputs.
Run on the target distribution. Package-manager ownership and the AppArmor helper
path must agree with /usr/lib/OMD. Do not ship a permissive fallback when confinement
is unavailable. Do not change global namespace/AppArmor settings for installation.
The Ubuntu dependency list includes the managed browser's system libraries and
fallback fonts, as well as the desktop libraries. Check both the desktop and
managed browser on a clean installation; a developer desktop can hide missing
dependencies such as ALSA even when the application window opens.

macOS signing/notarization uses the engine project's reviewed whole-payload
workflow. Sign every required nested object, retain the source/materials bindings,
notarize, staple and verify the final artifact as downloaded. Do not relabel an
ad-hoc preview as a release.

## Acceptance before upload

1. Build from the frozen source/locks and validate all packaged files, notices,
   source routes, CPU/minimum-OS metadata, signatures and final checksums.
2. Install as a fresh user without developer toolchains. Confirm the plugin-free
   onboarding explains how to add sources. Import a trusted test plugin obtained
   explicitly for this check (for example the optional NASA example plugin), review
   its permissions, browse/search/open items and complete a small authorized
   download. Check destinations, history, subscriptions and recovery.
3. Install version A, populate disposable profile state, enable background operation
   and run work. Install genuine version B over it. Verify graceful shutdown,
   engine identity replacement, preserved data and restored startup behavior.
4. Verify installer downgrade refusal and engine refusal of newer database schemas.
   Test uninstall/reinstall without loss of downloaded files; profile deletion
   must remain an explicit user choice.
5. Check the native UI at 1340×860 and 720×560, light/dark, collapsed sidebar,
   keyboard/focus, activation, media placeholders and update shutdown/error states.
6. Repeat the exact final downloaded installer in the declared OS/CPU matrix.
   Cross-compilation, fixture tests and a matching file hash are not that check.

Publish the release, marked as a prerelease, only after reviewing the actual outputs.
Provide installer checksums, install/manual-update instructions, tested systems and
known issues; include the required notices, source/rebuild materials and the
separate engine/CLI/MCP runtime artifacts. Keep reports, machine paths, profiles,
credentials, raw build logs and internal evidence outside the public repositories
and release assets. Source Git preflight and installer acceptance are separate.
