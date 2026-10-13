//! How text is drawn on a pixel desktop.
//!
//! Such a desktop writes everything in a bitmap font. A bitmap glyph is sharp only
//! when it lands on whole pixels, but the web view places glyphs on fractions of
//! a pixel (a centred label in an odd-width box sits half a pixel off), and a
//! bitmap drawn half a pixel off comes out smeared two pixels wide, like a
//! faked bold. The web view takes its text settings from GTK: with full hinting
//! it snaps glyphs to whole pixels, and with antialiasing off nothing is blurred.
//! The settings are set for this process only and reset when the look changes back.

use tauri::AppHandle;

#[cfg(target_os = "linux")]
pub fn set_pixel(app: &AppHandle, on: bool) {
    use gtk::prelude::*;
    // GTK is touched on the thread that runs it.
    let _ = app.run_on_main_thread(move || {
        let Some(settings) = gtk::Settings::default() else { return };
        if on {
            settings.set_gtk_xft_antialias(0);
            settings.set_gtk_xft_hinting(1);
            settings.set_gtk_xft_hintstyle(Some("hintfull"));
        } else {
            for name in ["gtk-xft-antialias", "gtk-xft-hinting", "gtk-xft-hintstyle"] {
                settings.reset_property(name);
            }
        }
    });
}

#[cfg(not(target_os = "linux"))]
pub fn set_pixel(_app: &AppHandle, _on: bool) {}
