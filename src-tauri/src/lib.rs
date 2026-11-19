//! Acquisition-only adapters for the public Rust engine contract.
mod v2;
mod engine_connection;
mod artifact_opener;
mod titlebar;
mod themes;
mod cookie_export;
// Only Linux applies it; the colours are unit tested everywhere.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod window_background;
// Only Windows calls into it; the messages are unit tested everywhere.
#[cfg_attr(not(windows), allow(dead_code))]
mod webview_runtime;

pub fn run() {
    // Before any window exists: a missing WebView2 Runtime otherwise leaves a
    // blank window and a running process after Tauri's own error box.
    #[cfg(windows)]
    webview_runtime::require();
    // Opt-in geometry-only diagnostics for native title-bar regression checks.
    // No file names, source data or profile contents are logged.
    let trace_geometry = cfg!(debug_assertions)
        && std::env::var_os("OMD_TRACE_WINDOW_GEOMETRY").is_some();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            // Runs right after Tauri creates the configured window and before the
            // GTK main loop draws it, so WebKitGTK's first frame is not white.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    window_background::apply(&window);
                }
            }
            if trace_geometry {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(position) = window.outer_position() {
                        eprintln!("OMD_WINDOW_POSITION {},{}", position.x, position.y);
                    }
                }
            }
            Ok(())
        })
        .on_window_event(move |_window, event| {
            #[cfg(target_os = "linux")]
            if let tauri::WindowEvent::ThemeChanged(_) = event {
                use tauri::Manager;
                if let Some(window) = _window.get_webview_window(_window.label()) {
                    window_background::apply(&window);
                }
            }
            if trace_geometry {
                if let tauri::WindowEvent::Moved(position) = event {
                    eprintln!("OMD_WINDOW_POSITION {},{}", position.x, position.y);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            v2::v2_bootstrap_engine,
            v2::v2_prepare_update,
            v2::v2_system_languages,
            v2::v2_open_artifact,
            v2::v2_open_source,
            v2::v2_reveal_engine_log,
            v2::v2_export_source_cookies,
            themes::v2_read_theme,
            themes::v2_write_theme,
            titlebar::v2_set_titlebar_drag_regions
        ])
        .run(tauri::generate_context!())
        .expect("failed to run the OMD acquisition desktop");
}
