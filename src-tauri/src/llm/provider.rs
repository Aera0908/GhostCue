//! The one place that decides which endpoint, key and model a provider uses.
//! A provider never borrows another provider's key, endpoint or model.

use crate::config::AppConfig;
use crate::llm::error::{LlmErrorKind, LlmFailure};
use crate::secrets::{KeyId, SecretStore};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ProviderId {
    OpenRouter,
    Gemini,
    OpenAi,
    Anthropic,
    DeepSeek,
    Groq,
    Ollama,
    Custom,
}

/// The request format a provider speaks.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Wire {
    OpenAiChat,
    Anthropic,
    Gemini,
    Ollama,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TaskKind {
    Chat,
    Code,
}

impl TaskKind {
    pub fn from_action(action: &str) -> TaskKind {
        match action {
            "code" | "vision" | "screen" => TaskKind::Code,
            _ => TaskKind::Chat,
        }
    }
}

#[derive(Debug)]
pub struct ProviderDef {
    pub id: ProviderId,
    pub slug: &'static str,
    pub display_name: &'static str,
    pub wire: Wire,
    /// Empty for Ollama and Custom, whose address comes from settings.
    pub base_url: &'static str,
    pub key: Option<KeyId>,
    pub key_required: bool,
    pub default_model: &'static str,
}

static PROVIDERS: [ProviderDef; 8] = [
    ProviderDef {
        id: ProviderId::OpenRouter,
        slug: "openrouter",
        display_name: "OpenRouter",
        wire: Wire::OpenAiChat,
        base_url: "https://openrouter.ai/api/v1",
        key: Some(KeyId::OpenRouter),
        key_required: true,
        default_model: "deepseek/deepseek-chat",
    },
    ProviderDef {
        id: ProviderId::Gemini,
        slug: "gemini",
        display_name: "Google Gemini",
        wire: Wire::Gemini,
        base_url: "https://generativelanguage.googleapis.com/v1beta",
        key: Some(KeyId::Gemini),
        key_required: true,
        default_model: "gemini-2.5-flash",
    },
    ProviderDef {
        id: ProviderId::OpenAi,
        slug: "openai",
        display_name: "OpenAI",
        wire: Wire::OpenAiChat,
        base_url: "https://api.openai.com/v1",
        key: Some(KeyId::OpenAi),
        key_required: true,
        default_model: "gpt-4o",
    },
    ProviderDef {
        id: ProviderId::Anthropic,
        slug: "anthropic",
        display_name: "Anthropic",
        wire: Wire::Anthropic,
        base_url: "https://api.anthropic.com/v1",
        key: Some(KeyId::Anthropic),
        key_required: true,
        default_model: "claude-opus-5-5",
    },
    ProviderDef {
        id: ProviderId::DeepSeek,
        slug: "deepseek",
        display_name: "DeepSeek",
        wire: Wire::OpenAiChat,
        base_url: "https://api.deepseek.com/v1",
        key: Some(KeyId::DeepSeek),
        key_required: true,
        default_model: "deepseek-chat",
    },
    ProviderDef {
        id: ProviderId::Groq,
        slug: "groq",
        display_name: "Groq",
        wire: Wire::OpenAiChat,
        base_url: "https://api.groq.com/openai/v1",
        key: Some(KeyId::Groq),
        key_required: true,
        default_model: "llama-3.3-70b-versatile",
    },
    ProviderDef {
        id: ProviderId::Ollama,
        slug: "ollama",
        display_name: "Ollama",
        wire: Wire::Ollama,
        base_url: "",
        key: None,
        key_required: false,
        default_model: "",
    },
    ProviderDef {
        id: ProviderId::Custom,
        slug: "custom",
        display_name: "Custom endpoint",
        wire: Wire::OpenAiChat,
        base_url: "",
        key: Some(KeyId::Custom),
        key_required: false,
        default_model: "",
    },
];

impl ProviderId {
    pub fn from_slug(s: &str) -> Option<ProviderId> {
        PROVIDERS.iter().find(|d| d.slug == s).map(|d| d.id)
    }
}

pub fn all() -> &'static [ProviderDef] {
    &PROVIDERS
}

pub fn def(id: ProviderId) -> &'static ProviderDef {
    PROVIDERS.iter().find(|d| d.id == id).expect("every ProviderId has a table row")
}

#[derive(Debug)]
pub struct ResolvedProvider {
    pub def: &'static ProviderDef,
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
    /// True only when the code model replaced the chosen model for this request.
    pub smart_routed: bool,
}

/// Resolves the provider selected in settings.
pub fn resolve(cfg: &AppConfig, secrets: &dyn SecretStore, task: TaskKind) -> Result<ResolvedProvider, LlmFailure> {
    let id = ProviderId::from_slug(&cfg.llm_provider).ok_or_else(|| {
        LlmFailure::new(
            "GhostCue",
            LlmErrorKind::UnknownProvider,
            "No answer provider is selected. Choose one in Settings.",
        )
    })?;
    resolve_for(id, cfg, secrets, task)
}

/// Address and key for a named provider, without choosing a model. Used to list models
/// before one has been picked; `model` is left empty.
pub fn connection_for(id: ProviderId, cfg: &AppConfig, secrets: &dyn SecretStore) -> Result<ResolvedProvider, LlmFailure> {
    let def = def(id);
    let name = def.display_name;

    let base_url = match id {
        ProviderId::Ollama => normalise_base_url(&cfg.ollama_endpoint).map_err(|e| named(e, name))?,
        ProviderId::Custom => normalise_base_url(&cfg.custom_endpoint).map_err(|e| named(e, name))?,
        ProviderId::OpenAi if !cfg.openai_base_url.trim().is_empty() => {
            normalise_base_url(&cfg.openai_base_url).map_err(|e| named(e, name))?
        }
        _ => def.base_url.to_string(),
    };

    let api_key = def.key.and_then(|key| secrets.get(key));
    if def.key_required && api_key.is_none() {
        return Err(LlmFailure::new(
            name,
            LlmErrorKind::MissingKey,
            format!("{name} has no API key saved. Add one in Settings."),
        ));
    }

    Ok(ResolvedProvider { def, base_url, api_key, model: String::new(), smart_routed: false })
}

/// Resolves a named provider, whether or not it is the selected one.
pub fn resolve_for(
    id: ProviderId,
    cfg: &AppConfig,
    secrets: &dyn SecretStore,
    task: TaskKind,
) -> Result<ResolvedProvider, LlmFailure> {
    let connection = connection_for(id, cfg, secrets)?;
    let def = connection.def;
    let name = def.display_name;

    let chosen = match id {
        ProviderId::OpenRouter => &cfg.openrouter_model,
        ProviderId::Gemini => &cfg.gemini_model,
        ProviderId::OpenAi => &cfg.openai_model,
        ProviderId::Anthropic => &cfg.anthropic_model,
        ProviderId::DeepSeek => &cfg.deepseek_model,
        ProviderId::Groq => &cfg.groq_model,
        ProviderId::Ollama => &cfg.ollama_model,
        ProviderId::Custom => &cfg.custom_model,
    }
    .trim();
    let chosen = if chosen.is_empty() { def.default_model } else { chosen };

    let code_model = cfg.code_models.get(def.slug).map(|m| m.trim()).filter(|m| !m.is_empty());
    let (model, smart_routed) = match code_model {
        Some(code_model) if cfg.smart_model_routing && task == TaskKind::Code => (code_model, true),
        _ => (chosen, false),
    };
    if model.is_empty() {
        return Err(LlmFailure::new(
            name,
            LlmErrorKind::ModelNotChosen,
            format!("{name} has no model chosen. Pick one in Settings."),
        ));
    }

    Ok(ResolvedProvider { model: model.to_string(), smart_routed, ..connection })
}

fn named(mut failure: LlmFailure, name: &str) -> LlmFailure {
    failure.provider = name.to_string();
    failure.message = format!("{name}: {}", failure.message);
    failure
}

/// Accepts what people paste: a trailing slash, or a full request path instead of the base.
pub fn normalise_base_url(raw: &str) -> Result<String, LlmFailure> {
    let invalid = |message: &str| LlmFailure::new("GhostCue", LlmErrorKind::InvalidEndpoint, message);
    let mut url = raw.trim();
    if url.is_empty() {
        return Err(invalid("Enter the server address."));
    }
    let lower = url.to_ascii_lowercase();
    let host_start = if lower.starts_with("https://") {
        8
    } else if lower.starts_with("http://") {
        7
    } else {
        return Err(invalid("The address must start with http:// or https://."));
    };
    if url[host_start..].trim_matches('/').is_empty() || url[host_start..].starts_with('/') {
        return Err(invalid("The address is missing a host name."));
    }

    const REQUEST_PATHS: [&str; 6] =
        ["/chat/completions", "/completions", "/models", "/api/chat", "/api/generate", "/api/tags"];
    loop {
        let trimmed = url.trim_end_matches('/');
        let stripped = REQUEST_PATHS
            .iter()
            .find_map(|suffix| trimmed.strip_suffix(suffix))
            .filter(|rest| rest.len() > host_start)
            .unwrap_or(trimmed);
        if stripped.len() == url.len() {
            break;
        }
        url = stripped;
    }
    Ok(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secrets::MemoryStore;

    const KEYED: [&str; 6] = ["openrouter", "gemini", "openai", "anthropic", "deepseek", "groq"];
    const ALL: [&str; 8] = ["openrouter", "gemini", "openai", "anthropic", "deepseek", "groq", "ollama", "custom"];

    fn cfg_for(slug: &str) -> AppConfig {
        AppConfig {
            llm_provider: slug.to_string(),
            custom_endpoint: "http://localhost:1234/v1".into(),
            custom_model: "custom-chosen".into(),
            ollama_model: "ollama-chosen".into(),
            gemini_model: "gemini-chosen".into(),
            openai_model: "openai-chosen".into(),
            anthropic_model: "anthropic-chosen".into(),
            deepseek_model: "deepseek-chosen".into(),
            groq_model: "groq-chosen".into(),
            openrouter_model: "openrouter-chosen".into(),
            ..AppConfig::default()
        }
    }

    fn store_with_all_keys() -> MemoryStore {
        let store = MemoryStore::new();
        for id in KeyId::all() {
            store.set(id, &format!("key-for-{}", id.slug())).unwrap();
        }
        store
    }

    #[test]
    fn table_has_the_eight_providers_with_unique_slugs() {
        let slugs: Vec<&str> = all().iter().map(|d| d.slug).collect();
        assert_eq!(slugs, ALL);
        for d in all() {
            assert_eq!(ProviderId::from_slug(d.slug), Some(d.id));
            assert_eq!(def(d.id).slug, d.slug);
            assert!(!d.display_name.is_empty());
        }
    }

    #[test]
    fn each_provider_uses_only_its_own_key() {
        let store = store_with_all_keys();
        for slug in KEYED.iter().chain(["custom"].iter()) {
            let p = resolve(&cfg_for(slug), &store, TaskKind::Chat).unwrap();
            assert_eq!(p.api_key.as_deref(), Some(format!("key-for-{slug}").as_str()), "{slug}");
        }
        let ollama = resolve(&cfg_for("ollama"), &store, TaskKind::Chat).unwrap();
        assert_eq!(ollama.api_key, None, "Ollama never receives a key");
    }

    #[test]
    fn no_fallback_when_own_key_missing() {
        for slug in KEYED {
            let store = store_with_all_keys();
            store.clear(KeyId::from_slug(slug).unwrap()).unwrap();
            let err = resolve(&cfg_for(slug), &store, TaskKind::Chat).unwrap_err();
            assert_eq!(err.kind, LlmErrorKind::MissingKey, "{slug}");
            assert!(err.message.contains(def(ProviderId::from_slug(slug).unwrap()).display_name), "{}", err.message);
            assert!(!err.message.contains("key-for-"), "{}", err.message);
        }
    }

    #[test]
    fn custom_without_key_resolves_with_none() {
        let p = resolve(&cfg_for("custom"), &MemoryStore::new(), TaskKind::Chat).unwrap();
        assert_eq!(p.api_key, None);
        assert_eq!(p.base_url, "http://localhost:1234/v1");
        assert_eq!(p.model, "custom-chosen");
    }

    #[test]
    fn anthropic_ignores_custom_endpoint() {
        let mut cfg = cfg_for("anthropic");
        cfg.custom_endpoint = "https://openrouter.ai/api/v1".into();
        cfg.openai_base_url = "https://example.invalid/v1".into();
        let p = resolve(&cfg, &store_with_all_keys(), TaskKind::Chat).unwrap();
        assert_eq!(p.base_url, "https://api.anthropic.com/v1");
        assert_eq!(p.def.wire, Wire::Anthropic);
    }

    #[test]
    fn only_openai_honours_openai_base_url() {
        let store = store_with_all_keys();
        for slug in ALL {
            let mut cfg = cfg_for(slug);
            cfg.openai_base_url = "https://proxy.example/v1/".into();
            let p = resolve(&cfg, &store, TaskKind::Chat).unwrap();
            assert_eq!(p.base_url.contains("proxy.example"), slug == "openai", "{slug}: {}", p.base_url);
        }
        let mut cfg = cfg_for("openai");
        cfg.openai_base_url = "  ".into();
        assert_eq!(resolve(&cfg, &store, TaskKind::Chat).unwrap().base_url, "https://api.openai.com/v1");
    }

    #[test]
    fn groq_uses_groq_model_not_openai_model() {
        let mut cfg = cfg_for("groq");
        cfg.openai_model = "gpt-4o".into();
        cfg.groq_model = "x".into();
        assert_eq!(resolve(&cfg, &store_with_all_keys(), TaskKind::Chat).unwrap().model, "x");
    }

    #[test]
    fn routing_off_never_changes_model() {
        let store = store_with_all_keys();
        for slug in ALL {
            let mut cfg = cfg_for(slug);
            cfg.code_models.insert(slug.to_string(), "code-model".into());
            for task in [TaskKind::Chat, TaskKind::Code] {
                let p = resolve(&cfg, &store, task).unwrap();
                assert_eq!(p.model, format!("{slug}-chosen"), "{slug} {task:?}");
                assert!(!p.smart_routed);
            }
        }
    }

    #[test]
    fn routing_on_without_code_model_never_changes_model() {
        let store = store_with_all_keys();
        for slug in ALL {
            let mut cfg = cfg_for(slug);
            cfg.smart_model_routing = true;
            cfg.code_models.insert("some-other-provider".into(), "code-model".into());
            cfg.code_models.insert(slug.to_string(), "   ".into());
            for task in [TaskKind::Chat, TaskKind::Code] {
                let p = resolve(&cfg, &store, task).unwrap();
                assert_eq!(p.model, format!("{slug}-chosen"), "{slug} {task:?}");
                assert!(!p.smart_routed);
            }
        }
    }

    #[test]
    fn routing_on_uses_code_model_for_code_only() {
        let store = store_with_all_keys();
        for slug in ALL {
            let mut cfg = cfg_for(slug);
            cfg.smart_model_routing = true;
            cfg.code_models.insert(slug.to_string(), "code-model".into());
            let chat = resolve(&cfg, &store, TaskKind::Chat).unwrap();
            assert_eq!(chat.model, format!("{slug}-chosen"));
            assert!(!chat.smart_routed);
            let code = resolve(&cfg, &store, TaskKind::Code).unwrap();
            assert_eq!(code.model, "code-model");
            assert!(code.smart_routed);
        }
    }

    #[test]
    fn empty_model_falls_back_to_the_providers_own_default_only() {
        let store = store_with_all_keys();
        for slug in KEYED {
            let mut cfg = AppConfig { llm_provider: slug.to_string(), ..AppConfig::default() };
            cfg.gemini_model.clear();
            cfg.openai_model.clear();
            cfg.anthropic_model.clear();
            cfg.deepseek_model.clear();
            cfg.groq_model.clear();
            cfg.openrouter_model.clear();
            cfg.custom_model = "must-not-be-used".into();
            let p = resolve(&cfg, &store, TaskKind::Chat).unwrap();
            assert_eq!(p.model, p.def.default_model, "{slug}");
            assert!(!p.model.is_empty());
        }
    }

    #[test]
    fn ollama_with_no_model_is_model_not_chosen() {
        for slug in ["ollama", "custom"] {
            let mut cfg = cfg_for(slug);
            cfg.ollama_model = "  ".into();
            cfg.custom_model.clear();
            let err = resolve(&cfg, &MemoryStore::new(), TaskKind::Chat).unwrap_err();
            assert_eq!(err.kind, LlmErrorKind::ModelNotChosen, "{slug}");
        }
    }

    #[test]
    fn unknown_provider_is_an_error() {
        for bad in ["nope", "", "OpenAI", "custom "] {
            let err = resolve(&cfg_for(bad), &store_with_all_keys(), TaskKind::Chat).unwrap_err();
            assert_eq!(err.kind, LlmErrorKind::UnknownProvider, "{bad:?}");
        }
    }

    #[test]
    fn custom_endpoint_normalisation() {
        for (raw, want) in [
            ("http://localhost:1234/v1/", "http://localhost:1234/v1"),
            ("http://localhost:1234/v1/chat/completions", "http://localhost:1234/v1"),
            ("http://localhost:1234/v1/chat/completions/", "http://localhost:1234/v1"),
            ("  https://host.example/api/v1/models  ", "https://host.example/api/v1"),
            ("http://localhost:11434/api/chat", "http://localhost:11434"),
            ("http://localhost:11434/api/tags", "http://localhost:11434"),
            ("http://localhost:11434///", "http://localhost:11434"),
            ("HTTPS://Host.example/v1", "HTTPS://Host.example/v1"),
        ] {
            assert_eq!(normalise_base_url(raw).unwrap(), want, "{raw:?}");
        }
        for bad in ["localhost:1234", "", "   ", "ftp://host/v1", "http://", "https:///", "//host/v1", "http:/host"] {
            let err = normalise_base_url(bad).unwrap_err();
            assert_eq!(err.kind, LlmErrorKind::InvalidEndpoint, "{bad:?}");
        }
    }

    #[test]
    fn bad_custom_or_ollama_address_fails_before_any_request() {
        let mut cfg = cfg_for("custom");
        cfg.custom_endpoint = "localhost:1234".into();
        assert_eq!(resolve(&cfg, &MemoryStore::new(), TaskKind::Chat).unwrap_err().kind, LlmErrorKind::InvalidEndpoint);
        let mut cfg = cfg_for("ollama");
        cfg.ollama_endpoint = String::new();
        assert_eq!(resolve(&cfg, &MemoryStore::new(), TaskKind::Chat).unwrap_err().kind, LlmErrorKind::InvalidEndpoint);
    }

    #[test]
    fn resolve_for_ignores_the_active_provider() {
        let p = resolve_for(ProviderId::Groq, &cfg_for("openai"), &store_with_all_keys(), TaskKind::Chat).unwrap();
        assert_eq!(p.def.slug, "groq");
        assert_eq!(p.api_key.as_deref(), Some("key-for-groq"));
        assert_eq!(p.model, "groq-chosen");
    }

    #[test]
    fn actions_map_to_task_kinds() {
        for a in ["code", "vision", "screen"] {
            assert_eq!(TaskKind::from_action(a), TaskKind::Code);
        }
        for a in ["hint", "ask", "summary", "", "CODE"] {
            assert_eq!(TaskKind::from_action(a), TaskKind::Chat);
        }
    }
}
