//! The two windows and when the app ends.
//!
//! `kalendarix` opens the calendar; `kalendarix --bar-popup` shows or hides the
//! small calendar a compositor rule places under the bar. There is no tray icon
//! and nothing stays running: a minute after the last window is gone, so is the
//! process, and the next start is a fresh one.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

pub const MAIN: &str = "main";
pub const POPUP: &str = "popup";
/// Compositor rules find the small calendar by this title; it must not change.
pub const POPUP_TITLE: &str = "Kalendarix Popup";

const POPUP_WIDTH: f64 = 360.0;
const POPUP_HEIGHT: f64 = 380.0;
const POPUP_MIN_HEIGHT: f64 = 160.0;
const POPUP_MAX_HEIGHT: f64 = 680.0;
/// A hidden app is kept this long so the next key press opens it at once.
/// `KALENDARIX_LINGER_SECS` changes it.
const LINGER: Duration = Duration::from_secs(60);

fn linger() -> Duration {
    std::env::var("KALENDARIX_LINGER_SECS").ok().and_then(|v| v.parse().ok()).map_or(LINGER, Duration::from_secs)
}
/// A window that has just been mapped may lose focus once before the compositor
/// settles; that is not somebody clicking away.
const FOCUS_GRACE: Duration = Duration::from_millis(400);

pub struct Windows {
    popup_shown: Mutex<Instant>,
    /// Bumped whenever a window is shown; a pending "quit when unused" gives up when it has moved.
    activity: AtomicU64,
}

impl Default for Windows {
    fn default() -> Self {
        Self { popup_shown: Mutex::new(Instant::now()), activity: AtomicU64::new(0) }
    }
}

/// What the command line asked for.
#[derive(Debug, Default, PartialEq)]
pub struct Launch {
    pub popup: bool,
    pub background: bool,
    pub date: Option<String>,
}

impl Launch {
    pub fn parse<S: AsRef<str>>(args: &[S]) -> Self {
        let mut launch = Launch::default();
        let mut iter = args.iter().map(AsRef::as_ref).skip(1);
        while let Some(arg) = iter.next() {
            match arg {
                "--bar-popup" => launch.popup = true,
                "--background" => launch.background = true,
                "--date" => launch.date = iter.next().filter(|d| is_date(d)).map(str::to_string),
                _ => {
                    if let Some(date) = arg.strip_prefix("--date=").filter(|d| is_date(d)) {
                        launch.date = Some(date.to_string());
                    }
                    // --lean and anything else older launchers pass is accepted and ignored.
                }
            }
        }
        launch
    }
}

fn is_date(text: &str) -> bool {
    let b = text.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

/// Tiling compositors draw their own border and have no use for a title bar;
/// elsewhere the title bar is how a window is moved and closed.
/// `KALENDARIX_DECORATIONS=0|1` overrides the guess.
pub fn wants_decorations() -> bool {
    decorations_for(|name| std::env::var(name).ok())
}

fn decorations_for(env: impl Fn(&str) -> Option<String>) -> bool {
    match env("KALENDARIX_DECORATIONS").as_deref() {
        Some("0") | Some("false") | Some("off") => return false,
        Some("1") | Some("true") | Some("on") => return true,
        _ => {}
    }
    if ["HYPRLAND_INSTANCE_SIGNATURE", "SWAYSOCK", "NIRI_SOCKET", "I3SOCK"].iter().any(|v| env(v).is_some_and(|s| !s.is_empty())) {
        return false;
    }
    let desktop = env("XDG_CURRENT_DESKTOP").unwrap_or_default().to_lowercase();
    !["hyprland", "sway", "niri", "river", "i3", "bspwm", "dwl", "qtile", "labwc"]
        .iter()
        .any(|wm| desktop.split(':').any(|part| part == *wm))
}

pub fn launch(app: &AppHandle, request: Launch) {
    if request.popup {
        toggle_popup(app);
    } else if request.background {
        quit_when_unused(app);
    } else {
        show_main(app, request.date);
    }
}

/// Bring the calendar to the front, creating its window when there is none,
/// and optionally jump it to a day (YYYY-MM-DD).
pub fn show_main(app: &AppHandle, date: Option<String>) {
    touch(app);
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(date) = date {
            let _ = window.emit("show-date", date);
        }
        return;
    }
    // A new window has no listener yet; the day travels in its address instead.
    let url = match date {
        Some(date) => format!("index.html?date={date}"),
        None => "index.html".to_string(),
    };
    let built = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App(url.into()))
        .title("Kalendarix")
        .inner_size(1180.0, 760.0)
        // A low floor, so a tiling compositor can give it a narrow column.
        .min_inner_size(320.0, 240.0)
        .decorations(wants_decorations())
        // Dragging events around and dropping .ics files is the page's business.
        .disable_drag_drop_handler()
        .build();
    match built {
        Ok(window) => {
            let handle = app.clone();
            window.on_window_event(move |event| {
                if matches!(event, WindowEvent::Destroyed) {
                    quit_when_unused(&handle);
                }
            });
        }
        Err(error) => eprintln!("kalendarix: could not open the window: {error}"),
    }
}

fn popup(app: &AppHandle) -> Option<WebviewWindow> {
    if let Some(window) = app.get_webview_window(POPUP) {
        return Some(window);
    }
    let built = WebviewWindowBuilder::new(app, POPUP, WebviewUrl::App("popup.html".into()))
        .title(POPUP_TITLE)
        .inner_size(POPUP_WIDTH, POPUP_HEIGHT)
        .min_inner_size(POPUP_WIDTH, POPUP_MIN_HEIGHT)
        .max_inner_size(POPUP_WIDTH, POPUP_MAX_HEIGHT)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .maximizable(false)
        .minimizable(false)
        .visible(false)
        .build();
    let window = match built {
        Ok(window) => window,
        Err(error) => {
            eprintln!("kalendarix: could not open the small calendar: {error}");
            return None;
        }
    };
    let handle = app.clone();
    window.on_window_event(move |event| match event {
        // Closing the small calendar puts it away; the process decides later whether to end.
        WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            hide_popup(&handle);
        }
        // Like every panel popup, it goes when something else is clicked.
        WindowEvent::Focused(false) => {
            let settled = handle.state::<Windows>().popup_shown.lock().map_or(true, |at| at.elapsed() > FOCUS_GRACE);
            if settled {
                hide_popup(&handle);
            }
        }
        _ => {}
    });
    Some(window)
}

pub fn toggle_popup(app: &AppHandle) {
    let Some(window) = popup(app) else { return };
    if window.is_visible().unwrap_or(false) {
        hide_popup(app);
        return;
    }
    touch(app);
    if let Ok(mut at) = app.state::<Windows>().popup_shown.lock() {
        *at = Instant::now();
    }
    // Tell the page first, so it is on today's month by the time it is seen.
    let _ = window.emit("popup-opened", ());
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn hide_popup(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(POPUP) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        }
    }
    quit_when_unused(app);
}

/// The small calendar asks for the height its content needs.
pub fn resize_popup(app: &AppHandle, height: f64) {
    if !height.is_finite() {
        return;
    }
    if let Some(window) = app.get_webview_window(POPUP) {
        let height = height.ceil().clamp(POPUP_MIN_HEIGHT, POPUP_MAX_HEIGHT);
        let _ = window.set_size(tauri::LogicalSize::new(POPUP_WIDTH, height));
    }
}

fn touch(app: &AppHandle) {
    app.state::<Windows>().activity.fetch_add(1, Ordering::SeqCst);
}

fn anything_visible(app: &AppHandle) -> bool {
    app.webview_windows().values().any(|w| w.is_visible().unwrap_or(false))
}

/// Once nothing has been shown for a while, stop holding on to what is hidden:
/// the small calendar's page is given up, and with no window left the process ends.
pub fn quit_when_unused(app: &AppHandle) {
    let seen = app.state::<Windows>().activity.load(Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(linger());
        if app.state::<Windows>().activity.load(Ordering::SeqCst) != seen {
            return;
        }
        if let Some(popup) = app.get_webview_window(POPUP) {
            if !popup.is_visible().unwrap_or(false) {
                let _ = popup.destroy();
            }
        }
        if !anything_visible(&app) {
            app.exit(0);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_command_line() {
        assert_eq!(Launch::parse(&["kalendarix"]), Launch::default());
        assert_eq!(Launch::parse(&["kalendarix", "--lean", "--bar-popup"]), Launch { popup: true, ..Default::default() });
        assert_eq!(Launch::parse(&["kalendarix", "--background"]), Launch { background: true, ..Default::default() });
        assert_eq!(Launch::parse(&["kalendarix", "--date", "2026-10-23"]).date.as_deref(), Some("2026-10-23"));
        assert_eq!(Launch::parse(&["kalendarix", "--date=2026-10-23"]).date.as_deref(), Some("2026-10-23"));
        assert_eq!(Launch::parse(&["kalendarix", "--date=../../x"]).date, None);
        assert_eq!(Launch::parse::<&str>(&[]), Launch::default());
    }

    #[test]
    fn leaves_the_title_bar_off_under_a_tiling_compositor() {
        let env = |pairs: &'static [(&'static str, &'static str)]| {
            move |name: &str| pairs.iter().find(|(k, _)| *k == name).map(|(_, v)| v.to_string())
        };
        assert!(!decorations_for(env(&[("HYPRLAND_INSTANCE_SIGNATURE", "abc")])));
        assert!(!decorations_for(env(&[("XDG_CURRENT_DESKTOP", "Hyprland")])));
        assert!(!decorations_for(env(&[("XDG_CURRENT_DESKTOP", "sway:wlroots")])));
        assert!(decorations_for(env(&[("XDG_CURRENT_DESKTOP", "GNOME")])));
        assert!(decorations_for(env(&[])));
        assert!(decorations_for(env(&[("HYPRLAND_INSTANCE_SIGNATURE", "abc"), ("KALENDARIX_DECORATIONS", "1")])));
        assert!(!decorations_for(env(&[("XDG_CURRENT_DESKTOP", "GNOME"), ("KALENDARIX_DECORATIONS", "0")])));
    }
}
