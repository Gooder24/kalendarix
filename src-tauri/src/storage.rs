//! The files Kalendarix keeps: calendars.json and settings.json in the config
//! directory. Other programs may write calendars.json too (a timetable sync
//! replacing it every quarter of an hour), so a save says which version it was made from
//! and is refused when the file has moved on since.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;

pub const CALENDARS: &str = "calendars.json";
pub const SETTINGS: &str = "settings.json";
/// A copy of calendars.json from before this version first wrote it.
const BACKUP: &str = "calendars.json.before-v2";

/// Where the data lives: the directory the first Kalendarix used
/// (`~/.config/kalendarix` on Linux), which other programs may read as well. `KALENDARIX_DATA_DIR` points it elsewhere, for tests.
pub fn data_dir(config_dir: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = std::env::var_os("KALENDARIX_DATA_DIR").filter(|v| !v.is_empty()) {
        return PathBuf::from(dir);
    }
    config_dir.unwrap_or_else(|| PathBuf::from(".")).join("kalendarix")
}

/// What a file looked like when it was read: enough to tell whether it changed.
/// Every writer replaces the file by renaming a new one over it, so on Unix the
/// file's identity is part of it: two replacements within one tick of the clock
/// and of the same length still differ.
pub fn version(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?;
    #[cfg(unix)]
    let identity = std::os::unix::fs::MetadataExt::ino(&meta);
    #[cfg(not(unix))]
    let identity = 0u64;
    Some(format!("{}-{}-{}", modified.as_nanos(), meta.len(), identity))
}

#[derive(Serialize)]
pub struct Loaded {
    /// The file as text, or nothing when it does not exist yet.
    pub text: Option<String>,
    pub version: Option<String>,
}

pub fn load(path: &Path) -> Result<Loaded, String> {
    // Version first: a write that lands between the two is then noticed on save.
    let version = version(path);
    match fs::read_to_string(path) {
        Ok(text) => Ok(Loaded { text: Some(text), version }),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Loaded { text: None, version: None }),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

#[derive(Serialize)]
pub struct Saved {
    /// False when the file changed since `expected`: nothing was written.
    pub ok: bool,
    pub version: Option<String>,
}

/// Replace `path` with `text` in one step, unless it is no longer at `expected`.
pub fn save(path: &Path, text: &str, expected: Option<&str>) -> Result<Saved, String> {
    // Never put something on disk that the next start could not read.
    serde_json::from_str::<serde::de::IgnoredAny>(text).map_err(|e| format!("not JSON: {e}"))?;

    let target = real_path(path);
    let dir = target.parent().ok_or("no parent directory")?;
    fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let tmp = temp_beside(&target);

    let result = (|| -> std::io::Result<Saved> {
        prepare(&tmp, &target, text.as_bytes())?;
        // Checked as late as possible, with the new file already complete: what is left
        // between this look and the rename is as short as it can be made without a lock.
        let current = version(&target);
        if current.as_deref() != expected {
            return Ok(Saved { ok: false, version: current });
        }
        // A rename keeps the file's identity, time and size, so this is the version it will have.
        let written = version(&tmp);
        fs::rename(&tmp, &target)?;
        Ok(Saved { ok: true, version: written })
    })();
    if !matches!(result, Ok(Saved { ok: true, .. })) {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(|e| format!("{}: {e}", path.display()))
}

/// Where the bytes really are: a calendars.json that is a link into a synced
/// folder is written through the link, not replaced by a plain file.
fn real_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn temp_beside(target: &Path) -> PathBuf {
    let name = target.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    target.with_file_name(format!(".{name}.{}.tmp", std::process::id()))
}

/// The complete new file under a temporary name, on disk, with the old file's permissions.
fn prepare(tmp: &Path, target: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = fs::File::create(tmp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    if let Ok(meta) = fs::metadata(target) {
        fs::set_permissions(tmp, meta.permissions())?;
    }
    Ok(())
}

/// Write beside the file and rename over it, so a reader sees the old file or
/// the new one, never half of either.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let target = real_path(path);
    let dir = target.parent().ok_or("no parent directory")?;
    fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let tmp = temp_beside(&target);

    let result = prepare(&tmp, &target, bytes).and_then(|()| fs::rename(&tmp, &target));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result.map_err(|e| format!("{}: {e}", path.display()))
}

/// Keep one copy of the calendars as they were before this version touched them.
pub fn backup_once(dir: &Path) {
    let source = dir.join(CALENDARS);
    let target = dir.join(BACKUP);
    if source.exists() && !target.exists() {
        let _ = fs::copy(&source, &target);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_loads_as_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let loaded = load(&dir.path().join(CALENDARS)).unwrap();
        assert!(loaded.text.is_none());
        assert!(loaded.version.is_none());
    }

    #[test]
    fn saves_create_the_directory_and_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join(CALENDARS);
        let saved = save(&path, "{\n  \"calendars\": []\n}", None).unwrap();
        assert!(saved.ok);
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.text.as_deref(), Some("{\n  \"calendars\": []\n}"));
        assert_eq!(loaded.version, saved.version);
        assert!(saved.version.is_some());
    }

    #[test]
    fn a_save_from_a_stale_copy_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        let first = save(&path, "{\"calendars\":[]}", None).unwrap();

        // Somebody else (a sync program) replaces the file.
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(&path, "{\"calendars\":[{\"id\":\"timetable-school\"}]}").unwrap();

        let stale = save(&path, "{\"calendars\":[],\"mine\":true}", first.version.as_deref()).unwrap();
        assert!(!stale.ok);
        assert!(fs::read_to_string(&path).unwrap().contains("timetable-school"));

        // From the fresh version the same save goes through.
        let fresh = save(&path, "{\"calendars\":[],\"mine\":true}", stale.version.as_deref()).unwrap();
        assert!(fresh.ok);
        assert!(fs::read_to_string(&path).unwrap().contains("mine"));
    }

    #[test]
    fn a_file_that_appeared_meanwhile_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        fs::write(&path, "{}").unwrap();
        assert!(!save(&path, "{\"calendars\":[]}", None).unwrap().ok);
        assert_eq!(fs::read_to_string(&path).unwrap(), "{}");
    }

    #[test]
    fn text_that_is_not_json_never_reaches_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        assert!(save(&path, "{\"calendars\": [", None).is_err());
        assert!(!path.exists());
    }

    #[test]
    fn nothing_is_left_behind_and_permissions_are_kept() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        save(&path, "{}", None).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
            let v = version(&path);
            save(&path, "{\"a\":1}", v.as_deref()).unwrap();
            assert_eq!(fs::metadata(&path).unwrap().permissions().mode() & 0o777, 0o600);
        }
        let names: Vec<_> = fs::read_dir(dir.path()).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from(CALENDARS)]);
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_file_is_written_through_the_link() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("synced").join(CALENDARS);
        fs::create_dir_all(real.parent().unwrap()).unwrap();
        fs::write(&real, "{}").unwrap();
        let link = dir.path().join(CALENDARS);
        std::os::unix::fs::symlink(&real, &link).unwrap();

        let v = version(&link);
        assert!(save(&link, "{\"a\":1}", v.as_deref()).unwrap().ok);
        assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(fs::read_to_string(&real).unwrap(), "{\"a\":1}");
    }

    #[test]
    fn the_version_a_save_returns_is_the_one_the_file_then_has() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        let saved = save(&path, "{}", None).unwrap();
        assert_eq!(saved.version, version(&path));
        // Replacing it with the very same bytes still makes it another version.
        let again = save(&path, "{}", saved.version.as_deref()).unwrap();
        assert!(again.ok);
        assert_eq!(again.version, version(&path));
        #[cfg(unix)]
        assert_ne!(again.version, saved.version);
    }

    #[test]
    fn a_refused_save_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(CALENDARS);
        fs::write(&path, "{}").unwrap();
        assert!(!save(&path, "{\"a\":1}", Some("stale")).unwrap().ok);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }

    #[test]
    fn the_backup_is_taken_once() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(CALENDARS), "original").unwrap();
        backup_once(dir.path());
        fs::write(dir.path().join(CALENDARS), "changed").unwrap();
        backup_once(dir.path());
        assert_eq!(fs::read_to_string(dir.path().join(BACKUP)).unwrap(), "original");
    }

    #[test]
    fn the_data_directory_is_the_first_kalendarix_one() {
        // Only when the test override is not set in this environment.
        if std::env::var_os("KALENDARIX_DATA_DIR").is_none() {
            assert_eq!(data_dir(Some(PathBuf::from("/home/x/.config"))), PathBuf::from("/home/x/.config/kalendarix"));
        }
    }
}
