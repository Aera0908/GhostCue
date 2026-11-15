use std::collections::{BTreeMap, HashMap};

use parking_lot::Mutex;
use tauri::State;

use crate::state::AppState;

/// Credential Manager target name prefix. One credential per key, account = `KeyId::slug()`.
pub const SERVICE: &str = "GhostCue";

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum KeyId {
    OpenRouter,
    Gemini,
    OpenAi,
    Anthropic,
    DeepSeek,
    Groq,
    Custom,
    Deepgram,
}

impl KeyId {
    pub fn slug(self) -> &'static str {
        match self {
            KeyId::OpenRouter => "openrouter",
            KeyId::Gemini => "gemini",
            KeyId::OpenAi => "openai",
            KeyId::Anthropic => "anthropic",
            KeyId::DeepSeek => "deepseek",
            KeyId::Groq => "groq",
            KeyId::Custom => "custom",
            KeyId::Deepgram => "deepgram",
        }
    }

    pub fn from_slug(s: &str) -> Option<KeyId> {
        KeyId::all().into_iter().find(|id| id.slug() == s)
    }

    pub fn all() -> [KeyId; 8] {
        [
            KeyId::OpenRouter,
            KeyId::Gemini,
            KeyId::OpenAi,
            KeyId::Anthropic,
            KeyId::DeepSeek,
            KeyId::Groq,
            KeyId::Custom,
            KeyId::Deepgram,
        ]
    }
}

/// Debug builds store their keys under separate credential names, apart from the installed app.
pub fn account_prefix(debug_build: bool) -> &'static str {
    if debug_build {
        "dev-"
    } else {
        ""
    }
}

pub trait SecretStore: Send + Sync {
    /// Served from memory; never touches the backing store.
    fn get(&self, id: KeyId) -> Option<String>;
    /// Trims the value. An empty value is an error and leaves the previous one in place.
    fn set(&self, id: KeyId, value: &str) -> Result<(), String>;
    fn clear(&self, id: KeyId) -> Result<(), String>;
    /// Holds a key for this session only. Nothing is persisted and it cannot fail.
    fn remember(&self, id: KeyId, value: &str);
}

fn cleaned(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err("Enter a key before saving.".to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

pub fn key_status(store: &dyn SecretStore) -> BTreeMap<String, bool> {
    KeyId::all()
        .into_iter()
        .map(|id| (id.slug().to_string(), store.get(id).is_some()))
        .collect()
}

/// In-memory store for tests.
#[derive(Default)]
pub struct MemoryStore {
    cache: Mutex<HashMap<KeyId, String>>,
    fail_writes: bool,
}

impl MemoryStore {
    pub fn new() -> Self {
        Self::default()
    }

    /// A store whose `set` and `clear` always fail, as when Credential Manager denies access.
    pub fn failing() -> Self {
        Self { cache: Mutex::default(), fail_writes: true }
    }
}

impl SecretStore for MemoryStore {
    fn get(&self, id: KeyId) -> Option<String> {
        self.cache.lock().get(&id).cloned()
    }

    fn set(&self, id: KeyId, value: &str) -> Result<(), String> {
        let value = cleaned(value)?;
        if self.fail_writes {
            return Err("The key could not be saved.".to_string());
        }
        self.cache.lock().insert(id, value);
        Ok(())
    }

    fn clear(&self, id: KeyId) -> Result<(), String> {
        if self.fail_writes {
            return Err("The key could not be removed.".to_string());
        }
        self.cache.lock().remove(&id);
        Ok(())
    }

    fn remember(&self, id: KeyId, value: &str) {
        if let Ok(value) = cleaned(value) {
            self.cache.lock().insert(id, value);
        }
    }
}

/// Windows Credential Manager, with every key read once at construction.
pub struct KeyringStore {
    cache: Mutex<HashMap<KeyId, String>>,
    account_prefix: String,
}

impl KeyringStore {
    pub fn new() -> Self {
        Self::with_account_prefix(account_prefix(cfg!(debug_assertions)))
    }

    pub fn with_account_prefix(prefix: &str) -> Self {
        let store = Self { cache: Mutex::default(), account_prefix: prefix.to_string() };
        let mut loaded = HashMap::new();
        for id in KeyId::all() {
            match store.entry(id).and_then(|e| e.get_password().map_err(|e| e.to_string())) {
                Ok(value) if !value.trim().is_empty() => {
                    loaded.insert(id, value.trim().to_string());
                }
                Ok(_) => {}
                Err(e) => log::debug!("No stored key for {}: {e}", id.slug()),
            }
        }
        *store.cache.lock() = loaded;
        store
    }

    fn entry(&self, id: KeyId) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, &format!("{}{}", self.account_prefix, id.slug()))
            .map_err(|e| format!("Windows Credential Manager is not available: {e}"))
    }
}

impl Default for KeyringStore {
    fn default() -> Self {
        Self::new()
    }
}

impl SecretStore for KeyringStore {
    fn get(&self, id: KeyId) -> Option<String> {
        self.cache.lock().get(&id).cloned()
    }

    fn set(&self, id: KeyId, value: &str) -> Result<(), String> {
        let value = cleaned(value)?;
        self.entry(id)?
            .set_password(&value)
            .map_err(|e| format!("Windows Credential Manager could not save the key: {e}"))?;
        self.cache.lock().insert(id, value);
        Ok(())
    }

    fn clear(&self, id: KeyId) -> Result<(), String> {
        match self.entry(id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("Windows Credential Manager could not remove the key: {e}")),
        }
        self.cache.lock().remove(&id);
        Ok(())
    }

    fn remember(&self, id: KeyId, value: &str) {
        if let Ok(value) = cleaned(value) {
            self.cache.lock().insert(id, value);
        }
    }
}

fn parse_key_id(key_id: &str) -> Result<KeyId, String> {
    KeyId::from_slug(key_id).ok_or_else(|| "Unknown key name.".to_string())
}

/// Which keys are present. The values themselves never leave the backend.
#[tauri::command]
pub async fn get_key_status(state: State<'_, AppState>) -> Result<BTreeMap<String, bool>, String> {
    Ok(key_status(state.inner().secrets.as_ref()))
}

#[tauri::command]
pub async fn set_provider_key(key_id: String, value: String, state: State<'_, AppState>) -> Result<(), String> {
    state.inner().secrets.set(parse_key_id(&key_id)?, &value)
}

#[tauri::command]
pub async fn clear_provider_key(key_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.inner().secrets.clear(parse_key_id(&key_id)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip_contract(store: &dyn SecretStore, big: &str) {
        assert_eq!(store.get(KeyId::Groq), None, "get_missing_is_none");

        store.set(KeyId::Groq, "gsk_abc").unwrap();
        assert_eq!(store.get(KeyId::Groq).as_deref(), Some("gsk_abc"));
        assert_eq!(store.get(KeyId::OpenAi), None, "keys must not bleed across ids");

        store.set(KeyId::Groq, "  sk-abc\r\n").unwrap();
        assert_eq!(store.get(KeyId::Groq).as_deref(), Some("sk-abc"));

        for bad in ["", "   ", "\r\n\t "] {
            assert!(store.set(KeyId::Groq, bad).is_err(), "{bad:?} must be rejected");
            assert_eq!(store.get(KeyId::Groq).as_deref(), Some("sk-abc"), "previous value must survive");
        }

        store.set(KeyId::Custom, big).unwrap();
        assert_eq!(store.get(KeyId::Custom).as_deref(), Some(big));

        store.clear(KeyId::Groq).unwrap();
        assert_eq!(store.get(KeyId::Groq), None);
        store.clear(KeyId::Groq).unwrap(); // clearing a missing key is not an error
        store.clear(KeyId::Custom).unwrap();
        assert_eq!(store.get(KeyId::Custom), None);
    }

    #[test]
    fn memory_store_contract() {
        let big = "\u{952E}\u{1F511}-\u{E9}".repeat(600); // > 4 KB of mixed-width unicode
        assert!(big.len() > 4096);
        roundtrip_contract(&MemoryStore::new(), &big);
    }

    #[test]
    fn set_trims_whitespace_and_newlines() {
        let store = MemoryStore::new();
        store.set(KeyId::OpenRouter, "  sk-abc\r\n").unwrap();
        assert_eq!(store.get(KeyId::OpenRouter).as_deref(), Some("sk-abc"));
    }

    #[test]
    fn store_failure_does_not_fall_back() {
        let store = MemoryStore::failing();
        store.remember(KeyId::OpenAi, "sk-loaded-earlier");

        assert!(store.set(KeyId::OpenAi, "sk-new").is_err());
        assert_eq!(store.get(KeyId::OpenAi).as_deref(), Some("sk-loaded-earlier"));

        assert!(store.set(KeyId::Gemini, "AIza-new").is_err());
        assert_eq!(store.get(KeyId::Gemini), None, "a failed save must not be readable");

        assert!(store.clear(KeyId::OpenAi).is_err());
        assert_eq!(store.get(KeyId::OpenAi).as_deref(), Some("sk-loaded-earlier"));
    }

    #[test]
    fn remember_trims_and_ignores_empty() {
        let store = MemoryStore::new();
        store.remember(KeyId::Deepgram, " dg-1 \n");
        assert_eq!(store.get(KeyId::Deepgram).as_deref(), Some("dg-1"));
        store.remember(KeyId::Deepgram, "   ");
        assert_eq!(store.get(KeyId::Deepgram).as_deref(), Some("dg-1"));
    }

    #[test]
    fn slugs_roundtrip_and_are_the_documented_eight() {
        let slugs: Vec<&str> = KeyId::all().iter().map(|k| k.slug()).collect();
        assert_eq!(
            slugs,
            ["openrouter", "gemini", "openai", "anthropic", "deepseek", "groq", "custom", "deepgram"]
        );
        for id in KeyId::all() {
            assert_eq!(KeyId::from_slug(id.slug()), Some(id));
        }
    }

    #[test]
    fn unknown_slug_is_rejected() {
        for bad in ["nope", "", "OpenAI", "openai ", "openai_api_key"] {
            assert_eq!(KeyId::from_slug(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn key_status_lists_every_key() {
        let store = MemoryStore::new();
        store.set(KeyId::DeepSeek, "sk-d").unwrap();
        let status = key_status(&store);
        assert_eq!(status.len(), 8);
        assert_eq!(status.get("deepseek"), Some(&true));
        assert_eq!(status.values().filter(|v| **v).count(), 1);
    }

    #[test]
    fn concurrent_sets_keep_each_key_intact() {
        let store = std::sync::Arc::new(MemoryStore::new());
        let handles: Vec<_> = KeyId::all()
            .into_iter()
            .map(|id| {
                let store = store.clone();
                std::thread::spawn(move || {
                    for i in 0..200 {
                        store.set(id, &format!("{}-{i}", id.slug())).unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        for id in KeyId::all() {
            assert_eq!(store.get(id), Some(format!("{}-199", id.slug())));
        }
    }

    /// Talks to the real Windows Credential Manager. Run with `-- --ignored`.
    #[test]
    #[ignore]
    fn keyring_roundtrip_real_store() {
        struct Cleanup(String);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                for id in KeyId::all() {
                    if let Ok(entry) = keyring::Entry::new(SERVICE, &format!("{}{}", self.0, id.slug())) {
                        let _ = entry.delete_credential();
                    }
                }
            }
        }
        let prefix = format!("ghostcue-test-{}-", uuid::Uuid::new_v4());
        let _cleanup = Cleanup(prefix.clone());

        let store = KeyringStore::with_account_prefix(&prefix);
        // Credential Manager caps a secret at 2560 bytes, so the large value here is smaller
        // than the one the in-memory contract uses.
        let big = "\u{952E}\u{1F511}-\u{E9}".repeat(100);
        roundtrip_contract(&store, &big);

        store.set(KeyId::Anthropic, "sk-ant-persisted").unwrap();
        let reopened = KeyringStore::with_account_prefix(&prefix);
        assert_eq!(reopened.get(KeyId::Anthropic).as_deref(), Some("sk-ant-persisted"));
        assert_eq!(reopened.get(KeyId::OpenAi), None);
    }
}
