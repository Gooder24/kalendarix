//! "Actual" feed: what really happened, written by the `actually` tracker
//! (ActivityWatch and a local model) as one JSON file per day. Read-only here:
//! the entries are shown beside planned events and never merged into
//! calendars.json.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;

const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;

pub fn days_dir(data_home: Option<PathBuf>) -> PathBuf {
    data_home.unwrap_or_else(|| PathBuf::from(".")).join("actually").join("days")
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub uid: String,
    pub block_id: Option<i64>,
    /// As written by the tracker: ISO-8601 with an offset.
    pub start: String,
    pub end: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub project: Option<String>,
    pub color: Option<String>,
    pub confidence: f64,
    pub active_seconds: f64,
    pub switches: i64,
    pub focus_ratio: f64,
    pub evidence: Vec<Evidence>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct Evidence {
    pub app: String,
    pub what: String,
    pub s: f64,
}

fn text(value: Option<&Value>, max: usize) -> String {
    value.and_then(Value::as_str).unwrap_or("").chars().take(max).collect()
}

fn number(value: Option<&Value>, lo: f64, hi: f64) -> f64 {
    value.and_then(Value::as_f64).filter(|n| n.is_finite()).map_or(lo, |n| n.clamp(lo, hi))
}

fn is_ymd(text: &str) -> bool {
    let b = text.as_bytes();
    b.len() == 10 && b[4] == b'-' && b[7] == b'-' && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

fn is_hex_colour(text: &str) -> bool {
    text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// The files come from another program: accept only the shape the interface needs.
fn clean(raw: &Value) -> Option<Entry> {
    let object = raw.as_object()?;
    let start = object.get("start")?.as_str()?;
    let end = object.get("end")?.as_str()?;
    // Whether the two make an interval is checked where dates are understood (the interface).
    if start.len() < 16 || end.len() < 16 || start.len() > 40 || end.len() > 40 {
        return None;
    }
    let evidence = object.get("evidence").and_then(Value::as_array).map(|list| {
        list.iter()
            .take(5)
            .map(|e| Evidence { app: text(e.get("app"), 60), what: text(e.get("what"), 160), s: number(e.get("s"), 0.0, 86400.0) })
            .collect()
    });
    Some(Entry {
        uid: text(object.get("uid"), 80),
        block_id: object.get("block_id").and_then(Value::as_i64),
        start: start.to_string(),
        end: end.to_string(),
        title: text(object.get("title"), 160),
        description: text(object.get("description"), 300),
        category: text(object.get("category"), 40),
        project: object.get("project").and_then(Value::as_str).map(|p| p.chars().take(80).collect()),
        color: object.get("color").and_then(Value::as_str).filter(|c| is_hex_colour(c)).map(str::to_string),
        confidence: number(object.get("confidence"), 0.0, 1.0),
        active_seconds: number(object.get("active_seconds"), 0.0, 86400.0),
        switches: number(object.get("switches"), 0.0, 100_000.0).round() as i64,
        focus_ratio: number(object.get("focus_ratio"), 0.0, 1.0),
        evidence: evidence.unwrap_or_default(),
    })
}

/// Every entry of the days from `from` to `to` (YYYY-MM-DD, inclusive), by start.
pub fn read_range(dir: &Path, from: &str, to: &str) -> Vec<Entry> {
    if !is_ymd(from) || !is_ymd(to) {
        return Vec::new();
    }
    let Ok(listing) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut entries = Vec::new();
    for file in listing.flatten() {
        let name = file.file_name();
        let Some(day) = name.to_str().and_then(|n| n.strip_suffix(".json")) else { continue };
        if !is_ymd(day) || day < from || day > to {
            continue;
        }
        if file.metadata().map_or(true, |m| m.len() > MAX_FILE_BYTES) {
            continue;
        }
        // A foreign or unreadable file is skipped; the rest of the week stays.
        let Ok(content) = std::fs::read_to_string(file.path()) else { continue };
        let Ok(data) = serde_json::from_str::<Value>(&content) else { continue };
        if let Some(list) = data.get("entries").and_then(Value::as_array) {
            entries.extend(list.iter().filter_map(clean));
        }
    }
    entries.sort_by(|a, b| a.start.cmp(&b.start));
    entries
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_only_the_days_asked_for_and_only_sound_entries() {
        let dir = tempfile::tempdir().unwrap();
        let day = |name: &str, body: &str| std::fs::write(dir.path().join(name), body).unwrap();
        day(
            "2026-10-12.json",
            r##"{"entries":[
                {"uid":"b","start":"2026-10-12T10:00:00+02:00","end":"2026-10-12T11:00:00+02:00","title":"Later","category":"meeting","confidence":2,"active_seconds":1800,"switches":3.6,"focus_ratio":0.5,"color":"#ABCDEF","block_id":7,"evidence":[{"app":"foot","what":"cargo build","s":900}]},
                {"uid":"a","start":"2026-10-12T08:00:00+02:00","end":"2026-10-12T09:00:00+02:00","title":"Earlier","category":"deep_work","color":"red"},
                {"uid":"no-times"},
                "not an object"
            ]}"##,
        );
        day("2026-10-13.json", r#"{"entries":[{"uid":"c","start":"2026-10-13T08:00:00+02:00","end":"2026-10-13T09:00:00+02:00"}]}"#);
        day("2026-10-20.json", r#"{"entries":[{"uid":"out","start":"2026-10-20T08:00:00+02:00","end":"2026-10-20T09:00:00+02:00"}]}"#);
        day("2026-10-14.json", "not json at all");
        day("notes.txt", "ignored");

        let got = read_range(dir.path(), "2026-10-12", "2026-10-18");
        assert_eq!(got.iter().map(|e| e.uid.as_str()).collect::<Vec<_>>(), ["a", "b", "c"]);
        let later = &got[1];
        assert_eq!(later.confidence, 1.0);
        assert_eq!(later.switches, 4);
        assert_eq!(later.block_id, Some(7));
        assert_eq!(later.color.as_deref(), Some("#ABCDEF"));
        assert_eq!(later.evidence[0].what, "cargo build");
        assert_eq!(got[0].color, None);
    }

    #[test]
    fn a_missing_directory_or_a_bad_range_is_just_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_range(&dir.path().join("nope"), "2026-10-12", "2026-10-18").is_empty());
        assert!(read_range(dir.path(), "../../etc", "2026-10-18").is_empty());
    }

    #[test]
    fn serialises_with_the_names_the_interface_uses() {
        let entry = clean(&serde_json::json!({"start":"2026-10-12T08:00:00+02:00","end":"2026-10-12T09:00:00+02:00","active_seconds":60,"focus_ratio":0.25,"block_id":1})).unwrap();
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["activeSeconds"], 60.0);
        assert_eq!(json["focusRatio"], 0.25);
        assert_eq!(json["blockId"], 1);
    }
}
