//! Theme files are user-selected documents, independent of engine credentials.
const MAX_BYTES: usize = 262_144;
fn check_path(path: &str) -> Result<std::path::PathBuf, String> {
    let path = std::path::PathBuf::from(path);
    if !path.is_absolute() || path.extension().and_then(|v| v.to_str()) != Some("toml") {
        return Err("Choose a .toml theme file.".into());
    }
    Ok(path)
}
#[tauri::command]
pub fn v2_read_theme(path: String) -> Result<String, String> {
    use std::io::Read;
    let path=check_path(&path)?;
    let file=std::fs::File::open(path).map_err(|_| "Could not open the theme file.")?;
    let mut bytes=Vec::new();file.take((MAX_BYTES+1) as u64).read_to_end(&mut bytes).map_err(|_| "Could not read the theme file.")?;
    if bytes.len()>MAX_BYTES {return Err("Choose a theme smaller than 256 KB.".into());}
    String::from_utf8(bytes).map_err(|_| "The theme must be a UTF-8 text file.".into())
}
#[tauri::command]
pub fn v2_write_theme(path: String, text: String) -> Result<(), String> {
    let path=check_path(&path)?;
    if text.len()>MAX_BYTES {return Err("The theme exceeds 256 KB.".into());}
    std::fs::write(path,text).map_err(|_| "Could not save the theme. Choose another location.".into())
}
