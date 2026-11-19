//! Native dispatch reports whether the OS accepted the request, without waiting
//! for or taking ownership of the user's reader/editor process.
use std::path::PathBuf;

fn failure(reveal: bool, detail: impl std::fmt::Display) -> String {
    let recovery = if reveal {
        "Check that your file manager is available, or use Copy path."
    } else {
        "Choose a default application for this file type, or use Reveal folder / Copy path."
    };
    format!(
        "The system could not {} this file ({detail}). {recovery}",
        if reveal { "reveal" } else { "open" }
    )
}

pub async fn open(app: &tauri::AppHandle, path: PathBuf, reveal: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        macos_open(path, reveal).await
    }
    #[cfg(any(target_os = "linux", windows))]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            #[cfg(target_os = "linux")]
            {
                use gio::prelude::FileExt;
                let target = if reveal {
                    path.parent().unwrap_or(&path)
                } else {
                    &path
                };
                let uri = gio::File::for_path(target).uri();
                // GIO's async completion includes portal/D-Bus activation errors.
                // xdg-open may stay alive for the reader's entire lifetime, so
                // polling or killing that process cannot establish this result.
                gio::AppInfo::launch_default_for_uri_async(
                    &uri,
                    None::<&gio::AppLaunchContext>,
                    None::<&gio::Cancellable>,
                    move |result| {
                        let _ = sender.send(result.map_err(|error| failure(reveal, error)));
                    },
                );
            }
            #[cfg(windows)]
            {
                let _ = sender.send(windows_open(&path, reveal));
            }
        })
        .map_err(|_| failure(reveal, "the desktop is closing"))?;
        receiver
            .await
            .map_err(|_| failure(reveal, "the desktop closed before dispatch completed"))?
    }
}

#[cfg(target_os = "macos")]
async fn macos_open(path: PathBuf, reveal: bool) -> Result<(), String> {
    use std::process::Stdio;
    let mut command = tokio::process::Command::new("/usr/bin/open");
    if reveal {
        command.arg("-R");
    }
    let mut child = command
        .arg(path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| failure(reveal, error))?;
    // Without -W, open exits after native dispatch; it does not own the viewer.
    match tokio::time::timeout(std::time::Duration::from_secs(20), child.wait()).await {
        Ok(Ok(status)) if status.success() => Ok(()),
        Ok(Ok(status)) => Err(failure(
            reveal,
            format!("native dispatch exited with {status}"),
        )),
        Ok(Err(error)) => Err(failure(reveal, error)),
        Err(_) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            Err(failure(reveal, "native dispatch timed out"))
        }
    }
}

#[cfg(windows)]
fn windows_open(path: &std::path::Path, reveal: bool) -> Result<(), String> {
    use std::{mem::size_of, os::windows::ffi::OsStrExt, ptr};
    use windows_sys::Win32::{
        Foundation::GetLastError,
        System::Com::CoTaskMemFree,
        UI::{
            Shell::{
                SHOpenFolderAndSelectItems, SHParseDisplayName, ShellExecuteExW,
                SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
            },
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    };
    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    // Tauri's Windows UI thread is the existing STA. Do not use explorer.exe's
    // process exit as an acknowledgement of opening a file or selecting an item.
    unsafe {
        if reveal {
            let mut item = ptr::null_mut();
            let parsed = SHParseDisplayName(
                wide.as_ptr(),
                ptr::null_mut(),
                &mut item,
                0,
                ptr::null_mut(),
            );
            if parsed < 0 {
                if !item.is_null() {
                    CoTaskMemFree(item.cast());
                }
                return Err(failure(
                    true,
                    format!("native error 0x{:08x}", parsed as u32),
                ));
            }
            let result = SHOpenFolderAndSelectItems(item, 0, ptr::null(), 0);
            CoTaskMemFree(item.cast());
            if result < 0 {
                return Err(failure(
                    true,
                    format!("native error 0x{:08x}", result as u32),
                ));
            }
        } else {
            let mut request: SHELLEXECUTEINFOW = std::mem::zeroed();
            request.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
            request.fMask = SEE_MASK_FLAG_NO_UI | SEE_MASK_NOASYNC;
            request.lpVerb = windows_sys::core::w!("open");
            request.lpFile = wide.as_ptr();
            request.nShow = SW_SHOWNORMAL;
            if ShellExecuteExW(&mut request) == 0 {
                return Err(failure(false, format!("native error {}", GetLastError())));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn native_opener_failure_is_returned_instead_of_a_successful_spawn() {
        let path = std::env::temp_dir().join(format!(
            "omd-missing-artifact-{:016x}",
            rand::random::<u64>()
        ));
        assert!(!path.exists());
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let error = runtime
            .block_on(super::macos_open(path, false))
            .unwrap_err();
        assert!(error.contains("default application"));
        assert!(error.contains("native dispatch exited"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn native_association_failure_completes_with_an_error() {
        let context = gio::glib::MainContext::new();
        context
            .with_thread_default(|| {
                let uri = format!(
                    "omd-unregistered-{:016x}:///artifact",
                    rand::random::<u64>()
                );
                let error = context
                    .block_on(gio::AppInfo::launch_default_for_uri_future(
                        &uri,
                        None::<&gio::AppLaunchContext>,
                    ))
                    .unwrap_err();
                assert!(super::failure(false, error).contains("default application"));
            })
            .unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn native_dispatch_failure_is_returned_without_an_os_error_dialog() {
        use windows_sys::Win32::System::Com::{
            CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
        };
        std::thread::spawn(|| unsafe {
            assert!(CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32) >= 0);
            let path = std::env::temp_dir().join(format!(
                "omd-missing-artifact-{:016x}.cbz",
                rand::random::<u64>()
            ));
            assert!(!path.exists());
            let error = super::windows_open(&path, false).unwrap_err();
            CoUninitialize();
            assert!(error.contains("default application"));
        })
        .join()
        .unwrap();
    }
}

pub async fn open_url(app: &tauri::AppHandle, url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    { let _ = app; macos_open(PathBuf::from(url), false).await }
    #[cfg(any(target_os = "linux", windows))]
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            #[cfg(target_os = "linux")]
            gio::AppInfo::launch_default_for_uri_async(&url, None::<&gio::AppLaunchContext>, None::<&gio::Cancellable>, move |result| { let _ = sender.send(result.map_err(|e| e.to_string())); });
            #[cfg(windows)]
            { let _ = sender.send(windows_open(std::path::Path::new(&url), false)); }
        }).map_err(|e|e.to_string())?;
        receiver.await.map_err(|e|e.to_string())?
    }
}
