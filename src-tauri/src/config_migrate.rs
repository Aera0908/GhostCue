//! Reads the settings format used before keys moved out of the file (no `config_version` field).

use serde_json::{Map, Value};

use crate::config::{AppConfig, CONFIG_VERSION};
use crate::secrets::KeyId;

pub struct Migrated {
    pub config: AppConfig,
    pub keys: Vec<(KeyId, String)>,
    /// Plain sentences for the owner. Never contains a key.
    pub notes: Vec<String>,
}

const KEY_FIELDS: [(&str, KeyId); 8] = [
    ("openrouter_api_key", KeyId::OpenRouter),
    ("gemini_api_key", KeyId::Gemini),
    ("openai_api_key", KeyId::OpenAi),
    ("anthropic_api_key", KeyId::Anthropic),
    ("deepseek_api_key", KeyId::DeepSeek),
    ("groq_api_key", KeyId::Groq),
    ("custom_api_key", KeyId::Custom),
    ("deepgram_api_key", KeyId::Deepgram),
];

fn text(obj: &Map<String, Value>, field: &str) -> String {
    obj.get(field).and_then(Value::as_str).unwrap_or("").trim().to_string()
}

fn key(keys: &[(KeyId, String)], id: KeyId) -> Option<String> {
    keys.iter().find(|(k, _)| *k == id).map(|(_, v)| v.clone())
}

fn drop_key(keys: &mut Vec<(KeyId, String)>, id: KeyId) {
    keys.retain(|(k, _)| *k != id);
}

fn looks_like_an_openai_model(model: &str) -> bool {
    ["gpt-", "chatgpt", "o1", "o3", "o4"].iter().any(|p| model.starts_with(p))
}

/// Model ids Anthropic no longer serves.
fn is_retired_anthropic_model(model: &str) -> bool {
    model.starts_with("claude-3-")
        || ["claude-opus-4-0", "claude-opus-4-1", "claude-sonnet-4-0"].contains(&model)
        || ["claude-opus-4-1-", "claude-opus-4-2025", "claude-sonnet-4-2025"].iter().any(|p| model.starts_with(p))
}

/// The old app copied keys between provider fields and kept the Groq answer model in the
/// OpenAI fields. This undoes that so each provider ends up with only its own key and model.
/// An `Err` means the file is not a usable settings object; nothing is extracted from it.
pub fn migrate_v1(raw: &Value) -> Result<Migrated, String> {
    let mut obj = raw.as_object().cloned().ok_or("the settings file is not a JSON object")?;
    let mut notes = Vec::new();

    let mut keys: Vec<(KeyId, String)> = Vec::new();
    for (field, id) in KEY_FIELDS {
        if let Some(value) = obj.remove(field) {
            let value = value.as_str().unwrap_or("").trim().to_string();
            if !value.is_empty() {
                keys.push((id, value));
            }
        }
    }

    // OpenRouter and Custom shared one key in both directions.
    if let (Some(custom), Some(openrouter)) = (key(&keys, KeyId::Custom), key(&keys, KeyId::OpenRouter)) {
        if custom == openrouter {
            let endpoint = text(&obj, "custom_endpoint");
            let points_at_openrouter = endpoint.contains("openrouter.ai");
            if points_at_openrouter || endpoint.is_empty() || custom.starts_with("sk-or-") {
                drop_key(&mut keys, KeyId::Custom);
                if points_at_openrouter {
                    obj.insert("custom_endpoint".into(), Value::String(String::new()));
                    if text(&obj, "custom_model") == text(&obj, "openrouter_model") {
                        obj.insert("custom_model".into(), Value::String(String::new()));
                    }
                }
                notes.push("The OpenRouter key had also been copied into the custom endpoint. That copy was removed.".to_string());
            } else {
                drop_key(&mut keys, KeyId::OpenRouter);
                notes.push("The custom endpoint key had also been copied into OpenRouter. That copy was removed.".to_string());
            }
        }
    }

    // The DeepSeek field also wrote the custom key.
    if let (Some(custom), Some(deepseek)) = (key(&keys, KeyId::Custom), key(&keys, KeyId::DeepSeek)) {
        if custom == deepseek && !text(&obj, "custom_endpoint").contains("deepseek.com") {
            drop_key(&mut keys, KeyId::Custom);
            notes.push("The DeepSeek key had also been copied into the custom endpoint. That copy was removed.".to_string());
        }
    }

    // Groq answers used the OpenAI key field.
    if let Some(openai) = key(&keys, KeyId::OpenAi) {
        if openai.starts_with("gsk_") {
            drop_key(&mut keys, KeyId::OpenAi);
            match key(&keys, KeyId::Groq) {
                None => {
                    keys.push((KeyId::Groq, openai));
                    notes.push("A Groq key saved in the OpenAI field was moved to Groq.".to_string());
                }
                Some(groq) if groq != openai => notes.push(
                    "The OpenAI field held a second Groq key. It was not kept. Groq now uses the key saved for speech to text."
                        .to_string(),
                ),
                Some(_) => {}
            }
        }
    }

    // Groq answers also used the OpenAI model field.
    if text(&obj, "llm_provider") == "groq" {
        let model = text(&obj, "openai_model");
        if !model.is_empty() && !looks_like_an_openai_model(&model) {
            obj.insert("groq_model".into(), Value::String(model));
            obj.insert("openai_model".into(), Value::String("gpt-4o".into()));
        }
    }

    // A retired model id can only fail, so it is replaced with the current default.
    let anthropic_model = text(&obj, "anthropic_model");
    if is_retired_anthropic_model(&anthropic_model) {
        let current = AppConfig::default().anthropic_model;
        notes.push(format!("The Anthropic model {anthropic_model} has been retired, so it was replaced with {current}."));
        obj.insert("anthropic_model".into(), Value::String(current));
    }

    if obj.get("smart_model_routing").and_then(Value::as_bool).unwrap_or(true) {
        notes.push("Automatic model switching is now off. GhostCue uses the model you choose.".to_string());
    }
    obj.insert("smart_model_routing".into(), Value::Bool(false));
    obj.insert("config_version".into(), Value::from(CONFIG_VERSION));

    let config: AppConfig = serde_json::from_value(Value::Object(obj)).map_err(|e| e.to_string())?;
    Ok(Migrated { config, keys, notes })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::{json, Value};

    pub(crate) const FIXTURES: [(&str, &str); 4] = [
        ("openrouter_bridged", include_str!("../tests/fixtures/config_v1_openrouter_bridged.json")),
        ("groq_in_openai", include_str!("../tests/fixtures/config_v1_groq_in_openai.json")),
        ("minimal", include_str!("../tests/fixtures/config_v1_minimal.json")),
        ("all_keys", include_str!("../tests/fixtures/config_v1_all_keys.json")),
    ];

    fn fixture(name: &str) -> Value {
        let text = FIXTURES.iter().find(|(n, _)| *n == name).expect("fixture").1;
        serde_json::from_str(text).unwrap()
    }

    /// Every distinct non-empty `*_api_key` value in an old-format file.
    pub(crate) fn key_strings(raw: &Value) -> Vec<String> {
        let mut out: Vec<String> = raw
            .as_object()
            .unwrap()
            .iter()
            .filter(|(k, _)| k.ends_with("_api_key"))
            .filter_map(|(_, v)| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        out.sort();
        out.dedup();
        out
    }

    fn key_of(m: &Migrated, id: KeyId) -> Option<&str> {
        m.keys.iter().find(|(k, _)| *k == id).map(|(_, v)| v.as_str())
    }

    #[test]
    fn v1_openrouter_bridge_is_unmerged() {
        let m = migrate_v1(&fixture("openrouter_bridged")).unwrap();
        assert_eq!(m.keys, vec![(KeyId::OpenRouter, "sk-or-v1-TESTONLY-OPENROUTER".to_string())]);
        assert_eq!(m.config.custom_endpoint, "");
        assert_eq!(m.config.custom_model, "");
        assert_eq!(m.config.openrouter_model, "anthropic/claude-test");
        assert_eq!(m.config.llm_provider, "openrouter");
        assert!(!m.notes.is_empty());
    }

    #[test]
    fn bridged_key_on_a_real_custom_endpoint_stays_with_custom() {
        let mut raw = fixture("openrouter_bridged");
        raw["custom_endpoint"] = json!("http://localhost:1234/v1");
        raw["custom_api_key"] = json!("local-TESTONLY");
        raw["openrouter_api_key"] = json!("local-TESTONLY");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(m.keys, vec![(KeyId::Custom, "local-TESTONLY".to_string())]);
        assert_eq!(m.config.custom_endpoint, "http://localhost:1234/v1");
        assert_eq!(m.config.custom_model, "anthropic/claude-test");
    }

    #[test]
    fn v1_groq_key_moves_out_of_openai() {
        let m = migrate_v1(&fixture("groq_in_openai")).unwrap();
        assert_eq!(m.keys, vec![(KeyId::Groq, "gsk_TESTONLY-GROQ-LLM".to_string())]);
        assert_eq!(m.config.groq_model, "llama-3.1-8b-instant");
        assert_eq!(m.config.openai_model, "gpt-4o");
        assert_eq!(m.config.llm_provider, "groq");
    }

    #[test]
    fn groq_provider_with_an_openai_model_name_gets_the_groq_default() {
        let mut raw = fixture("groq_in_openai");
        raw["openai_model"] = json!("gpt-4o-mini");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(m.config.groq_model, AppConfig::default().groq_model);
        assert_eq!(m.config.openai_model, "gpt-4o-mini");
    }

    #[test]
    fn second_groq_key_in_openai_field_is_dropped_with_a_note() {
        let mut raw = fixture("groq_in_openai");
        raw["groq_api_key"] = json!("gsk_TESTONLY-GROQ-STT");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(m.keys, vec![(KeyId::Groq, "gsk_TESTONLY-GROQ-STT".to_string())]);
        assert!(m.notes.iter().any(|n| n.contains("Groq")), "notes were {:?}", m.notes);
    }

    #[test]
    fn v1_all_keys_extracted_exactly() {
        let m = migrate_v1(&fixture("all_keys")).unwrap();
        let expected = [
            (KeyId::OpenRouter, "sk-or-v1-TESTONLY-1"),
            (KeyId::Gemini, "AIza-TESTONLY-2"),
            (KeyId::OpenAi, "sk-TESTONLY-3"),
            (KeyId::Anthropic, "sk-ant-TESTONLY-4"),
            (KeyId::DeepSeek, "sk-ds-TESTONLY-5"),
            (KeyId::Groq, "gsk_TESTONLY-6"),
            (KeyId::Custom, "custom-TESTONLY-7"),
            (KeyId::Deepgram, "dg-TESTONLY-8"),
        ];
        assert_eq!(m.keys.len(), 8);
        for (id, value) in expected {
            assert_eq!(key_of(&m, id), Some(value), "{id:?}");
        }
        assert_eq!(m.config.custom_endpoint, "http://localhost:1234/v1");
        assert_eq!(m.config.custom_model, "local-model");
    }

    #[test]
    fn v1_minimal_fills_defaults() {
        let m = migrate_v1(&fixture("minimal")).unwrap();
        let d = AppConfig::default();
        assert_eq!(m.config.opacity, 0.5, "values present in the file are kept");
        assert_eq!(m.config.target_role, "Staff Engineer");
        assert_eq!(m.config.font_size, d.font_size);
        assert_eq!(m.config.focus_shield_enabled, d.focus_shield_enabled);
        assert_eq!(m.config.groq_whisper_model, d.groq_whisper_model);
        assert_eq!(m.config.deepseek_model, d.deepseek_model);
        assert_eq!(m.config.openrouter_model, d.openrouter_model);
        assert_eq!(m.config.groq_model, d.groq_model);
        assert_eq!(m.keys, vec![(KeyId::Gemini, "AIza-TESTONLY-MINIMAL".to_string())]);
    }

    #[test]
    fn every_migration_turns_routing_off_and_sets_version_2() {
        for (name, text) in FIXTURES {
            let m = migrate_v1(&serde_json::from_str(text).unwrap()).unwrap();
            assert!(!m.config.smart_model_routing, "{name}");
            assert_eq!(m.config.config_version, 2, "{name}");
            assert!(m.config.code_models.is_empty(), "{name}");
        }
    }

    #[test]
    fn migration_never_loses_a_key() {
        for (name, text) in FIXTURES {
            let raw: Value = serde_json::from_str(text).unwrap();
            let m = migrate_v1(&raw).unwrap();
            for key in key_strings(&raw) {
                assert!(m.keys.iter().any(|(_, v)| *v == key), "{name}: {key} was lost");
            }
        }
    }

    #[test]
    fn notes_and_config_never_contain_key_strings() {
        let mut cases: Vec<Value> = FIXTURES.iter().map(|(_, t)| serde_json::from_str(t).unwrap()).collect();
        let mut two_groq = fixture("groq_in_openai");
        two_groq["groq_api_key"] = json!("gsk_TESTONLY-GROQ-STT");
        cases.push(two_groq);
        for raw in cases {
            let m = migrate_v1(&raw).unwrap();
            let config_text = serde_json::to_string(&m.config).unwrap();
            assert!(!config_text.contains("_api_key"));
            for key in key_strings(&raw) {
                assert!(!config_text.contains(&key), "config contains {key}");
                assert!(m.notes.iter().all(|n| !n.contains(&key)), "a note contains {key}");
            }
        }
    }

    #[test]
    fn custom_key_copied_from_deepseek_is_dropped() {
        let mut raw = fixture("all_keys");
        raw["custom_api_key"] = json!("sk-ds-TESTONLY-5");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(key_of(&m, KeyId::Custom), None);
        assert_eq!(key_of(&m, KeyId::DeepSeek), Some("sk-ds-TESTONLY-5"));

        raw["custom_endpoint"] = json!("https://api.deepseek.com/v1");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(key_of(&m, KeyId::Custom), Some("sk-ds-TESTONLY-5"));
    }

    #[test]
    fn retired_anthropic_model_is_replaced_and_a_current_one_is_kept() {
        let mut raw = fixture("all_keys");
        for retired in ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-latest", "claude-opus-4-1", "claude-sonnet-4-20250514"] {
            raw["anthropic_model"] = json!(retired);
            let m = migrate_v1(&raw).unwrap();
            assert_eq!(m.config.anthropic_model, AppConfig::default().anthropic_model, "{retired}");
            assert!(m.notes.iter().any(|n| n.contains(retired)), "{:?}", m.notes);
        }
        for kept in ["claude-sonnet-5-5", "claude-haiku-4-5", "claude-opus-4-8", "my-proxy-model"] {
            raw["anthropic_model"] = json!(kept);
            assert_eq!(migrate_v1(&raw).unwrap().config.anthropic_model, kept);
        }
    }

    #[test]
    fn keys_are_trimmed_and_blank_keys_are_skipped() {
        let mut raw = fixture("minimal");
        raw["gemini_api_key"] = json!("  AIza-TESTONLY-PADDED\r\n");
        raw["openai_api_key"] = json!("   ");
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(m.keys, vec![(KeyId::Gemini, "AIza-TESTONLY-PADDED".to_string())]);
    }

    #[test]
    fn key_fields_of_the_wrong_type_are_ignored() {
        let mut raw = fixture("minimal");
        raw["openai_api_key"] = json!(12345);
        raw["anthropic_api_key"] = Value::Null;
        raw["deepgram_api_key"] = json!(["dg"]);
        let m = migrate_v1(&raw).unwrap();
        assert_eq!(m.keys, vec![(KeyId::Gemini, "AIza-TESTONLY-MINIMAL".to_string())]);
    }

    #[test]
    fn wrong_typed_setting_is_an_error_not_a_reset() {
        let mut raw = fixture("minimal");
        raw["opacity"] = json!("high");
        assert!(migrate_v1(&raw).is_err());
        assert!(migrate_v1(&json!([])).is_err());
        assert!(migrate_v1(&Value::Null).is_err());
    }
}
