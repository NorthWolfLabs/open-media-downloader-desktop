//! Authenticated engine attachment and manual-update handover. No PID killing,
//! database access, preference changes or dependency on engine source code.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::Path, time::Duration};

#[derive(Clone, Serialize, Deserialize)]
pub struct Connection {
    pub endpoint: String,
    pub token: String,
    pub admin_token: String,
}
/// A startup failure the window can act on. The message's first line is for
/// people; later lines are diagnostics. `retryable` is false when trying again
/// cannot help (reinstall, or a newer OMD owns the data), `newer_version` marks
/// the newer-OMD case, and `log` says the profile's startup log may explain more.
#[derive(Debug, Serialize, PartialEq)]
pub struct StartupError {
    pub message: String,
    pub retryable: bool,
    pub newer_version: bool,
    pub log: bool,
}
impl StartupError {
    pub fn permanent(message: impl Into<String>) -> Self {
        Self { message: message.into(), retryable: false, newer_version: false, log: false }
    }
    pub fn newer_version(message: impl Into<String>) -> Self {
        Self { newer_version: true, ..Self::permanent(message) }
    }
    pub fn with_log(self) -> Self {
        Self { log: true, ..self }
    }
}
impl From<String> for StartupError {
    fn from(message: String) -> Self {
        Self { message, retryable: true, newer_version: false, log: false }
    }
}
impl From<&str> for StartupError {
    fn from(message: &str) -> Self {
        message.to_string().into()
    }
}
pub const DAMAGED: &str = "OMD is damaged or incomplete. Reinstall OMD.";
pub const NEWER_VERSION: &str = "A newer version of OMD is using your data. Install the newer OMD; going back to an older version is not supported.";

#[derive(Deserialize)]
pub struct Identity {
    pub api: String,
    pub version: String,
    pub executable_sha256: String,
}

fn endpoint(value: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(value) else {
        return false;
    };
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none()
}
pub fn load(path: &Path) -> Option<Connection> {
    use std::io::Read;
    if !std::fs::symlink_metadata(path).ok()?.file_type().is_file() {
        return None;
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .ok()?
        .take(65537)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 65536 {
        return None;
    }
    let value: Connection = serde_json::from_slice(&bytes).ok()?;
    (endpoint(&value.endpoint)
        && [&value.token, &value.admin_token]
            .iter()
            .all(|token| !token.is_empty() && token.len() <= 256))
    .then_some(value)
}
fn http() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(3))
        .build()
        .map_err(|_| "OMD could not prepare its connection. Quit OMD and try again.".into())
}
pub async fn service(connection: &Connection) -> Result<Option<Value>, String> {
    if !endpoint(&connection.endpoint) {
        return Err("OMD’s saved connection is invalid. Quit OMD and try again.".into());
    }
    let response = http()?
        .get(format!("{}/v2/service", connection.endpoint))
        .bearer_auth(&connection.token)
        .send()
        .await;
    let mut response = match response {
        Ok(response) => response,
        Err(error) if error.is_connect() || error.is_timeout() => return Ok(None),
        Err(_) => return Err("OMD is already running in the background but could not be checked. Quit OMD and try again.".into()),
    };
    if !response.status().is_success() {
        return Err("OMD is already running in the background but refused this window. Quit OMD and try again.".into());
    }
    let mut data = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "OMD is already running in the background but did not respond correctly. Quit OMD and try again.")?
    {
        if data.len() + chunk.len() > 65536 {
            return Err("OMD is already running in the background but did not respond correctly. Quit OMD and try again.".into());
        }
        data.extend_from_slice(&chunk);
    }
    let value: Value =
        serde_json::from_slice(&data).map_err(|_| "OMD is already running in the background but did not respond correctly. Quit OMD and try again.")?;
    if value["api"] != "v2" {
        return Err(
            "A different version of OMD is running in the background. Quit OMD, then reinstall OMD."
                .into(),
        );
    }
    Ok(Some(value))
}
pub async fn expected(binary: &Path) -> Result<Identity, StartupError> {
    let result = tokio::time::timeout(
        Duration::from_secs(15),
        tokio::process::Command::new(binary)
            .arg("--identity")
            .stdin(std::process::Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "OMD took too long to start. Restart your computer, then open OMD again.")?
    .map_err(|_| "OMD could not start. Reinstall OMD or restart your computer.")?;
    if !result.status.success() || result.stdout.len() > 4096 {
        return Err(StartupError::permanent(DAMAGED));
    }
    let value: Identity = serde_json::from_slice(&result.stdout)
        .map_err(|_| StartupError::permanent(DAMAGED))?;
    if value.api != "v2"
        || version(&value.version).is_none()
        || value.executable_sha256.len() != 64
        || !value
            .executable_sha256
            .bytes()
            .all(|b| b.is_ascii_hexdigit())
    {
        return Err(StartupError::permanent(DAMAGED));
    }
    Ok(value)
}
fn version(value: &str) -> Option<[u64; 3]> {
    let parts = value
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    parts.try_into().ok()
}
pub fn matches(value: &Value, expected: &Identity) -> bool {
    value["api"] == expected.api
        && value["version"] == expected.version
        && value["executable_sha256"] == expected.executable_sha256
}

pub async fn attach_or_retire(
    path: &Path,
    expected: &Identity,
    timeout: Duration,
) -> Result<Option<Connection>, StartupError> {
    let Some(connection) = load(path) else {
        return Ok(None);
    };
    let Some(value) = service(&connection).await? else {
        return Ok(None);
    };
    if matches(&value, expected) {
        return Ok(Some(connection));
    }
    let running = value["version"].as_str().and_then(version).ok_or(
        "An unknown version of OMD is running in the background. Quit OMD before installing another version.",
    )?;
    if running > version(&expected.version).ok_or_else(|| StartupError::permanent(DAMAGED))? {
        return Err(StartupError::newer_version(NEWER_VERSION));
    }
    http()?
        .post(format!("{}/v2/service/shutdown", connection.endpoint))
        .query(&[("for_update", "true")])
        .bearer_auth(&connection.admin_token)
        .send()
        .await
        .map_err(|_| "The previous version of OMD could not be stopped. Quit OMD and try again.")?
        .error_for_status()
        .map_err(|_| "The previous version of OMD refused to stop. Quit OMD and try again.")?;
    let lock = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path.with_file_name("engine.lock"))
        .map_err(|_| "OMD could not confirm that the previous version stopped. Quit OMD and try again.")?;
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        match fs2::FileExt::try_lock_exclusive(&lock) {
            Ok(()) => return Ok(None),
            Err(error) if error.raw_os_error() == fs2::lock_contended_error().raw_os_error() => {}
            Err(_) => return Err("OMD could not confirm that the previous version stopped. Quit OMD and try again.".into()),
        }
        if tokio::time::Instant::now() >= deadline {
            return Err("The previous version of OMD is still stopping. Wait for downloads to stop, then try again.".into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fake(
        value: Value,
        requests: usize,
        owner: Option<std::fs::File>,
    ) -> (String, std::thread::JoinHandle<Vec<String>>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let task = std::thread::spawn(move || {
            let mut captured = Vec::new();
            let mut owner = owner;
            let deadline = std::time::Instant::now() + Duration::from_secs(10);
            while captured.len() < requests && std::time::Instant::now() < deadline {
                let Ok((mut stream, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(5));
                    continue;
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut data = Vec::new();
                let mut chunk = [0; 1024];
                while !data.windows(4).any(|p| p == b"\r\n\r\n") && data.len() < 16384 {
                    let n = stream.read(&mut chunk).unwrap();
                    if n == 0 {
                        break;
                    }
                    data.extend_from_slice(&chunk[..n]);
                }
                let request = String::from_utf8(data).unwrap();
                let stop = request.starts_with("POST /v2/service/shutdown?for_update=true ");
                let body = if stop {
                    "{\"state\":\"stopping\"}".into()
                } else {
                    serde_json::to_string(&value).unwrap()
                };
                write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
                captured.push(request);
                if stop {
                    drop(owner.take());
                }
            }
            captured
        });
        (address, task)
    }
    fn authority(folder: &Path, endpoint: String) -> std::path::PathBuf {
        let path = folder.join("instance.json");
        std::fs::write(&path,serde_json::to_vec(&serde_json::json!({"endpoint":endpoint,"token":"fixture-read","admin_token":"fixture-admin"})).unwrap()).unwrap();
        path
    }
    fn wanted() -> Identity {
        Identity {
            api: "v2".into(),
            version: "0.2.0".into(),
            executable_sha256: "a".repeat(64),
        }
    }
    #[test]
    fn an_older_engine_is_retired_with_admin_authority_and_profile_files_survive() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let folder = tempfile::tempdir().unwrap();
            let lock = std::fs::File::create(folder.path().join("engine.lock")).unwrap();
            fs2::FileExt::try_lock_exclusive(&lock).unwrap();
            std::fs::write(folder.path().join("settings.json"), b"preserve").unwrap();
            let (endpoint, task) = fake(
                serde_json::json!({"api":"v2","version":"0.1.9"}),
                2,
                Some(lock),
            );
            let path = authority(folder.path(), endpoint);
            assert!(attach_or_retire(&path, &wanted(), Duration::from_secs(2))
                .await
                .unwrap()
                .is_none());
            let requests = task.join().unwrap();
            assert_eq!(requests.len(), 2);
            assert!(requests[0]
                .to_ascii_lowercase()
                .contains("authorization: bearer fixture-read"));
            assert!(requests[1]
                .to_ascii_lowercase()
                .contains("authorization: bearer fixture-admin"));
            assert_eq!(
                std::fs::read(folder.path().join("settings.json")).unwrap(),
                b"preserve"
            );
        });
    }
    #[test]
    fn matching_engines_attach_but_newer_engines_are_not_stopped() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            for newer in [false,true] {
                let folder=tempfile::tempdir().unwrap();
                let (endpoint,task)=fake(serde_json::json!({"api":"v2","version":if newer{"0.3.0"}else{"0.2.0"},"executable_sha256":"a".repeat(64)}),1,None);
                let path=authority(folder.path(),endpoint);
                let result=attach_or_retire(&path,&wanted(),Duration::from_secs(1)).await;
                if newer {let error=result.err().unwrap();assert_eq!(error.message,NEWER_VERSION);assert!(!error.retryable&&error.newer_version);}else{assert!(result.unwrap().is_some());}
                let requests=task.join().unwrap();assert_eq!(requests.len(),1);assert!(requests[0].starts_with("GET /v2/service "));
            }
        });
    }
    #[test]
    fn shutdown_acknowledgement_without_releasing_ownership_times_out() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let folder=tempfile::tempdir().unwrap();let lock=std::fs::File::create(folder.path().join("engine.lock")).unwrap();fs2::FileExt::try_lock_exclusive(&lock).unwrap();
            let (endpoint,task)=fake(serde_json::json!({"api":"v2","version":"0.2.0","executable_sha256":"b".repeat(64)}),2,None);
            let path=authority(folder.path(),endpoint);
            let result=attach_or_retire(&path,&wanted(),Duration::from_millis(100)).await;
            let error=result.err().unwrap();assert!(error.message.contains("still stopping")&&error.retryable&&!error.newer_version);assert_eq!(task.join().unwrap().len(),2);drop(lock);
        });
    }
    #[test]
    fn same_version_with_different_bytes_requires_handover_and_newer_versions_are_ordered() {
        let wanted = Identity {
            api: "v2".into(),
            version: "0.2.0".into(),
            executable_sha256: "a".repeat(64),
        };
        assert!(matches(
            &serde_json::json!({"api":"v2","version":"0.2.0","executable_sha256":"a".repeat(64)}),
            &wanted
        ));
        assert!(!matches(
            &serde_json::json!({"api":"v2","version":"0.2.0","executable_sha256":"b".repeat(64)}),
            &wanted
        ));
        assert!(!matches(
            &serde_json::json!({"api":"v2","version":"0.2.0"}),
            &wanted
        ));
        assert!(version("0.10.0") > version("0.2.0"));
        assert!(version("0.2.0-alpha.1").is_none());
    }
    #[test]
    fn startup_errors_say_whether_trying_again_can_help() {
        let plain: StartupError = "OMD took too long to start.".into();
        assert!(plain.retryable && !plain.newer_version && !plain.log);
        let damaged = StartupError::permanent(DAMAGED);
        assert!(!damaged.retryable && !damaged.newer_version);
        let newer = StartupError::newer_version(NEWER_VERSION);
        assert!(!newer.retryable && newer.newer_version);
        assert!(StartupError::from(String::from("x")).with_log().log);
        // The window reads these exact field names.
        assert_eq!(
            serde_json::to_value(&newer).unwrap(),
            serde_json::json!({"message": NEWER_VERSION, "retryable": false, "newer_version": true, "log": false})
        );
    }
    #[cfg(unix)]
    #[test]
    fn a_damaged_engine_identity_is_not_retryable() {
        use std::os::unix::fs::PermissionsExt;
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let folder = tempfile::tempdir().unwrap();
            // Runs, but reports no valid identity: retrying cannot repair it.
            let binary = folder.path().join("omd-engine");
            std::fs::write(&binary, b"#!/bin/sh\necho not-an-identity\n").unwrap();
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
            let error = expected(&binary).await.err().unwrap();
            assert_eq!(error, StartupError::permanent(DAMAGED));
        });
    }
    #[test]
    fn authority_never_uses_remote_urls_redirect_paths_or_oversized_files() {
        assert!(endpoint("http://127.0.0.1:1234"));
        for value in [
            "http://localhost:1234",
            "http://example.org:1234",
            "http://user@127.0.0.1:1234",
            "http://127.0.0.1:1234/x",
            "http://127.0.0.1:1234?x=1",
        ] {
            assert!(!endpoint(value));
        }
    }
}
