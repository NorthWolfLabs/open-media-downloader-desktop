; The installed engine implements authenticated, bounded shutdown. This
; process exits before NSIS replaces/removes it. Never kill by executable name.
!include "LogicLib.nsh"
!macro OMD_PREPARE_UPDATE suffix
  Push $R0
  Push $R1
  IfFileExists "$INSTDIR\resources\v2\bin\omd-engine.exe" 0 omd_update_done_${suffix}
  nsExec::ExecToStack '"$INSTDIR\resources\v2\bin\omd-engine.exe" --profile "$APPDATA\labs.northwolf.omd\v2" --prepare-update'
  Pop $R0
  Pop $R1
  ${If} $R0 != 0
    Pop $R1
    Pop $R0
    MessageBox MB_OK|MB_ICONSTOP "OMD could not finish stopping its background engine. Quit OMD and retry. Your files and settings have been kept."
    Abort
  ${EndIf}
  omd_update_done_${suffix}:
  Pop $R1
  Pop $R0
!macroend

; Silent NSIS installs skip the reinstall page that initializes Tauri's $R0
; version comparison. Re-read the installed version before shutdown or file writes.
!macro OMD_REFUSE_DOWNGRADE
  Push $R0
  Push $R1
  ReadRegStr $R0 HKCU "${UNINSTKEY}" "DisplayVersion"
  ${If} $R0 != ""
    nsis_tauri_utils::SemverCompare "${VERSION}" $R0
    Pop $R1
    ${If} $R1 == -1
      ${IfNot} ${Silent}
        MessageBox MB_OK|MB_ICONSTOP "A newer version of OMD is installed. Install the same or a newer version. Your files and settings have been kept."
      ${EndIf}
      SetErrorLevel 1638
      Quit
    ${EndIf}
  ${EndIf}
  Pop $R1
  Pop $R0
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro OMD_REFUSE_DOWNGRADE
  !insertmacro OMD_PREPARE_UPDATE install
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro OMD_PREPARE_UPDATE uninstall
!macroend
