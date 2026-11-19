#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    open_media_downloader_desktop_lib::run();
}
