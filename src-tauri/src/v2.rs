//! Native shell operations only. All acquisition state and file mutations belong
//! to the engine. The v2 profile is separate from every legacy path.
use std::{path::PathBuf,process::{Command,Stdio},time::Duration};
use tauri::{AppHandle,Manager};

use crate::engine_connection::{self, Connection, StartupError};
#[tauri::command]
pub async fn v2_prepare_update(app:AppHandle)->Result<(),String>{
    let resources=resources(&app)?;
    let engine=std::env::var_os("OMD_V2_ENGINE_BINARY").map(PathBuf::from).unwrap_or_else(||resources.join("bin").join(if cfg!(windows){"omd-engine.exe"}else{"omd-engine"}));
    let result=tokio::time::timeout(Duration::from_secs(150),tokio::process::Command::new(engine)
        .arg("--profile").arg(profile(&app)?).arg("--prepare-update")
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).kill_on_drop(true).status()).await
        .map_err(|_|"OMD is still stopping. Wait for downloads to stop and retry.")?
        .map_err(|_|"OMD could not prepare for the update. Reinstall OMD or restart your computer.")?;
    if !result.success(){return Err("OMD could not finish stopping background downloads. Retry after current work stops.".into());}
    app.exit(0);
    Ok(())
}
fn profile(app:&AppHandle)->Result<PathBuf,String>{
 if let Some(path)=std::env::var_os("OMD_V2_PROFILE"){let path=PathBuf::from(path);if !path.is_absolute(){return Err("OMD_V2_PROFILE must be an absolute directory.".into());}return Ok(path);}
 Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join("v2"))
}
fn resources(app:&AppHandle)->Result<PathBuf,String>{let root=app.path().resource_dir().map_err(|e|e.to_string())?;Ok(if root.join("resources/v2/build-inventory.json").is_file(){root.join("resources/v2")}else{root})}
async fn read_connection(path:&std::path::Path)->Option<Connection>{
    let connection=engine_connection::load(path)?;
    engine_connection::service(&connection).await.ok()??;
    Some(connection)
}
#[tauri::command]
pub async fn v2_bootstrap_engine(app:AppHandle)->Result<Connection,StartupError>{
    static STARTUP: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _startup=STARTUP.lock().await;
    let root=profile(&app)?;let instance=root.join("instance.json");
    let development = std::env::var_os("OMD_V2_ENGINE_BINARY");
    let resources = resources(&app)?;
    let engine=development.as_ref().map(PathBuf::from).unwrap_or_else(||resources.join("bin").join(if cfg!(windows){"omd-engine.exe"}else{"omd-engine"}));
    let tools=std::env::var_os("OMD_V2_TOOLS").map(PathBuf::from).or_else(||development.is_none().then(||resources.join("tools/tools-v2.json")));
    let browser_tools=std::env::var_os("OMD_V2_BROWSER_TOOLS").map(PathBuf::from).or_else(||development.is_none().then(||resources.join("browser/browser-tools-v2.json")));
    // People see a plain reinstall message; developer overrides name their variable.
    // Trying again cannot bring missing files back.
    let missing=|variable:&str|StartupError::permanent(if std::env::var_os(variable).is_some(){format!("{variable} does not name an existing file.")}else{"OMD is missing some of its files. Reinstall OMD.".to_string()});
    if browser_tools.as_ref().is_some_and(|path|!path.is_file()) { return Err(missing("OMD_V2_BROWSER_TOOLS")); }
    if tools.as_ref().is_some_and(|path|!path.is_file()) { return Err(missing("OMD_V2_TOOLS")); }
    if !engine.is_file(){return Err(missing("OMD_V2_ENGINE_BINARY"));}
    let expected=engine_connection::expected(&engine).await?;
    // The engine establishes and verifies private profile permissions before the
    // shell reads attachment tokens or opens its launch log. No engine library
    // or sibling checkout is required by this independent frontend.
    let initialized=tokio::time::timeout(Duration::from_secs(15),tokio::process::Command::new(&engine).arg("--profile").arg(&root).arg("--initialize-profile").stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::piped()).kill_on_drop(true).output()).await.map_err(|_|"OMD took too long to prepare your data. Restart your computer, then open OMD again.".to_string())?.map_err(|e|format!("OMD could not start. Reinstall OMD or restart your computer.\n{e}"))?;
    // The first line is for people; the rest appears only under Technical details.
    if !initialized.status.success(){return Err(format!("OMD could not prepare its private data folder. Restart your computer, then open OMD again.\n{}",String::from_utf8_lossy(&initialized.stderr).chars().take(4096).collect::<String>()).into());}
    if let Some(connection)=engine_connection::attach_or_retire(&instance,&expected,Duration::from_secs(120)).await?{return Ok(connection);}
    let log_path=root.join("engine.log");
    if std::fs::metadata(&log_path).is_ok_and(|m|m.len()>10*1024*1024) {
        // Keep one previous bounded launch log; source/tool diagnostics are redacted by the engine.
        let previous=root.join("engine.previous.log");
        if previous.exists(){std::fs::remove_file(&previous).map_err(|e|e.to_string())?;}
        std::fs::rename(&log_path,previous).map_err(|e|e.to_string())?;
    }
    let log=std::fs::OpenOptions::new().create(true).append(true).open(root.join("engine.log")).map_err(|e|e.to_string())?;
    let mut command=Command::new(engine);
    command.arg("--profile").arg(&root);
    if development.is_some(){command.args(["--allowed-origin","http://localhost:1422","--allowed-origin","http://127.0.0.1:1422"]);}
    if let Some(tools)=tools{command.arg("--tools").arg(tools);}
    if let Some(browser_tools)=browser_tools{command.arg("--browser-tools").arg(browser_tools);}
    let mut child=command.stdin(Stdio::null()).stdout(Stdio::from(log.try_clone().map_err(|e|e.to_string())?)).stderr(Stdio::from(log)).spawn().map_err(|e|format!("OMD could not start. Reinstall OMD or restart your computer.\n{e}"))?;
    // The engine may outlive this shell in background mode; reap it whenever
    // it finishes while this shell is still alive.
    std::thread::spawn(move||{let _=child.wait();});
    let deadline=tokio::time::Instant::now()+Duration::from_secs(180);
    while tokio::time::Instant::now()<deadline {
        if let Some(connection)=engine_connection::load(&instance){
            if let Some(identity)=engine_connection::service(&connection).await? {
                if engine_connection::matches(&identity,&expected){return Ok(connection);}
                return Err("Another copy of OMD started at the same time. Quit other OMD windows and try again.".into());
            }
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err(StartupError::from(format!("OMD did not finish starting within three minutes. Restart your computer, then open OMD again.\nDisk and tool verification errors are recorded in {}",root.join("engine.log").display())).with_log())
}

/// Show OMD's startup log in the file manager. The page passes no path: this
/// only ever reveals the current profile's own engine.log.
#[tauri::command]
pub async fn v2_reveal_engine_log(app:AppHandle)->Result<(),String>{
    let log=std::fs::canonicalize(profile(&app)?.join("engine.log")).map_err(|_|"OMD hasn’t written a log file yet.")?;
    crate::artifact_opener::open(&app,log,true).await
}

#[tauri::command]
pub async fn v2_open_artifact(app:AppHandle,job_id:String,artifact_id:String,reveal:bool)->Result<(),String>{
    let connection=read_connection(&profile(&app)?.join("instance.json")).await.ok_or("OMD is still connecting. Try again in a moment.")?;
    if ![job_id.as_str(), artifact_id.as_str()].iter().all(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')) { return Err("Invalid acquisition identity".into()); }
    let http=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(15)).build().map_err(|e|e.to_string())?;
    let file:serde_json::Value=http.get(format!("{}/v2/jobs/{}/files/{}",connection.endpoint,job_id,artifact_id)).bearer_auth(&connection.token).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
    let job:serde_json::Value=http.get(format!("{}/v2/jobs/{}",connection.endpoint,job_id)).bearer_auth(&connection.token).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
    let destination_id = job["destination_id"].as_str().ok_or("Invalid destination identity")?;
    if !destination_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') { return Err("Invalid destination identity".into()); }
    let destination:serde_json::Value=http.get(format!("{}/v2/destinations/{}",connection.endpoint,destination_id)).bearer_auth(&connection.token).send().await.map_err(|e|e.to_string())?.error_for_status().map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
    if destination["available"] != true {return Err("Reconnect the destination before opening a file".into());}
    let root=destination["root"].as_str().ok_or("The destination is unavailable")?;
    let relative=file["relative_path"].as_str().ok_or("Invalid artifact path")?;
    if !std::path::Path::new(relative).components().all(|p|matches!(p,std::path::Component::Normal(_))){return Err("Invalid artifact path".into());}
    let root=std::fs::canonicalize(root).map_err(|_|"The destination is disconnected")?;
    let (path, select) = match std::fs::canonicalize(root.join(relative)) {
        Ok(path) => (path, reveal),
        Err(_) if reveal => (std::fs::canonicalize(root.join(relative).parent().ok_or("Invalid file location")?).map_err(|_|"The download folder is no longer available")?, false),
        Err(_) => return Err("The saved file is no longer at its download location".into()),
    };
    if !path.starts_with(&root){return Err("The saved path is outside its destination".into());}
    crate::artifact_opener::open(&app,path,select).await
}

/// Read the user's preferred OS languages without assuming the WebView locale.
#[tauri::command]
pub fn v2_system_languages()->Vec<String>{
 #[cfg(target_os="macos")]
 {
  use std::ffi::{c_void,c_char};
  #[link(name="CoreFoundation",kind="framework")]
  extern "C" {
   fn CFLocaleCopyPreferredLanguages()->*const c_void;
   fn CFArrayGetCount(array:*const c_void)->isize;
   fn CFArrayGetValueAtIndex(array:*const c_void,index:isize)->*const c_void;
   fn CFStringGetCString(string:*const c_void,buffer:*mut c_char,size:isize,encoding:u32)->bool;
   fn CFRelease(value:*const c_void);
  }
  // Copy owns the array; its strings remain borrowed until the matching release.
  unsafe {
   let array=CFLocaleCopyPreferredLanguages();if array.is_null(){return Vec::new();}
   let mut result=Vec::new();
   for index in 0..CFArrayGetCount(array).min(50){let value=CFArrayGetValueAtIndex(array,index);let mut buffer=[0u8;128];if CFStringGetCString(value,buffer.as_mut_ptr().cast(),buffer.len() as isize,0x08000100){if let Ok(value)=std::ffi::CStr::from_ptr(buffer.as_ptr().cast()).to_str(){result.push(value.to_owned());}}}
   CFRelease(array);return result;
  }
 }
 #[cfg(not(target_os="macos"))]
 { Vec::new() } // The shell falls back to navigator.languages on other platforms.
}

#[tauri::command]
pub async fn v2_open_source(app: AppHandle, url: String) -> Result<(), String> {
    let target = reqwest::Url::parse(&url).map_err(|_| "Invalid source URL")?;
    if !matches!(target.scheme(), "https" | "http") || target.host_str().is_none() || !target.username().is_empty() || target.password().is_some() {
        return Err("Only public web links can be opened".into());
    }
    crate::artifact_opener::open_url(&app, target.to_string()).await
}

/// Run only after the user selects a browser and explicitly requests export.
#[tauri::command]
pub async fn v2_export_source_cookies(app: AppHandle, source_id: String, browser: String, browser_profile: Option<String>) -> Result<Option<crate::cookie_export::ExportedCookies>, String> {
    if browser == "safari" && (!cfg!(target_os = "macos") || browser_profile.is_some()) { return Err("Choose Safari’s cookie file using the file picker on macOS.".into()); }
    if source_id.is_empty() || source_id.len() > 128 || !source_id.bytes().all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c)) { return Err("Choose an installed source.".into()); }
    let connection = read_connection(&profile(&app)?.join("instance.json")).await.ok_or("OMD is still connecting. Try again in a moment.")?;
    let http = reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(15)).build().map_err(|_| "OMD is not connected. Try again in a moment.")?;
    let sources: serde_json::Value = http.get(format!("{}/v2/sources", connection.endpoint)).query(&[("q", source_id.as_str()), ("limit", "200")]).bearer_auth(connection.token).send().await.map_err(|_| "Could not check source permissions")?.error_for_status().map_err(|_| "Could not check source permissions")?.json().await.map_err(|_| "Invalid source permissions")?;
    let manifest = sources["items"].as_array().and_then(|items| items.iter().find(|item| item["manifest"]["id"].as_str() == Some(&source_id))).map(|item| &item["manifest"]).ok_or("The source is no longer installed")?;
    let hosts: Vec<String> = manifest["grants"].as_array().into_iter().flatten().filter(|grant| grant["credential"] == true).flat_map(|grant| grant["hosts"].as_array().into_iter().flatten()).filter_map(|host| host.as_str().map(str::to_owned)).collect();
    if hosts.is_empty() { return Err("This source does not accept sign-in cookies.".into()); }
    let root = resources(&app)?.join("tools").canonicalize().map_err(|_| "The bundled media tools are unavailable")?;
    let tools: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("tools-v2.json")).map_err(|_| "OMD’s download tools are missing. Reinstall OMD.")?).map_err(|_| "OMD’s download tools are damaged. Reinstall OMD.")?;
    let relative = tools["yt_dlp"]["path"].as_str().ok_or("The cookie export tool is unavailable")?;
    let executable = root.join(relative).canonicalize().map_err(|_| "The cookie export tool is unavailable")?;
    if !executable.starts_with(&root) || !executable.is_file() { return Err("Invalid cookie export tool path".into()); }
    let downloads = app.path().download_dir().map_err(|_| "The Downloads folder is unavailable")?;
    let cache = app.path().app_cache_dir().map_err(|_| "The temporary folder is unavailable")?;
    if browser == "safari" {
        use tauri_plugin_dialog::DialogExt;
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let mut picker = app.dialog().file()
            .set_title("Choose Safari’s Cookies.binarycookies file")
            .add_filter("Safari cookie file", &["binarycookies"])
            .set_can_create_directories(false)
            .set_directory(app.path().home_dir().map_err(|_| "Your home folder is unavailable")?.join("Library/Containers/com.apple.Safari/Data/Library/Cookies"));
        if let Some(window) = app.get_webview_window("main") { picker = picker.set_parent(&window); }
        picker.pick_file(move |file| { let _ = sender.send(file); });
        let Some(file) = receiver.await.map_err(|_| "The file picker closed unexpectedly. Try again.")? else { return Ok(None); };
        let selected = file.into_path().map_err(|_| "Choose a file on this Mac.")?;
        return crate::cookie_export::export_selected_safari(&executable, &cache, &downloads, &selected, &hosts).await.map(Some);
    }
    crate::cookie_export::export(&executable, &cache, &downloads, &browser, browser_profile.as_deref(), &hosts).await.map(Some)
}
