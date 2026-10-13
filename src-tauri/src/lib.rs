//! The shell around the calendar: files, windows, and the few things a web
//! page cannot do for itself. The calendar itself (what an event is, when it
//! repeats, how a month is laid out) is TypeScript under `src/`.

mod actual;
mod storage;
mod text;
mod theme;
mod windows;

use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use windows::{Launch, Windows};

/// How often the files other programs write are looked at.
const WATCH_EVERY: Duration = Duration::from_secs(1);
const FETCH_TIMEOUT: Duration = Duration::from_secs(15);
const FETCH_LIMIT: u64 = 10 * 1024 * 1024;

struct Paths {
    data: PathBuf,
    themes: Vec<PathBuf>,
    actual: PathBuf,
}

/// The versions of the watched files the interface has already been told about.
#[derive(Default)]
struct Seen {
    calendars: Mutex<Option<String>>,
    settings: Mutex<Option<String>>,
}

// ---------------------------------------------------------------------------
// calendars and settings
// ---------------------------------------------------------------------------

#[tauri::command]
fn load_calendars(paths: State<Paths>) -> Result<storage::Loaded, String> {
    storage::load(&paths.data.join(storage::CALENDARS))
}

/// Write the calendars, unless the file is no longer the version `expected`.
#[tauri::command]
fn save_calendars(
    app: AppHandle,
    paths: State<Paths>,
    seen: State<Seen>,
    text: String,
    expected: Option<String>,
) -> Result<storage::Saved, String> {
    storage::backup_once(&paths.data);
    let saved = storage::save(&paths.data.join(storage::CALENDARS), &text, expected.as_deref())?;
    if saved.ok {
        if let Ok(mut known) = seen.calendars.lock() {
            *known = saved.version.clone();
        }
        // The other window draws the change at once instead of at the next look at the file.
        let _ = app.emit("calendars-changed", saved.version.clone());
    }
    Ok(saved)
}

#[tauri::command]
fn load_settings(paths: State<Paths>) -> Result<Option<String>, String> {
    storage::load(&paths.data.join(storage::SETTINGS)).map(|loaded| loaded.text)
}

#[tauri::command]
fn save_settings(app: AppHandle, paths: State<Paths>, seen: State<Seen>, text: String) -> Result<(), String> {
    let path = paths.data.join(storage::SETTINGS);
    serde_json::from_str::<serde::de::IgnoredAny>(&text).map_err(|e| format!("not JSON: {e}"))?;
    storage::write_atomic(&path, text.as_bytes())?;
    if let Ok(mut known) = seen.settings.lock() {
        *known = storage::version(&path);
    }
    let _ = app.emit("settings-changed", ());
    Ok(())
}

#[tauri::command]
fn data_path(paths: State<Paths>) -> String {
    paths.data.join(storage::CALENDARS).display().to_string()
}

// ---------------------------------------------------------------------------
// what the desktop and other programs provide
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_theme(paths: State<Paths>) -> Option<theme::Palette> {
    theme::find(&paths.themes)
}

/// The interface says whether it is drawing the pixel look; see text.rs.
#[tauri::command]
fn set_pixel_text(app: AppHandle, on: bool) {
    text::set_pixel(&app, on);
}

#[tauri::command]
fn get_actual_range(paths: State<Paths>, from: String, to: String) -> Vec<actual::Entry> {
    actual::read_range(&paths.actual, &from, &to)
}

/// Download a subscribed calendar. Done here because a page may only read
/// servers that allow it, and a calendar feed rarely says so.
#[tauri::command(async)]
fn fetch_url(url: String) -> Result<String, String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("URL musí začínať http:// alebo https://".into());
    }
    let agent: ureq::Agent = ureq::Agent::config_builder().timeout_global(Some(FETCH_TIMEOUT)).build().into();
    let mut response = agent.get(&url).call().map_err(|e| e.to_string())?;
    response.body_mut().with_config().limit(FETCH_LIMIT).read_to_string().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    // Links come out of event notes, which other people write.
    if !["http://", "https://", "mailto:"].iter().any(|scheme| url.starts_with(scheme)) {
        return Err("unsupported link".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// files the user picks
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
struct NamedText {
    name: String,
    text: String,
}

#[tauri::command(async)]
fn pick_ics_files(app: AppHandle) -> Result<Vec<NamedText>, String> {
    let Some(picked) = app.dialog().file().add_filter("iCalendar", &["ics"]).blocking_pick_files() else {
        return Ok(Vec::new());
    };
    let mut files = Vec::new();
    for file in picked {
        let path = file.into_path().map_err(|e| e.to_string())?;
        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("kalendar").to_string();
        let text = std::fs::read_to_string(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        files.push(NamedText { name, text });
    }
    Ok(files)
}

/// Ask where to save one file. Returns the path, or nothing when cancelled.
#[tauri::command(async)]
fn save_text_file(app: AppHandle, name: String, extension: String, description: String, text: String) -> Result<Option<String>, String> {
    let dialog =
        app.dialog().file().set_file_name(format!("{}.{extension}", safe_name(&name))).add_filter(description, &[extension.as_str()]);
    let Some(target) = dialog.blocking_save_file() else { return Ok(None) };
    let path = target.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Some(path.display().to_string()))
}

/// Ask for a folder and write every file into it as `<name>.<extension>`.
#[tauri::command(async)]
fn save_files_in_folder(app: AppHandle, files: Vec<NamedText>, extension: String) -> Result<Option<String>, String> {
    let Some(folder) = app.dialog().file().blocking_pick_folder() else { return Ok(None) };
    let folder = folder.into_path().map_err(|e| e.to_string())?;
    for (name, file) in distinct_names(files.iter().map(|f| safe_name(&f.name)).collect()).iter().zip(&files) {
        let path = folder.join(format!("{name}.{extension}"));
        std::fs::write(&path, &file.text).map_err(|e| format!("{}: {e}", path.display()))?;
    }
    Ok(Some(folder.display().to_string()))
}

/// Two calendars of the same name are two files: the second becomes "name (2)".
fn distinct_names(names: Vec<String>) -> Vec<String> {
    let mut seen: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut out: Vec<String> = Vec::with_capacity(names.len());
    for name in names {
        // Compared without case: some file systems would treat "Sport" and "sport" as one file.
        let count = seen.entry(name.to_lowercase()).or_insert(0);
        *count += 1;
        let mut candidate = if *count == 1 { name.clone() } else { format!("{name} ({count})") };
        while out.iter().any(|taken| taken.to_lowercase() == candidate.to_lowercase()) {
            *count += 1;
            candidate = format!("{name} ({count})");
        }
        out.push(candidate);
    }
    out
}

/// A calendar name as a file name: nothing a file system or a shell trips over.
fn safe_name(name: &str) -> String {
    let cleaned: String = name.chars().map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '_' } else { c }).collect();
    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "kalendar".to_string()
    } else {
        trimmed.to_string()
    }
}

// ---------------------------------------------------------------------------
// windows
// ---------------------------------------------------------------------------

#[tauri::command(async)]
fn show_main(app: AppHandle, date: Option<String>) {
    windows::hide_popup(&app);
    windows::show_main(&app, date);
}

#[tauri::command(async)]
fn hide_popup(app: AppHandle) {
    windows::hide_popup(&app);
}

#[tauri::command(async)]
fn resize_popup(app: AppHandle, height: f64) {
    windows::resize_popup(&app, height);
}

// ---------------------------------------------------------------------------
// watching what others change
// ---------------------------------------------------------------------------

/// Look at the watched files once a second and say when one has changed. A
/// plain look, not a file-system watch: the files are replaced by renaming, the
/// theme through a symlink that is swapped, and a look survives all of that.
fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let paths = app.state::<Paths>();
        let seen = app.state::<Seen>();
        let calendars = paths.data.join(storage::CALENDARS);
        let settings = paths.data.join(storage::SETTINGS);
        if let Ok(mut known) = seen.calendars.lock() {
            *known = storage::version(&calendars);
        }
        if let Ok(mut known) = seen.settings.lock() {
            *known = storage::version(&settings);
        }
        let mut palette = theme::find(&paths.themes);
        let mut actual = modified(&paths.actual);

        loop {
            std::thread::sleep(WATCH_EVERY);
            if app.webview_windows().is_empty() {
                continue;
            }
            for (path, known, event) in
                [(&calendars, &seen.calendars, "calendars-changed"), (&settings, &seen.settings, "settings-changed")]
            {
                let now = storage::version(path);
                let Ok(mut known) = known.lock() else { continue };
                if *known != now {
                    *known = now.clone();
                    let _ = app.emit(event, now);
                }
            }
            let now = theme::find(&paths.themes);
            if now != palette {
                palette = now;
                let _ = app.emit("theme-changed", ());
            }
            let now = modified(&paths.actual);
            if now != actual {
                actual = now;
                let _ = app.emit("actual-changed", ());
            }
        }
    });
}

/// The tracker renames a finished file into the directory, which touches it.
fn modified(dir: &std::path::Path) -> Option<SystemTime> {
    std::fs::metadata(dir).and_then(|m| m.modified()).ok()
}

pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("kalendarix {}", env!("CARGO_PKG_VERSION"));
        return;
    }
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!(
            "Kalendarix {}\n\n\
             kalendarix                    open the calendar\n\
             kalendarix --date 2026-10-23  open it on a day\n\
             kalendarix --bar-popup        show or hide the small calendar\n\n\
             A second start only talks to the first.",
            env!("CARGO_PKG_VERSION")
        );
        return;
    }

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| windows::launch(app, Launch::parse(&argv))))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Windows::default())
        .manage(Seen::default())
        .invoke_handler(tauri::generate_handler![
            load_calendars,
            save_calendars,
            load_settings,
            save_settings,
            data_path,
            get_theme,
            set_pixel_text,
            get_actual_range,
            fetch_url,
            open_url,
            pick_ics_files,
            save_text_file,
            save_files_in_folder,
            show_main,
            hide_popup,
            resize_popup,
        ])
        .setup(move |app| {
            let resolver = app.path();
            let data = storage::data_dir(resolver.config_dir().ok());
            let themes = theme::candidates(resolver.home_dir().ok().as_deref(), &data);
            let actual = actual::days_dir(resolver.data_dir().ok());
            app.manage(Paths { data, themes, actual });
            watch(app.handle().clone());
            windows::launch(app.handle(), Launch::parse(&args));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Kalendarix could not start");

    // Closing the last window ends the app; a hidden small calendar keeps it for a minute.
    app.run(|_app, _event| {});
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calendars_of_the_same_name_get_files_of_their_own() {
        let names = |list: &[&str]| distinct_names(list.iter().map(|s| s.to_string()).collect());
        assert_eq!(names(&["Sport", "Testy", "Sport", "sport"]), ["Sport", "Testy", "Sport (2)", "sport (3)"]);
        assert_eq!(names(&["a", "a (2)", "a"]), ["a", "a (2)", "a (3)"]);
        assert_eq!(names(&[]), Vec::<String>::new());
    }

    #[test]
    fn file_names_are_made_safe() {
        assert_eq!(safe_name("Školské akcie"), "Školské akcie");
        assert_eq!(safe_name("a/b\\c:d*e?f\"g<h>i|j"), "a_b_c_d_e_f_g_h_i_j");
        assert_eq!(safe_name("  ..  "), "kalendar");
        assert_eq!(safe_name("x\ny"), "x_y");
    }
}
