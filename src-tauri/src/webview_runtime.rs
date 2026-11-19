//! Windows needs the Microsoft Edge WebView2 Runtime, a separate system component.
//! Without it, Tauri shows its own "Could not find the WebView2 Runtime" box and then
//! fails window setup inside the event loop. That left a blank window and a running
//! process. OMD makes the same check before any window exists, explains the problem,
//! offers the download page and exits.

pub const DOWNLOAD_PAGE: &str = "https://developer.microsoft.com/microsoft-edge/webview2/";

/// The message for a missing runtime, or None when the runtime reported a version.
/// `version` is the result of the same check Tauri makes (`wry::webview_version`).
pub fn missing_runtime<E>(version: &Result<String, E>) -> Option<String> {
    version.is_err().then(|| {
        format!(
            "OMD needs the Microsoft Edge WebView2 Runtime, but Windows couldn’t find it for this account.\n\n\
             Install it from {DOWNLOAD_PAGE}, then open OMD again.\n\n\
             Open the download page now?"
        )
    })
}

/// Shown when the main thread panics. One possible cause is a web view that cannot
/// be created even though the runtime is installed, so the repair is offered last.
pub fn unexpected_stop() -> String {
    format!(
        "OMD ran into an unexpected problem and needs to close.\n\n\
         Open OMD again. If this keeps happening when OMD opens, repairing the Microsoft Edge WebView2 Runtime may help: {DOWNLOAD_PAGE}"
    )
}

/// The event loop, window setup and web view creation all run on the main thread.
/// A panic there leaves no usable window, so it ends OMD.
pub fn ends_app(thread_name: Option<&str>) -> bool {
    thread_name == Some("main")
}

/// Call before building the Tauri app. This checks the Evergreen runtime only: a
/// `fixedRuntime` webviewInstallMode is set up later, inside `Builder::build`, so
/// scripts/build-public.mjs refuses that mode for public builds.
#[cfg(windows)]
pub fn require() {
    if let Some(message) = missing_runtime(&tauri::webview_version()) {
        if ask(&message) {
            open_download_page();
        }
        std::process::exit(1);
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        previous(info);
        if !ends_app(std::thread::current().name()) {
            return;
        }
        // Only the first panic shows the box. A message box pumps messages on its
        // own thread, so it runs on a helper thread: the app's window procedures on
        // the main thread cannot run (and panic again) while it is open.
        static SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
        if !SHOWN.swap(true, std::sync::atomic::Ordering::SeqCst) {
            let notice = std::thread::Builder::new()
                .name("omd-panic-notice".into())
                .spawn(|| tell(&unexpected_stop()));
            if let Ok(notice) = notice {
                let _ = notice.join();
            }
        }
        std::process::exit(1);
    }));
}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(Some(0)).collect()
}

#[cfg(windows)]
fn message_box(text: &str, style: u32) -> i32 {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_SETFOREGROUND};
    let (text, title) = (wide(text), wide("OMD"));
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), style | MB_SETFOREGROUND) }
}

#[cfg(windows)]
fn ask(text: &str) -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{IDYES, MB_ICONERROR, MB_YESNO};
    message_box(text, MB_ICONERROR | MB_YESNO) == IDYES
}

#[cfg(windows)]
fn tell(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK};
    message_box(text, MB_ICONERROR | MB_OK);
}

/// Returns once the browser launch has been handed off, because OMD exits next.
#[cfg(windows)]
fn open_download_page() {
    use windows_sys::Win32::{
        System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED, COINIT_DISABLE_OLE1DDE},
        UI::{
            Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW},
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    };
    let (verb, page) = (wide("open"), wide(DOWNLOAD_PAGE));
    unsafe {
        // ShellExecuteEx may hand off through COM; this runs before Tauri sets up the thread.
        CoInitializeEx(std::ptr::null(), (COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE) as u32);
        let mut request: SHELLEXECUTEINFOW = std::mem::zeroed();
        request.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        // NOASYNC: return only after the launch is handed off, not on a background thread.
        request.fMask = SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
        request.lpVerb = verb.as_ptr();
        request.lpFile = page.as_ptr();
        request.nShow = SW_SHOWNORMAL;
        ShellExecuteExW(&mut request);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_runtime_is_explained_with_the_download_page() {
        let message = missing_runtime(&Err::<String, ()>(())).expect("missing runtime");
        assert!(message.starts_with("OMD needs the Microsoft Edge WebView2 Runtime"));
        assert!(message.contains("Install it from https://developer.microsoft.com/microsoft-edge/webview2/, then open OMD again."));
        assert!(message.ends_with("Open the download page now?"));
        assert_eq!(DOWNLOAD_PAGE, "https://developer.microsoft.com/microsoft-edge/webview2/");
    }

    #[test]
    fn an_installed_runtime_needs_no_message() {
        assert_eq!(missing_runtime(&Ok::<_, ()>("131.0.2903.70".to_string())), None);
    }

    #[test]
    fn only_main_thread_panics_end_the_app() {
        assert!(ends_app(Some("main")));
        assert!(!ends_app(Some("tokio-runtime-worker")));
        assert!(!ends_app(None));
        let stop = unexpected_stop();
        assert!(stop.starts_with("OMD ran into an unexpected problem and needs to close."));
        assert!(stop.contains("may help") && stop.ends_with(DOWNLOAD_PAGE));
    }
}
