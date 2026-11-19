//! Explicit, user-started export. No shell, network requests, or browser automation.
use std::{path::{Path, PathBuf}, io::Write, process::Stdio, sync::atomic::{AtomicBool, Ordering}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tokio::io::AsyncWriteExt;
use std::io::Read;

static EXPORTING: AtomicBool = AtomicBool::new(false);
struct ExportGuard;
impl Drop for ExportGuard { fn drop(&mut self) { EXPORTING.store(false, Ordering::Release); } }
struct PrivateDirectory(PathBuf);
impl Drop for PrivateDirectory { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

#[derive(serde::Serialize)]
pub struct ExportedCookies { pub name: String, pub text: String }

fn filter_cookies(text: &str, hosts: &[String], now: u64) -> Result<String, String> {
    let mut output = String::from("# Netscape HTTP Cookie File\n");
    let mut count = 0;
    for line in text.lines() {
        let fields_line = line.strip_prefix("#HttpOnly_").unwrap_or(line);
        if fields_line.trim().is_empty() || fields_line.starts_with('#') { continue; }
        let fields: Vec<_> = fields_line.split('\t').collect();
        if fields.len() != 7 { return Err("The browser returned an invalid cookie file. Try another browser or choose an existing file.".into()); }
        let domain = fields[0].trim_start_matches('.').to_ascii_lowercase();
        let allowed = hosts.iter().any(|host| {
            let host = host.to_ascii_lowercase();
            match host.strip_prefix("*.") { Some(suffix) => domain.ends_with(&format!(".{suffix}")), None => domain == host }
        });
        if !allowed { continue; }
        let expiry: u64 = fields[4].parse().map_err(|_| "The browser returned invalid cookie dates.")?;
        if expiry != 0 && expiry <= now { continue; }
        count += 1;
        if count > 512 || output.len() + line.len() > 1024 * 1024 { return Err("This source has too many cookies to import.".into()); }
        output.push_str(line); output.push('\n');
    }
    if count == 0 { return Err("No current cookies were found for this source. Sign in in the selected browser profile, then try again.".into()); }
    Ok(output)
}

pub async fn export(executable: &Path, cache: &Path, downloads: &Path, browser: &str, profile: Option<&str>, hosts: &[String]) -> Result<ExportedCookies, String> {
    if !["chrome", "firefox", "edge", "brave"].contains(&browser) { return Err("Choose a supported browser. For Safari, choose its cookie file.".into()); }
    export_inner(executable, cache, downloads, browser, profile, hosts, None).await
}

/// The caller obtains this path from the native open panel, never from the WebView.
pub async fn export_selected_safari(executable: &Path, cache: &Path, downloads: &Path, selected: &Path, hosts: &[String]) -> Result<ExportedCookies, String> {
    if !cfg!(target_os = "macos") { return Err("Safari cookie import is available on macOS.".into()); }
    // Read in OMD while it has the user's file selection grant. The subprocess
    // sees only a private copy and never tries to access Safari's protected store.
    let data = read_selected_safari(selected)?;
    export_inner(executable, cache, downloads, "safari", None, hosts, Some(&data)).await
}

fn read_selected_safari(selected: &Path) -> Result<Vec<u8>, String> {
    let denied = |error: std::io::Error| {
        if error.kind() == std::io::ErrorKind::PermissionDenied || error.raw_os_error() == Some(1) {
            "macOS did not allow access to the selected file. Choose a copy of the file that you can open, or import a cookies.txt file instead."
        } else {
            "The selected file is no longer available. Choose it again."
        }.to_owned()
    };
    let file = std::fs::File::open(selected).map_err(denied)?;
    if !file.metadata().map_err(denied)?.is_file() { return Err("Choose the Cookies.binarycookies file, not a folder.".into()); }
    let mut data = Vec::new();
    file.take(16 * 1024 * 1024 + 1).read_to_end(&mut data).map_err(denied)?;
    if data.len() > 16 * 1024 * 1024 { return Err("This Safari cookie file is too large. Choose a cookies.txt export instead.".into()); }
    if !data.starts_with(b"cook") { return Err("This is not a Safari cookie file. Choose Cookies.binarycookies. If you have a cookies.txt file, use Choose file in the import form.".into()); }
    Ok(data)
}

async fn export_inner(executable: &Path, cache: &Path, downloads: &Path, browser: &str, profile: Option<&str>, hosts: &[String], safari_data: Option<&[u8]>) -> Result<ExportedCookies, String> {
    let profile = profile.unwrap_or("").trim();
    if profile.len() > 1024 || profile.chars().any(|c| c.is_control()) { return Err("Use a valid browser profile name or path.".into()); }
    if EXPORTING.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() { return Err("A cookie export is already running.".into()); }
    let _guard = ExportGuard;
    std::fs::create_dir_all(cache).map_err(|_| "The temporary folder is unavailable.")?;
    let directory = cache.join(format!("cookie-export-{:016x}", rand::random::<u64>()));
    let mut builder = std::fs::DirBuilder::new();
    #[cfg(unix)] { use std::os::unix::fs::DirBuilderExt; builder.mode(0o700); }
    builder.create(&directory).map_err(|_| "Could not create a private export folder.")?;
    let temporary = PrivateDirectory(directory);
    let raw = temporary.0.join("cookies.txt");
    let mut options = std::fs::OpenOptions::new(); options.write(true).create_new(true);
    #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
    options.open(&raw).and_then(|mut file| file.write_all(b"# Netscape HTTP Cookie File\n")).map_err(|_| "Could not create the temporary cookie file.")?;
    let selection = if let Some(data) = safari_data {
        let selected_copy = temporary.0.join("selected.binarycookies");
        options.open(&selected_copy).and_then(|mut file| file.write_all(data)).map_err(|_| "Could not prepare the selected Safari file.")?;
        format!("safari:{}", selected_copy.to_string_lossy())
    } else if profile.is_empty() { browser.to_owned() } else { format!("{browser}:{profile}") };
    let mut command = tokio::process::Command::new(executable);
    command.args(["--ignore-config", "--no-plugin-dirs", "--no-cache-dir", "--cookies-from-browser", &selection, "--cookies"])
        .arg(&raw).args(["--load-info-json", "-"]).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)] command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|_| "The cookie export tool could not start.")?;
    let mut stdin = child.stdin.take().ok_or("Could not start cookie export.")?;
    stdin.write_all(b"[]").await.map_err(|_| "The cookie export tool stopped unexpectedly.")?;
    drop(stdin);
    let status = match tokio::time::timeout(Duration::from_secs(120), child.wait()).await {
        Ok(result) => result.map_err(|_| "The cookie export tool stopped unexpectedly.")?,
        Err(_) => { let _ = child.kill().await; return Err(if browser == "safari" { "Converting the selected Safari file timed out. Choose the file again or import a cookies.txt file instead." } else { "Export timed out. Unlock your operating system’s credential store and try again." }.into()); }
    };
    if !status.success() {
        return Err(if browser == "safari" {
            "The selected Safari file could not be converted. It may be damaged or use an unsupported format. Choose another file or import a cookies.txt file instead."
        } else {
            "Could not read cookies from this browser profile. Close the browser and allow credential-store access if prompted. You can also choose an existing cookie file or try another browser."
        }.into());
    }
    if std::fs::metadata(&raw).map_err(|_| "No cookie file was created.")?.len() > 16 * 1024 * 1024 { return Err("The browser’s cookie export is too large. Use a separate browser profile for this source.".into()); }
    let raw_text = std::fs::read_to_string(&raw).map_err(|_| "Could not read the exported cookies.")?;
    let text = filter_cookies(&raw_text, hosts, SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())?;
    // Only scoped cookies leave the temporary folder; it is removed on every exit.
    let name = format!("omd-cookies-{:016x}.txt", rand::random::<u64>());
    let destination = downloads.join(&name);
    let mut output = options.open(&destination).map_err(|_| "Could not save the cookie file in Downloads.")?;
    if output.write_all(text.as_bytes()).is_err() { drop(output); let _ = std::fs::remove_file(destination); return Err("The cookie file could not be saved completely.".into()); }
    Ok(ExportedCookies { name, text })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scopes_export_before_it_leaves_private_storage() {
        let data = "#HttpOnly_.media.example\tTRUE\t/\tTRUE\t0\tSID\tFAKE\n.other.example\tTRUE\t/\tTRUE\t0\tSID\tOTHER\nnotmedia.example\tFALSE\t/\tTRUE\t0\tk\tOTHER\nwww.media.example\tFALSE\t/\tTRUE\t100\tk\tOLD\n";
        let result = filter_cookies(data, &["media.example".into(), "www.media.example".into()], 100).unwrap();
        assert!(result.contains("#HttpOnly_.media.example")); assert!(!result.contains("OTHER")); assert!(!result.contains("OLD"));
        assert!(filter_cookies(data, &["www.media.example".into()], 100).is_err());
    }
    #[test]
    fn malformed_errors_do_not_echo_credentials() {
        let error = filter_cookies("SECRET", &["example.com".into()], 0).unwrap_err();
        assert!(!error.contains("SECRET"));
    }
    #[test]
    fn selected_safari_file_rejects_wrong_format_without_echoing_bytes() {
        let directory = PrivateDirectory(std::env::temp_dir().join(format!("omd-safari-invalid-{:016x}", rand::random::<u64>())));
        std::fs::create_dir(&directory.0).unwrap();
        let selected = directory.0.join("Cookies.binarycookies");
        std::fs::write(&selected, "SYNTHETIC_SECRET").unwrap();
        let error = read_selected_safari(&selected).unwrap_err();
        assert!(error.contains("not a Safari cookie file"));
        assert!(!error.contains("SYNTHETIC_SECRET"));
        assert!(!error.contains(directory.0.to_str().unwrap()));
    }
    #[test]
    #[cfg(target_os = "macos")]
    #[ignore = "requires bundled yt-dlp and a synthetic Safari binary cookie file"]
    fn bundled_safari_export_scopes_and_cleans_up() {
        let root = PathBuf::from(std::env::var_os("OMD_COOKIE_EXPORT_TEST_ROOT").expect("fixture root"));
        let tool = PathBuf::from(std::env::var_os("OMD_COOKIE_EXPORT_TEST_TOOL").expect("bundled tool"));
        assert!(root.join("SYNTHETIC_FIXTURE").is_file());
        let run = PrivateDirectory(root.join(format!("safari-test-{:016x}", rand::random::<u64>())));
        std::fs::create_dir(&run.0).unwrap();
        let downloads = run.0.join("downloads"); std::fs::create_dir(&downloads).unwrap();
        let cache = run.0.join("cache");
        let profile = root.join("Cookies.binarycookies");
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let result = runtime.block_on(export_selected_safari(&tool, &cache, &downloads, &profile, &["media.example".into()])).unwrap();
        assert!(result.text.contains("FAKE_MEDIA")); assert!(!result.text.contains("FAKE_OTHER")); assert!(!result.text.contains("FAKE_EXPIRED"));
        assert_eq!(std::fs::read_to_string(downloads.join(&result.name)).unwrap(), result.text);
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(std::fs::metadata(downloads.join(&result.name)).unwrap().permissions().mode() & 0o777, 0o600);
        assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 0);
        let failure = runtime.block_on(export_selected_safari(&tool, &cache, &downloads, &root.join("missing.binarycookies"), &["media.example".into()])).err().unwrap();
        assert!(failure.contains("no longer available"));
        assert!(!failure.contains("Full Disk Access"));
        assert!(!failure.contains(root.to_str().unwrap()));
        assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 0);
        assert_eq!(std::fs::read_dir(&downloads).unwrap().count(), 1);
    }
    #[test]
    #[ignore = "requires the bundled tool and a disposable synthetic Firefox profile"]
    fn bundled_export_scopes_and_cleans_up() {
        let root = PathBuf::from(std::env::var_os("OMD_COOKIE_EXPORT_TEST_ROOT").expect("fixture root"));
        let tool = PathBuf::from(std::env::var_os("OMD_COOKIE_EXPORT_TEST_TOOL").expect("bundled tool"));
        assert!(root.join("SYNTHETIC_FIXTURE").is_file());
        let downloads = root.join("downloads"); std::fs::create_dir_all(&downloads).unwrap();
        let cache = root.join("cache");
        let profile = root.join("firefox");
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let result = runtime.block_on(export(&tool, &cache, &downloads, "firefox", profile.to_str(), &["media.example".into()])).unwrap();
        assert!(result.text.contains("FAKE_MEDIA")); assert!(!result.text.contains("FAKE_OTHER"));
        assert_eq!(std::fs::read_to_string(downloads.join(&result.name)).unwrap(), result.text);
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(downloads.join(&result.name)).unwrap().permissions().mode() & 0o777, 0o600); }
        assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 0);
        let failure = runtime.block_on(export(&tool, &cache, &downloads, "firefox", root.join("missing").to_str(), &["media.example".into()]));
        assert!(failure.is_err()); assert_eq!(std::fs::read_dir(&cache).unwrap().count(), 0);
        assert_eq!(std::fs::read_dir(&downloads).unwrap().count(), 1);
    }
}
