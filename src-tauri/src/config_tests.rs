use super::*;
use crate::config_migrate::tests::{key_strings, FIXTURES};
use crate::secrets::{KeyId, MemoryStore, SecretStore};
use std::fs;
use std::path::Path;
use tempfile::TempDir;

fn file_in(dir: &Path) -> PathBuf {
    dir.join(CONFIG_FILE)
}

fn dir_with(content: &[u8]) -> TempDir {
    let dir = TempDir::new().unwrap();
    fs::write(file_in(dir.path()), content).unwrap();
    dir
}

fn backups_in(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.file_name().unwrap().to_string_lossy().contains(".bad-"))
        .collect()
}

fn load(dir: &Path, secrets: &dyn SecretStore) -> (ConfigManager, LoadOutcome, Option<String>) {
    ConfigManager::load(dir.to_path_buf(), secrets)
}

#[test]
fn defaults_have_no_key_fields_and_routing_is_off() {
    let d = AppConfig::default();
    let text = serde_json::to_string(&d).unwrap();
    assert!(!text.contains("_api_key"), "{text}");
    assert_eq!(d.config_version, 2);
    assert!(!d.smart_model_routing);
    assert!(d.code_models.is_empty());
}

#[test]
fn environment_no_longer_overrides_anything() {
    std::env::set_var("SMART_MODEL_ROUTING", "true");
    std::env::set_var("GEMINI_MODEL", "from-env");
    std::env::set_var("LLM_PROVIDER", "from-env");
    let d = AppConfig::default();
    assert!(!d.smart_model_routing);
    assert_ne!(d.gemini_model, "from-env");

    let mut saved = AppConfig::default();
    saved.gemini_model = "chosen".into();
    let dir = dir_with(serde_json::to_string(&saved).unwrap().as_bytes());
    let (mgr, outcome, _) = load(dir.path(), &MemoryStore::new());
    assert_eq!(outcome, LoadOutcome::Loaded);
    assert_eq!(mgr.get_config(), saved);
    std::env::remove_var("SMART_MODEL_ROUTING");
    std::env::remove_var("GEMINI_MODEL");
    std::env::remove_var("LLM_PROVIDER");
}

#[test]
fn fresh_start_writes_nothing() {
    let dir = TempDir::new().unwrap();
    let (mgr, outcome, notice) = load(dir.path(), &MemoryStore::new());
    assert_eq!(outcome, LoadOutcome::Fresh);
    assert_eq!(notice, None);
    assert_eq!(mgr.get_config(), AppConfig::default());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
}

#[test]
fn migrated_file_contains_no_key_strings() {
    for (name, text) in FIXTURES {
        let raw: serde_json::Value = serde_json::from_str(text).unwrap();
        let dir = dir_with(text.as_bytes());
        let secrets = MemoryStore::new();

        let (mgr, outcome, _) = load(dir.path(), &secrets);
        assert_eq!(outcome, LoadOutcome::Migrated, "{name}");

        let saved = fs::read_to_string(file_in(dir.path())).unwrap();
        assert!(!saved.contains("_api_key"), "{name}: {saved}");
        for key in key_strings(&raw) {
            assert!(!saved.contains(&key), "{name}: file still contains {key}");
            assert!(
                KeyId::all().into_iter().any(|id| secrets.get(id).as_deref() == Some(key.as_str())),
                "{name}: {key} is not in the store"
            );
        }

        let (again, outcome, notice) = load(dir.path(), &secrets);
        assert_eq!(outcome, LoadOutcome::Loaded, "{name}: second launch must not migrate again");
        assert_eq!(notice, None);
        assert_eq!(again.get_config(), mgr.get_config());
        assert!(backups_in(dir.path()).is_empty());
    }
}

#[test]
fn migration_keeps_file_when_store_fails() {
    let text = FIXTURES.iter().find(|(n, _)| *n == "all_keys").unwrap().1;
    let dir = dir_with(text.as_bytes());
    let secrets = MemoryStore::failing();

    let (mgr, outcome, notice) = load(dir.path(), &secrets);

    assert_eq!(outcome, LoadOutcome::Migrated);
    assert_eq!(fs::read(file_in(dir.path())).unwrap(), text.as_bytes(), "file must be untouched");
    let notice = notice.expect("the owner must be told");
    assert!(notice.contains("Credential Manager"), "{notice}");
    assert!(!notice.contains("TESTONLY"), "{notice}");
    assert_eq!(secrets.get(KeyId::Anthropic).as_deref(), Some("sk-ant-TESTONLY-4"));
    assert_eq!(secrets.get(KeyId::Deepgram).as_deref(), Some("dg-TESTONLY-8"));
    assert_eq!(mgr.get_config().config_version, 2);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1, "nothing else may be written");
}

#[test]
fn migration_does_not_overwrite_a_key_already_in_the_store() {
    let text = FIXTURES.iter().find(|(n, _)| *n == "all_keys").unwrap().1;
    let dir = dir_with(text.as_bytes());
    let secrets = MemoryStore::new();
    secrets.set(KeyId::OpenAi, "sk-NEWER-IN-STORE").unwrap();

    let (_, outcome, _) = load(dir.path(), &secrets);

    assert_eq!(outcome, LoadOutcome::Migrated);
    assert_eq!(secrets.get(KeyId::OpenAi).as_deref(), Some("sk-NEWER-IN-STORE"));
    assert_eq!(secrets.get(KeyId::Gemini).as_deref(), Some("AIza-TESTONLY-2"));
    assert!(!fs::read_to_string(file_in(dir.path())).unwrap().contains("TESTONLY"));
}

#[test]
fn corrupt_file_is_quarantined_not_overwritten() {
    let big = "x".repeat(1024 * 1024);
    let inputs: [&[u8]; 6] = [b"", b"{", b"[]", b"null", big.as_bytes(), &[0xff, 0xfe, 0x00, 0x7b]];
    for input in inputs {
        let dir = dir_with(input);
        let (mgr, outcome, notice) = load(dir.path(), &MemoryStore::new());

        let backup = match outcome {
            LoadOutcome::Quarantined { backup } => backup,
            other => panic!("expected quarantine for {} bytes, got {other:?}", input.len()),
        };
        assert_eq!(fs::read(&backup).unwrap(), input);
        assert_eq!(backups_in(dir.path()), vec![backup.clone()]);
        assert!(notice.is_some());
        assert_eq!(mgr.get_config(), AppConfig::default());

        let mut changed = mgr.get_config();
        changed.target_role = "after quarantine".into();
        mgr.update_config(changed).unwrap();
        assert_eq!(fs::read(&backup).unwrap(), input, "a later save must not touch the backup");
    }
}

#[test]
fn two_quarantines_in_the_same_second_keep_both_files() {
    let dir = dir_with(b"{");
    let (_, first, _) = load(dir.path(), &MemoryStore::new());
    fs::write(file_in(dir.path()), b"[").unwrap();
    let (_, second, _) = load(dir.path(), &MemoryStore::new());
    assert_ne!(first, second);
    let mut contents: Vec<Vec<u8>> = backups_in(dir.path()).iter().map(|p| fs::read(p).unwrap()).collect();
    contents.sort();
    assert_eq!(contents, vec![b"[".to_vec(), b"{".to_vec()]);
}

#[test]
fn unknown_and_missing_fields_do_not_reset() {
    let dir = dir_with(
        br#"{"config_version":2,"target_role":"Kept","opacity":0.4,"llm_provider":"ollama","a_field_from_the_future":{"x":1}}"#,
    );
    let (mgr, outcome, notice) = load(dir.path(), &MemoryStore::new());
    assert_eq!(outcome, LoadOutcome::Loaded);
    assert_eq!(notice, None);
    let cfg = mgr.get_config();
    assert_eq!(cfg.target_role, "Kept");
    assert_eq!(cfg.opacity, 0.4);
    assert_eq!(cfg.llm_provider, "ollama");
    assert_eq!(cfg.font_size, AppConfig::default().font_size);
}

#[test]
fn wrong_typed_field_quarantines() {
    for content in [
        r#"{"config_version":2,"opacity":"high","target_role":"Mine"}"#,
        r#"{"opacity":"high","target_role":"Mine","openai_api_key":"sk-TESTONLY-KEEP"}"#,
    ] {
        let dir = dir_with(content.as_bytes());
        let secrets = MemoryStore::new();
        let (mgr, outcome, _) = load(dir.path(), &secrets);
        assert!(matches!(outcome, LoadOutcome::Quarantined { .. }), "{content}");
        assert_eq!(fs::read(&backups_in(dir.path())[0]).unwrap(), content.as_bytes());
        assert_eq!(mgr.get_config(), AppConfig::default());
        assert_eq!(secrets.get(KeyId::OpenAi), None, "nothing is imported from a file that failed to load");
    }
}

#[test]
fn failed_save_leaves_memory_unchanged() {
    let holder = TempDir::new().unwrap();
    let not_a_dir = holder.path().join("i-am-a-file");
    fs::write(&not_a_dir, b"x").unwrap();
    let (mgr, _, _) = ConfigManager::load(not_a_dir.clone(), &MemoryStore::new());
    let before = mgr.get_config();

    let mut changed = before.clone();
    changed.target_role = "must not stick".into();
    assert!(mgr.update_config(changed).is_err());

    assert_eq!(mgr.get_config(), before);
    assert_eq!(fs::read(&not_a_dir).unwrap(), b"x");
}

#[test]
fn read_only_file_fails_the_save_and_keeps_both_copies() {
    let mut original = AppConfig::default();
    original.target_role = "on disk".into();
    let text = serde_json::to_string(&original).unwrap();
    let dir = dir_with(text.as_bytes());
    let path = file_in(dir.path());
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&path, perms.clone()).unwrap();

    let (mgr, _, _) = load(dir.path(), &MemoryStore::new());
    let mut changed = mgr.get_config();
    changed.target_role = "must not stick".into();
    let result = mgr.update_config(changed);

    #[allow(clippy::permissions_set_readonly_false)]
    perms.set_readonly(false);
    fs::set_permissions(&path, perms).unwrap();

    assert!(result.is_err());
    assert_eq!(mgr.get_config(), original);
    assert_eq!(fs::read_to_string(&path).unwrap(), text);
    assert!(!dir.path().join(format!("{CONFIG_FILE}.tmp")).exists(), "no temp file may be left behind");
}

#[test]
fn save_is_atomic() {
    let dir = TempDir::new().unwrap();
    let (mgr, _, _) = load(dir.path(), &MemoryStore::new());
    let mut cfg = mgr.get_config();
    cfg.target_role = "Saved \u{1F511} role".into();
    cfg.code_models.insert("openai".into(), "o-code".into());
    cfg.config_version = 0;

    mgr.update_config(cfg.clone()).unwrap();

    assert!(!dir.path().join(format!("{CONFIG_FILE}.tmp")).exists());
    let on_disk: AppConfig = serde_json::from_str(&fs::read_to_string(file_in(dir.path())).unwrap()).unwrap();
    assert_eq!(on_disk.config_version, 2, "the version is stamped on every save");
    assert_eq!(on_disk.target_role, cfg.target_role);
    assert_eq!(on_disk, mgr.get_config());
    let (again, outcome, _) = load(dir.path(), &MemoryStore::new());
    assert_eq!(outcome, LoadOutcome::Loaded);
    assert_eq!(again.get_config(), on_disk);
}

#[test]
fn concurrent_saves_leave_a_whole_file() {
    let dir = TempDir::new().unwrap();
    let (mgr, _, _) = load(dir.path(), &MemoryStore::new());
    let mgr = std::sync::Arc::new(mgr);
    let handles: Vec<_> = (0..8)
        .map(|t| {
            let mgr = mgr.clone();
            std::thread::spawn(move || {
                for i in 0..25 {
                    let mut cfg = AppConfig::default();
                    cfg.target_role = format!("writer-{t}-{i}-{}", "p".repeat(2000));
                    mgr.update_config(cfg).unwrap();
                }
            })
        })
        .collect();
    for h in handles {
        h.join().unwrap();
    }
    let on_disk: AppConfig = serde_json::from_str(&fs::read_to_string(file_in(dir.path())).unwrap()).unwrap();
    assert_eq!(on_disk, mgr.get_config(), "disk and memory must agree after the last save");
    assert!(!dir.path().join(format!("{CONFIG_FILE}.tmp")).exists());
}

#[test]
fn key_fields_sent_by_an_old_frontend_are_never_written() {
    let dir = TempDir::new().unwrap();
    let (mgr, _, _) = load(dir.path(), &MemoryStore::new());
    let payload = r#"{"config_version":2,"llm_provider":"openai","openai_api_key":"sk-TESTONLY-FROM-UI","custom_api_key":"c-TESTONLY-FROM-UI"}"#;
    let from_ui: AppConfig = serde_json::from_str(payload).unwrap();

    mgr.update_config(from_ui).unwrap();

    let saved = fs::read_to_string(file_in(dir.path())).unwrap();
    assert!(!saved.contains("TESTONLY"), "{saved}");
    assert!(!saved.contains("_api_key"), "{saved}");
}

#[test]
fn notice_is_returned_once() {
    let dir = dir_with(b"{");
    let (mgr, _, notice) = load(dir.path(), &MemoryStore::new());
    assert!(notice.is_some());
    assert_eq!(mgr.take_notice(), notice);
    assert_eq!(mgr.take_notice(), None);
}

#[test]
fn dev_env_keys_are_held_in_memory_only() {
    let dir = TempDir::new().unwrap();
    let secrets = MemoryStore::failing(); // proves nothing is persisted through `set`
    secrets.remember(KeyId::OpenAi, "sk-ALREADY-SAVED");
    let env = "# comment\nOPENAI_API_KEY=sk-TESTONLY-ENV\nGROQ_API_KEY=\"gsk_TESTONLY-ENV\"\nCUSTOM_ENDPOINT = http://localhost:1234/v1 \nGEMINI_MODEL=from-env\nSMART_MODEL_ROUTING=true\nLLM_PROVIDER=ollama\nBROKEN LINE\n=novalue\n";

    let (mgr, outcome, _) = ConfigManager::load_with_env(dir.path().to_path_buf(), &secrets, Some(env));

    assert_eq!(outcome, LoadOutcome::Fresh);
    assert_eq!(secrets.get(KeyId::OpenAi).as_deref(), Some("sk-ALREADY-SAVED"), "a saved key wins");
    assert_eq!(secrets.get(KeyId::Groq).as_deref(), Some("gsk_TESTONLY-ENV"));
    let cfg = mgr.get_config();
    assert_eq!(cfg.custom_endpoint, "http://localhost:1234/v1", "empty settings are filled");
    assert_eq!(cfg.gemini_model, AppConfig::default().gemini_model, "chosen settings are not replaced");
    assert_eq!(cfg.llm_provider, AppConfig::default().llm_provider);
    assert!(!cfg.smart_model_routing);

    mgr.update_config(cfg).unwrap();
    assert!(!fs::read_to_string(file_in(dir.path())).unwrap().contains("TESTONLY"));
}

/// The frontend compares its own defaults with this file, so the two cannot drift apart.
#[test]
fn default_config_fixture_matches_the_code() {
    let fixture: serde_json::Value = serde_json::from_str(include_str!("../tests/fixtures/default_config.json")).unwrap();
    assert_eq!(fixture, serde_json::to_value(AppConfig::default()).unwrap());
}

#[test]
fn debug_builds_keep_their_settings_and_keys_apart_from_the_installed_app() {
    let base = PathBuf::from("C:/Users/x/AppData/Roaming/com.ghostcue.app");
    assert_eq!(settings_dir(base.clone(), false), base);
    assert_eq!(settings_dir(base.clone(), true), base.join("dev"));
    assert_eq!(crate::secrets::account_prefix(false), "");
    assert_eq!(crate::secrets::account_prefix(true), "dev-");
}

/// Dry run against a copy of a real old settings file. Nothing is written outside a temp
/// directory and no key is printed. Run with:
/// `$env:GHOSTCUE_DRY_RUN_CONFIG = "<path>"; cargo test dry_run_on_a_copy -- --ignored --nocapture`
#[test]
#[ignore]
fn dry_run_on_a_copy_of_a_real_settings_file() {
    let source = std::env::var("GHOSTCUE_DRY_RUN_CONFIG").expect("set GHOSTCUE_DRY_RUN_CONFIG");
    let original = fs::read(&source).unwrap();
    let raw: serde_json::Value = serde_json::from_slice(&original).unwrap();
    let dir = dir_with(&original);
    let secrets = MemoryStore::new();

    let (mgr, outcome, notice) = load(dir.path(), &secrets);

    let stored: Vec<&str> = KeyId::all().into_iter().filter(|id| secrets.get(*id).is_some()).map(|id| id.slug()).collect();
    println!("outcome: {outcome:?}");
    println!("keys now in the store: {stored:?}");
    println!("notice: {notice:?}");
    let cfg = mgr.get_config();
    println!("provider: {}, stt: {}, routing: {}", cfg.llm_provider, cfg.stt_provider, cfg.smart_model_routing);
    println!("custom endpoint set: {}, custom model set: {}", !cfg.custom_endpoint.is_empty(), !cfg.custom_model.is_empty());
    assert_eq!(outcome, LoadOutcome::Migrated);
    let saved = fs::read_to_string(file_in(dir.path())).unwrap();
    assert!(!saved.contains("_api_key"));
    for key in key_strings(&raw) {
        assert!(!saved.contains(&key), "a key is still in the migrated file");
        assert!(notice.as_deref().map_or(true, |n| !n.contains(&key)), "a key is in the notice");
    }
    assert_eq!(fs::read(&source).unwrap(), original, "the real file must be untouched");
}
