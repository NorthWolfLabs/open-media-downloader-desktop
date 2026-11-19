//! Native window/webview background behind the page on Linux.
//!
//! WebKitGTK paints its default white background before the page's first frame,
//! which flashes in dark mode. Tauri's `set_background_color` sets both the GTK
//! window and the WebKitWebView, so `setup` applies it right after Tauri creates
//! the configured window and before the GTK main loop draws it.
//!
//! Dark or light is read the way WebKitGTK decides `prefers-color-scheme` for the
//! page: from the window's GTK settings (prefer-dark, which tao also sets from the
//! XDG portal colour scheme, or a dark theme name) and `GTK_THEME`. Tauri's own
//! `theme()` only reports the portal, so a desktop without the portal that still
//! renders the page dark would keep a light frame. A Light/Dark override chosen
//! inside OMD is only known to the page. The colours are the Linux page background
//! (`--bg` for `data-appearance="linux"` in src/v2/ui/tokens.css).
use tauri::window::Color;

/// `--bg` in the Linux light theme.
const LIGHT: Color = Color(0xfa, 0xfa, 0xfb, 0xff);
/// `--bg` in the Linux dark theme.
const DARK: Color = Color(0x22, 0x22, 0x26, 0xff);

/// Mirrors WebKitGTK's dark-appearance test for a GTK 3 web view.
pub fn is_dark(prefer_dark: bool, theme_name: Option<&str>, gtk_theme_env: Option<&str>) -> bool {
    let dark_name = |name: &str| name.ends_with("-dark") || name.ends_with("-Dark") || name.ends_with(":dark");
    prefer_dark || theme_name.is_some_and(dark_name) || gtk_theme_env.is_some_and(|name| name.ends_with(":dark"))
}

pub fn color_for(dark: bool) -> Color {
    if dark { DARK } else { LIGHT }
}

#[cfg(target_os = "linux")]
pub fn apply<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    use gtk::prelude::GtkSettingsExt;
    let dark = match gtk::Settings::default() {
        Some(settings) => is_dark(
            settings.is_gtk_application_prefer_dark_theme(),
            settings.gtk_theme_name().as_deref(),
            std::env::var("GTK_THEME").ok().as_deref(),
        ),
        None => window.theme().is_ok_and(|theme| theme == tauri::Theme::Dark),
    };
    if let Err(error) = window.set_background_color(Some(color_for(dark))) {
        eprintln!("OMD could not set the window background: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_webkitgtk_dark_appearance() {
        assert!(is_dark(true, Some("Yaru"), None));
        assert!(is_dark(false, Some("Yaru-dark"), None));
        assert!(is_dark(false, Some("Adwaita-Dark"), None));
        assert!(is_dark(false, Some("Adwaita"), Some("Adwaita:dark")));
        assert!(!is_dark(false, Some("Adwaita"), None));
        assert!(!is_dark(false, None, Some("Adwaita")));
        assert!(!is_dark(false, Some("Darkness"), None));
    }

    #[test]
    fn matches_the_linux_page_background() {
        assert_eq!(color_for(true), Color(0x22, 0x22, 0x26, 0xff));
        assert_eq!(color_for(false), Color(0xfa, 0xfa, 0xfb, 0xff));
        let tokens = include_str!("../../src/v2/ui/tokens.css");
        let linux = &tokens[tokens.find(":root[data-appearance=\"linux\"]").unwrap()..];
        let linux = &linux[..linux.find(":root[data-appearance=\"macos\"]").unwrap()];
        assert!(linux.contains("--bg: #fafafb;"));
        assert!(linux.contains("--bg: #222226;"));
    }
}
