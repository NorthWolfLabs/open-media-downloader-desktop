# Install and update OMD

OMD updates are manual downloads. There is no automatic updater, background
update download or update server. Install a newer release using the same package
format and installation scope. Release notes identify the tested OS and CPU.

## Before updating

Open Settings → Updates → **Quit for update**. OMD stops background downloads and
quits after it releases your data. Completed files, installed sources, settings,
subscriptions and download history remain. Unfinished downloads may need Resume
or Retry after restarting. Never replace files while an update reports it is still
stopping; wait and retry.

The background preference is kept. Startup registration is suspended during the
update and restored when the new version next opens. Reopen OMD after installation.
The Windows installer also requests this shutdown when replacing an installation.

## macOS

Open the newer release's DMG and replace OMD.app in Applications. Keep its name and
location consistent. Open the installed application after replacement, rather than
running it from the disk image. Use the Developer ID signed, notarized download;
an ad-hoc development preview is a different build and may have a separate profile.

## Windows

Run the newer Setup.exe using the same Windows account. The installer uses
per-user installation; administrator installation is not needed. Keep the existing
installation directory. Let the installer close OMD, then reopen it after setup.
The installer refuses version downgrades. A missing WebView2 runtime is downloaded
by Microsoft's bootstrapper, so the first installation may need internet access.
If OMD later can't find the WebView2 Runtime for your account, it says so, offers
Microsoft's download page (https://developer.microsoft.com/microsoft-edge/webview2/)
and closes. Install the runtime, then open OMD again.

Signing and any remaining Windows trust warnings are stated in the release notes.
Do not disable system-wide security features to make an unverified build run.

## Linux

The initial package target is Ubuntu 24.04 x86-64 with its required dependencies,
AppArmor policy, unprivileged namespaces, seccomp and Landlock ABI 3 or newer.
Check the release's tested-system list; a build in WSL does not establish sandbox
support on its kernel. AppImage/RPM and additional distributions need separate
installation and confinement checks before they are offered.

After quitting OMD for update, install a newer Debian package with:

```sh
sudo apt install ./omd_NEW-VERSION_amd64.deb
```

Use the package manager to uninstall it. The public package name is omd, its
launcher is omd-desktop, and its runtime resources are under /usr/lib/OMD.
Downloaded media is stored in user-selected destinations, not the package tree.

## Profiles and recovery

The public application keeps the stable identity labs.northwolf.omd. Its data
directories are listed in [getting started](getting-started.md). Installers replace
application files, not this profile or downloaded media. Keep development/preview
profiles separate; copying their databases into a public profile is not an upgrade.

Before applying new database migrations, OMD creates a private, consistent
pre-migration-…sqlite3 snapshot beside the database. The snapshot includes committed
WAL data. It is not a complete backup of source packages, credentials or downloaded
files. Keep a separate backup of your profile and important media before installing
a new version. Backups may contain sensitive data; do not attach them to issues.

An older version of OMD refuses a database containing newer migrations. Reinstall the
newer release, or recover a complete compatible profile backup into a separate
directory. Database rollback does not undo files created or changed after that
backup. Do not delete migration records, edit database versions or overwrite a
running database to force a downgrade.
