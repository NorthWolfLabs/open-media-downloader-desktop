#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
case "${1:-configure}" in configure) ;; *) exit 0 ;; esac

omd_guardian='/usr/lib/OMD/resources/v2/bin/omd-helper-guardian'
omd_policy='/etc/apparmor.d/omd-v2-helper'
if [ ! -f "$omd_guardian" ] || [ ! -x "$omd_guardian" ]; then
  echo 'OMD installation is incomplete: its packaged helper guardian is missing.' >&2
  exit 1
fi
# An executable covered by this profile must not be replaceable by an ordinary
# account. Inspect every path component, including the executable itself.
omd_part="$omd_guardian"
while :; do
  if [ -L "$omd_part" ] || [ "$(stat -c %u "$omd_part")" != 0 ]; then
    echo 'OMD helper installation must use root-owned paths without symlinks.' >&2
    exit 1
  fi
  omd_mode=$(stat -c %a "$omd_part")
  if [ "$((0$omd_mode & 022))" -ne 0 ]; then
    echo 'OMD helper installation must not be writable by other accounts.' >&2
    exit 1
  fi
  [ "$omd_part" = / ] && break
  omd_part=$(dirname "$omd_part")
done

if [ -r /sys/module/apparmor/parameters/enabled ] &&
   [ "$(cat /sys/module/apparmor/parameters/enabled)" = Y ]; then
  if ! command -v apparmor_parser >/dev/null 2>&1; then
    echo 'Install AppArmor 4 or newer to load OMD’s required helper policy.' >&2
    exit 1
  fi
  apparmor_parser --replace --write-cache "$omd_policy"
fi
