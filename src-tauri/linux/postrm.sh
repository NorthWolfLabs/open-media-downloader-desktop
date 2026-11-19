#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
# An upgrade's old postrm must not unload the replacement package's policy.
case "${1:-}" in remove|purge|disappear) ;; *) exit 0 ;; esac
if [ -r /sys/kernel/security/apparmor/profiles ] &&
   grep -q '^omd_v2_helper ' /sys/kernel/security/apparmor/profiles; then
  if ! command -v apparmor_parser >/dev/null 2>&1; then
    echo 'AppArmor is unavailable; remove the omd_v2_helper profile after restoring it.' >&2
    exit 1
  fi
  # Package files may already be removed. Identify only this package's profile.
  apparmor_parser --remove <<'OMD_PROFILE'
abi <abi/4.0>,
include <tunables/global>
profile omd_v2_helper "/usr/lib/OMD/resources/v2/bin/omd-helper-guardian" flags=(unconfined) {
  userns,
}
OMD_PROFILE
fi
