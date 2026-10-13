//! The desktop's palette. On Omarchy and desktops like it the current theme is
//! a `colors.toml`; Kalendarix wears it so it looks like the rest of the system.
//! Only the values are read here; what they mean is decided in the interface
//! (src/state/theme.ts).

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Palette {
    /// The file the values came from.
    pub path: String,
    /// `key = value` pairs as written, quotes removed.
    pub values: BTreeMap<String, String>,
}

/// Where a palette may be, most specific first.
pub fn candidates(home: Option<&Path>, data_dir: &Path) -> Vec<PathBuf> {
    let mut list = Vec::new();
    if let Some(explicit) = std::env::var_os("KALENDARIX_THEME").filter(|v| !v.is_empty()) {
        list.push(PathBuf::from(explicit));
    }
    list.push(data_dir.join("theme.toml"));
    if let Some(home) = home {
        list.push(home.join(".local/state/omarchy/current/theme/colors.toml"));
        list.push(home.join(".config/omarchy/current/theme/colors.toml"));
    }
    list.push(PathBuf::from("/usr/share/kalendarix/colors.toml"));
    list
}

/// The first candidate that is a usable palette.
pub fn find(paths: &[PathBuf]) -> Option<Palette> {
    paths.iter().find_map(|path| {
        let values = parse(&std::fs::read_to_string(path).ok()?);
        // Mid-replacement a theme file can be empty; a palette needs at least these.
        let complete = ["background", "foreground", "accent"].iter().all(|key| values.contains_key(*key));
        complete.then(|| Palette { path: path.display().to_string(), values })
    })
}

/// The flat `key = "value"` lines of a colors.toml. Tables and arrays are not
/// part of the format and are skipped.
pub fn parse(text: &str) -> BTreeMap<String, String> {
    let mut values = BTreeMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('[') {
            continue;
        }
        let Some((key, rest)) = line.split_once('=') else { continue };
        let key = key.trim();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            continue;
        }
        if let Some(value) = value_of(rest.trim()) {
            values.insert(key.to_string(), value);
        }
    }
    values
}

fn value_of(rest: &str) -> Option<String> {
    for quote in ['"', '\''] {
        if let Some(inner) = rest.strip_prefix(quote) {
            return inner.find(quote).map(|end| inner[..end].to_string());
        }
    }
    // A bare number or word, up to a trailing comment.
    let bare = rest.split('#').next().unwrap_or("").trim();
    (!bare.is_empty() && !bare.starts_with('[') && !bare.starts_with('{')).then(|| bare.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PIXEL: &str = r##"# A pixel desktop's palette under the names Kalendarix reads.
mode = "dark"
background = "#000a07"
dark_background = "#0a1512"
foreground = "#f0f0eb"
accent = "#628790"   # the one accent
red = '#e5786d'

font = "Departure Mono Pixel"
font_size = 11
icons = "pixel-2000"
[section]
list = ["a", "b"]
broken line
"##;

    #[test]
    fn reads_colours_words_and_numbers() {
        let values = parse(PIXEL);
        assert_eq!(values["mode"], "dark");
        assert_eq!(values["background"], "#000a07");
        assert_eq!(values["accent"], "#628790");
        assert_eq!(values["red"], "#e5786d");
        assert_eq!(values["font"], "Departure Mono Pixel");
        assert_eq!(values["font_size"], "11");
        assert_eq!(values["icons"], "pixel-2000");
        assert!(!values.contains_key("list"));
        assert!(!values.contains_key("section"));
    }

    #[test]
    fn takes_the_first_complete_palette() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("missing.toml");
        let half = dir.path().join("half.toml");
        let whole = dir.path().join("whole.toml");
        std::fs::write(&half, "background = \"#000000\"\n").unwrap();
        std::fs::write(&whole, PIXEL).unwrap();
        let found = find(&[missing, half, whole.clone()]).unwrap();
        assert_eq!(found.path, whole.display().to_string());
        assert_eq!(found.values["foreground"], "#f0f0eb");
        assert!(find(&[dir.path().join("none.toml")]).is_none());
    }

    #[test]
    fn looks_in_the_users_places_before_the_system_ones() {
        let list = candidates(Some(Path::new("/home/x")), Path::new("/home/x/.config/kalendarix"));
        let pos = |needle: &str| list.iter().position(|p| p.to_string_lossy().contains(needle)).unwrap();
        assert!(pos("kalendarix/theme.toml") < pos("omarchy/current"));
        assert!(pos("omarchy/current") < pos("/usr/share/kalendarix"));
    }
}
