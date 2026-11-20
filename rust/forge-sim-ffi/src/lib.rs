//! C ABI over `forge-sim`, for Unity (P/Invoke).
//!
//! ```csharp
//! [DllImport(Lib)] static extern IntPtr forge_sim_replay(byte[] scenario, byte[] seed, byte[] actions);
//! [DllImport(Lib)] static extern void forge_sim_free(IntPtr text);
//! ```
//! `Lib` is `"__Internal"` on iOS and WebGL (static link) and `"forge_sim_ffi"` elsewhere.
//! Arguments are NUL-terminated UTF-8. Every returned string is JSON, either
//! `{"ok": <Outcome>}` or `{"error": {"kind": "scenario" | "log", "message": "..."}}`,
//! and must be handed back to `forge_sim_free` exactly once.

use std::ffi::{c_char, CStr, CString};

use forge_sim::SimError;

/// Replay a run. See the crate docs for the argument and return format.
///
/// # Safety
/// Each argument must be null or point to a NUL-terminated string that stays valid
/// for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn forge_sim_replay(
    scenario: *const c_char,
    seed: *const c_char,
    actions: *const c_char,
) -> *mut c_char {
    // SAFETY: the caller upholds this function's contract for all three pointers.
    let args = unsafe { (text(scenario), text(seed), text(actions)) };
    let reply = match args {
        (Some(scenario), Some(seed), Some(actions)) => {
            match forge_sim::replay_json(scenario, seed, actions) {
                Ok(outcome) => format!("{{\"ok\":{outcome}}}"),
                Err(error) => failure(&error),
            }
        }
        _ => failure(&SimError::BadLog("arguments must be non-null UTF-8".into())),
    };
    // JSON text never holds a NUL byte (serde_json escapes it), so this can't fail.
    CString::new(reply).map_or(std::ptr::null_mut(), CString::into_raw)
}

/// Release a string returned by this library. Null is ignored.
///
/// # Safety
/// `text` must be null or a pointer returned by this library, not yet freed.
#[no_mangle]
pub unsafe extern "C" fn forge_sim_free(text: *mut c_char) {
    if !text.is_null() {
        // SAFETY: per the contract, `text` came from `CString::into_raw` here.
        drop(unsafe { CString::from_raw(text) });
    }
}

/// The rules version this library was built with (`forge_sim::RULES_VERSION`).
#[no_mangle]
pub extern "C" fn forge_sim_rules_version() -> u32 {
    forge_sim::RULES_VERSION
}

/// # Safety
/// `pointer` must be null or a valid NUL-terminated string for the returned lifetime.
unsafe fn text<'a>(pointer: *const c_char) -> Option<&'a str> {
    if pointer.is_null() {
        return None;
    }
    // SAFETY: non-null, and the caller guarantees a valid NUL-terminated string.
    unsafe { CStr::from_ptr(pointer) }.to_str().ok()
}

fn failure(error: &SimError) -> String {
    let (kind, message) = match error {
        SimError::BadScenario(message) => ("scenario", message),
        SimError::BadLog(message) => ("log", message),
    };
    // `{:?}` on a str is not JSON escaping; build the object with the JSON library.
    format!(
        "{{\"error\":{{\"kind\":\"{kind}\",\"message\":{}}}}}",
        json_string(message)
    )
}

fn json_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(scenario: &str, seed: &str, actions: &str) -> String {
        let (s, d, a) = (
            CString::new(scenario).unwrap(),
            CString::new(seed).unwrap(),
            CString::new(actions).unwrap(),
        );
        // SAFETY: valid NUL-terminated strings; the result is freed exactly once below.
        unsafe {
            let raw = forge_sim_replay(s.as_ptr(), d.as_ptr(), a.as_ptr());
            let reply = CStr::from_ptr(raw).to_str().unwrap().to_owned();
            forge_sim_free(raw);
            reply
        }
    }

    const SCENARIO: &str =
        r#"{"id":"s","format":1,"passScore":100,"steps":[{"id":"a","points":1,"required":true}]}"#;

    #[test]
    fn replays_through_the_c_abi() {
        let reply = call(SCENARIO, "1", r#"[{"t":0,"step":"a"}]"#);
        assert!(reply.starts_with(r#"{"ok":{"rulesVersion":1,"#), "{reply}");
        assert!(reply.contains(r#""passed":true"#));
    }

    #[test]
    fn errors_come_back_as_json_not_a_crash() {
        let reply = call(SCENARIO, "1", r#"[{"t":0,"step":"say \"hi\""}]"#);
        assert!(reply.starts_with(r#"{"error":{"kind":"log","#), "{reply}");
        assert!(reply.contains(r#"\\\"hi\\\""#), "{reply}"); // still valid JSON
                                                             // SAFETY: null arguments are part of the contract.
        let raw = unsafe { forge_sim_replay(std::ptr::null(), std::ptr::null(), std::ptr::null()) };
        assert!(!raw.is_null());
        // SAFETY: `raw` came from this library and is freed once; null is ignored.
        unsafe {
            forge_sim_free(raw);
            forge_sim_free(std::ptr::null_mut());
        }
    }
}
