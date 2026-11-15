# Provider Reliability and Key Storage Implementation Plan (plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every answer provider uses only its own key, endpoint and model; keys live in Windows Credential Manager; saved settings survive upgrades; a provider can be tested and its models listed before a session.

**Architecture:** A static provider table plus a single `resolve()` function replaces the per-provider branches in the orchestrator. Secrets move behind a `SecretStore` trait (Credential Manager in the app, in-memory in tests) and leave `AppConfig` entirely. HTTP clients stop taking `AppHandle` and take a base URL, timeouts and a token callback so they can be tested against a local mock server.

**Tech Stack:** Rust (Tauri 2, reqwest, tokio), `keyring` crate, `wiremock` (dev), React 19 + TypeScript, Vitest + Testing Library (dev).

**Spec:** `docs/superpowers/specs/2026-11-15-setup-reliability-and-ui-flow-design.md` (findings 1-12, 17, 18; sections "Provider layer" and "Testing"). Plan 2 covers the UI (phases 3-5) and is written after the mockups are approved.

## Global Constraints

- Branch: `development`. Never work on `main`.
- No `git add`, `git commit` or `git push`. Each task ends with a checkpoint that lists changed files and test output. The owner commits.
- Never hand-edit `package-lock.json` or `Cargo.lock`; they change only through `npm install` / `cargo`.
- Every fix starts with a test that is run and shown failing against the current code, then passing. Report both runs. Never weaken an assertion, add a skip, or widen a timeout to get green.
- Mock only the HTTP boundary and the secret store. Never mock the module under test.
- Target platform: Windows 10/11 x64 only.
- Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml <filter>`. Frontend tests: `npx vitest run <file>`. Keep runs file-scoped.
- User-facing strings: plain sentences, no emoji, no em dashes, the provider's real name (never "OpenAI" for another provider).
- No cross-provider fallback of keys, endpoints or models anywhere.
- No secret is ever written to the config file, a log line, or a value returned to the frontend.
- Do not modify `audio/`, `window.rs`, `stealth.rs`, `screen.rs`, `project_scanner.rs`, `llm/prompt.rs`.
- Before touching Anthropic request code, load the `claude-api` skill and follow it for endpoint, headers and model ids.
- Model ids in this plan are defaults only. Do not add or correct model lists from memory; lists come from `list_provider_models`.

## Review Focus

Conditions the spec implies that are most likely to bite a user, each pinned by a test in the named task:

1. A key pasted with surrounding spaces or a trailing newline is stored and sent trimmed (Task 3, `set_trims_whitespace_and_newlines`).
2. A custom endpoint entered with a trailing slash, with `/chat/completions` already appended, or with `/v1/models`-style suffixes still produces the right request URL; one without `http://` or `https://` is rejected with a clear message before any request (Task 5, `custom_endpoint_normalisation`).
3. Credential Manager unavailable or denying access: the key is not written anywhere else, the save fails with a message, and already-loaded keys keep working for the session (Task 3, `store_failure_does_not_fall_back`; Task 4, `migration_keeps_file_when_store_fails`).
4. Ollama reachable but with zero models installed is reported as "no models installed" with the pull command, not as success and not as unreachable (Task 9, `ollama_no_models_is_its_own_result`).
5. The config file is read-only or the disk is full on save: the command returns an error and the in-memory config is not changed (Task 4, `failed_save_leaves_memory_unchanged`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src-tauri/src/secrets.rs` (new) | `KeyId`, `SecretStore` trait, `KeyringStore`, `MemoryStore`, key commands |
| `src-tauri/src/config.rs` (rewrite) | `AppConfig` without secrets, defaults, atomic load/save, config commands |
| `src-tauri/src/config_migrate.rs` (new) | v1 JSON to v2 `AppConfig` plus extracted keys; corrupt-file quarantine |
| `src-tauri/src/llm/provider.rs` (new) | `ProviderId`, `ProviderDef` table, `TaskKind`, `resolve()` |
| `src-tauri/src/llm/error.rs` (new) | `LlmErrorKind`, `LlmFailure`, HTTP status/body classification |
| `src-tauri/src/llm/http.rs` (new) | `HttpTimeouts`, shared client builder, line-buffered stream reader |
| `src-tauri/src/llm/openai.rs`, `gemini.rs`, `ollama.rs` (rewrite) | One wire format each; no `AppHandle` |
| `src-tauri/src/llm/discovery.rs` (new) | `test_provider`, `list_models`, their commands |
| `src-tauri/src/llm/orchestrator.rs` (modify) | Resolve, dispatch by wire, emit events |
| `src-tauri/src/stt/engine.rs` (modify lines 100-170) | Read STT keys from `SecretStore` |
| `src-tauri/tests/fixtures/config_v1_*.json` (new) | Old-shape config fixtures |
| `src/services/tauriApi.ts`, `src/types/config.ts` (modify) | New commands; key fields removed |
| `src/components/settings/SecretField.tsx` (new, interim) | Saved / Replace / Remove key control |
| `vitest.config.ts`, `src/test/setup.ts` (new) | Frontend test harness |

---

**Execution order:** 1, 5, 3, 4, 2, 6, 7, 8, 9, 10, 11, 12. Task numbers follow the reading order of the design; the order above is the dependency order (errors, then secrets, then config, then resolution). The crate must compile and its existing tests pass at every checkpoint.

### Task 1: Test harness and baseline

**Files:**
- Modify: `src-tauri/Cargo.toml`, `package.json`
- Create: `vitest.config.ts`, `src/test/setup.ts`, `src/test/smoke.test.ts`, `src-tauri/src/llm/http.rs`

**Interfaces:**
- Produces: `npm test` script (`vitest run`); `[dev-dependencies] wiremock = "0.6"`, `tempfile = "3"`; `crate::llm::http::HttpTimeouts { pub connect: Duration, pub read: Duration }` with `HttpTimeouts::cloud()` = 10s / 60s and `HttpTimeouts::local()` = 5s / 180s; `pub fn build_client(t: HttpTimeouts) -> reqwest::Client`.

- [ ] **Step 1:** Run `cargo test --manifest-path src-tauri/Cargo.toml` and record the result. If the crate does not compile for tests, stop and report; do not work around it.
- [ ] **Step 2:** Add the two Rust dev-dependencies with `cargo add --dev`. Check current `wiremock` and `tempfile` versions on docs.rs first and use the latest compatible release.
- [ ] **Step 3:** Write `http.rs` with a test `timeouts_have_spec_values` asserting the four durations above. Run: fails (module missing), then passes.
- [ ] **Step 4:** `npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`. Add `"test": "vitest run"` to `package.json` scripts.
- [ ] **Step 5:** `vitest.config.ts`: environment `jsdom`, `setupFiles: ["src/test/setup.ts"]`, `globals: true`, reuse the React plugin from `vite.config.ts`. `setup.ts` imports `@testing-library/jest-dom/vitest`.
- [ ] **Step 6:** `smoke.test.ts`: `expect(isTauri()).toBe(false)` importing from `src/services/tauriApi`. Run `npx vitest run src/test/smoke.test.ts`: PASS.
- [ ] **Step 7:** Checkpoint: list changed files and both test outputs.

### Task 2: Provider table and resolution

**Files:**
- Create: `src-tauri/src/llm/provider.rs`
- Modify: `src-tauri/src/llm/mod.rs` (add `pub mod provider;`)

**Interfaces:**
- Consumes: `crate::secrets::{KeyId, SecretStore, MemoryStore}` (Task 3), `LlmFailure` and `LlmErrorKind` (Task 5), `AppConfig` with `groq_model` and `code_models` (Task 4).
- Produces:

```rust
pub enum ProviderId { OpenRouter, Gemini, OpenAi, Anthropic, DeepSeek, Groq, Ollama, Custom }
pub enum Wire { OpenAiChat, Gemini, Ollama }
pub enum TaskKind { Chat, Code }           // "code" | "vision" | "screen" actions map to Code
pub struct ProviderDef {
    pub id: ProviderId, pub slug: &'static str, pub display_name: &'static str,
    pub wire: Wire, pub base_url: &'static str,   // "" for Ollama and Custom (from config)
    pub key: Option<KeyId>, pub key_required: bool, pub default_model: &'static str,
}
pub struct ResolvedProvider { pub def: &'static ProviderDef, pub base_url: String, pub api_key: Option<String>, pub model: String }
impl ProviderId { pub fn from_slug(s: &str) -> Option<ProviderId>; }
pub fn def(id: ProviderId) -> &'static ProviderDef;
pub fn all() -> &'static [ProviderDef];
pub fn resolve(cfg: &AppConfig, secrets: &dyn SecretStore, task: TaskKind) -> Result<ResolvedProvider, LlmFailure>;
pub fn normalise_base_url(raw: &str) -> Result<String, LlmFailure>;
```

Table values:

| slug | display_name | wire | base_url | key | key_required | default_model |
|---|---|---|---|---|---|---|
| openrouter | OpenRouter | OpenAiChat | `https://openrouter.ai/api/v1` | OpenRouter | true | `deepseek/deepseek-chat` |
| gemini | Google Gemini | Gemini | `https://generativelanguage.googleapis.com/v1beta` | Gemini | true | `gemini-2.5-flash` |
| openai | OpenAI | OpenAiChat | `https://api.openai.com/v1` | OpenAi | true | `gpt-4o` |
| anthropic | Anthropic | OpenAiChat | per `claude-api` skill | Anthropic | true | `claude-sonnet-5-5` |
| deepseek | DeepSeek | OpenAiChat | `https://api.deepseek.com/v1` | DeepSeek | true | `deepseek-chat` |
| groq | Groq | OpenAiChat | `https://api.groq.com/openai/v1` | Groq | true | `llama-3.3-70b-versatile` |
| ollama | Ollama | Ollama | from `cfg.ollama_endpoint` | none | false | `""` |
| custom | Custom endpoint | OpenAiChat | from `cfg.custom_endpoint` | Custom | false | `""` |

Resolution rules: model = the provider's own `*_model` field, else `default_model`; if `cfg.smart_model_routing` and `task == Code` and `cfg.code_models[slug]` is non-empty, use that instead; an empty resolved model is `LlmErrorKind::ModelNotChosen`. OpenAI honours `cfg.openai_base_url` when non-empty. Unknown `llm_provider` is `LlmErrorKind::UnknownProvider` (never falls through to Custom). Missing key with `key_required` is `MissingKey`.

- [ ] **Step 1:** Write failing tests in `provider.rs`:
  - `each_provider_uses_only_its_own_key`: store holds a distinct key for every `KeyId`; for each provider assert `api_key` equals its own key.
  - `no_fallback_when_own_key_missing`: store holds every key except the selected provider's; assert `MissingKey` for each key-required provider.
  - `anthropic_ignores_custom_endpoint`: `custom_endpoint = "https://openrouter.ai/api/v1"`, provider anthropic; assert `base_url` is the Anthropic one.
  - `groq_uses_groq_model_not_openai_model`: `openai_model = "gpt-4o"`, `groq_model = "x"`; assert `"x"`.
  - `routing_off_never_changes_model` and `routing_on_without_code_model_never_changes_model`: for every provider and both `TaskKind`s the model equals the chosen model.
  - `routing_on_uses_code_model_for_code_only`.
  - `ollama_with_no_model_is_model_not_chosen`.
  - `unknown_provider_is_an_error`: `llm_provider = "nope"` and `""`.
  - `custom_endpoint_normalisation` (Review Focus 2): `"http://localhost:1234/v1/"`, `"http://localhost:1234/v1/chat/completions"` both normalise to `"http://localhost:1234/v1"`; `"localhost:1234"` and `""` are `InvalidEndpoint`.
  - `custom_without_key_resolves_with_none`.
- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml llm::provider`: FAIL (unresolved items).
- [ ] **Step 3:** Implement the table and functions.
- [ ] **Step 4:** Run again: PASS.
- [ ] **Step 5:** Checkpoint.

### Task 3: Secret store

**Files:**
- Create: `src-tauri/src/secrets.rs`
- Modify: `src-tauri/Cargo.toml` (`keyring`), `src-tauri/src/lib.rs` (module, commands), `src-tauri/src/state.rs` (`pub secrets: Arc<dyn SecretStore>`)

**Interfaces:**
- Produces:

```rust
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum KeyId { OpenRouter, Gemini, OpenAi, Anthropic, DeepSeek, Groq, Custom, Deepgram }
impl KeyId { pub fn slug(self) -> &'static str; pub fn from_slug(s: &str) -> Option<KeyId>; pub fn all() -> [KeyId; 8]; }
pub trait SecretStore: Send + Sync {
    fn get(&self, id: KeyId) -> Option<String>;                 // served from an in-memory cache
    fn set(&self, id: KeyId, value: &str) -> Result<(), String>; // trims; empty after trim is an error
    fn clear(&self, id: KeyId) -> Result<(), String>;
}
pub struct MemoryStore;   // tests and debug .env overlay; `MemoryStore::failing()` errors on set/clear
pub struct KeyringStore;  // service "GhostCue", account = KeyId::slug(); loads all eight into the cache at construction
#[tauri::command] pub async fn get_key_status(state) -> Result<BTreeMap<String, bool>, String>;
#[tauri::command] pub async fn set_provider_key(key_id: String, value: String, state) -> Result<(), String>;
#[tauri::command] pub async fn clear_provider_key(key_id: String, state) -> Result<(), String>;
```

Slugs: `openrouter, gemini, openai, anthropic, deepseek, groq, custom, deepgram`.

- [ ] **Step 1:** Read the `keyring` crate docs on docs.rs for the current major version; enable the Windows native credential feature it names. Add with `cargo add`.
- [ ] **Step 2:** Failing tests (against `MemoryStore` and a generic helper run over both stores where possible):
  - `set_then_get_roundtrip`, `clear_removes`, `get_missing_is_none`.
  - `set_trims_whitespace_and_newlines` (Review Focus 1): `"  sk-abc\r\n"` reads back `"sk-abc"`.
  - `set_empty_or_whitespace_is_error` and leaves the previous value in place.
  - `unicode_and_4kb_values_roundtrip`.
  - `store_failure_does_not_fall_back` (Review Focus 3): `MemoryStore::failing()`; `set` returns `Err`, `get` still returns the value loaded before the failure.
  - `unknown_slug_is_rejected` for `KeyId::from_slug("nope")`.
  - `#[ignore] keyring_roundtrip_real_store`: set, get, clear against Credential Manager using account `ghostcue-test-<uuid>`; always clears in a guard.
- [ ] **Step 3:** Run: FAIL. Implement. Run: PASS. Run the ignored test once with `-- --ignored` and report its output.
- [ ] **Step 4:** Register the three commands in `lib.rs` `generate_handler!`. `AppState::new` constructs `KeyringStore`.
- [ ] **Step 5:** Checkpoint.

### Task 4: Config without secrets, migration, safe load and save

**Files:**
- Rewrite: `src-tauri/src/config.rs`
- Create: `src-tauri/src/config_migrate.rs`, `src-tauri/tests/fixtures/config_v1_openrouter_bridged.json`, `config_v1_groq_in_openai.json`, `config_v1_minimal.json`, `config_v1_all_keys.json`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `SecretStore`, `KeyId`.
- Produces:
  - `AppConfig`: `#[serde(default)]` on the struct; all eight `*_api_key` fields removed; added `config_version: u32` (current `2`), `groq_model: String`, `code_models: BTreeMap<String, String>`; `smart_model_routing` default `false`; `get_effective_model` deleted; `Default` no longer reads the environment.
  - `pub struct Migrated { pub config: AppConfig, pub keys: Vec<(KeyId, String)>, pub notes: Vec<String> }`
  - `pub fn migrate_v1(raw: &serde_json::Value) -> Migrated`
  - `pub enum LoadOutcome { Fresh, Loaded, Migrated, Quarantined { backup: PathBuf } }`
  - `ConfigManager::load(app_dir: PathBuf, secrets: &dyn SecretStore) -> (ConfigManager, LoadOutcome, Option<String> /* notice */)`
  - `ConfigManager::update_config(&self, new: AppConfig) -> Result<(), String>` writes to `ghostcue_config.json.tmp` then renames; memory is updated only after the write succeeds.
  - `#[tauri::command] get_config_notice(state) -> Result<Option<String>, String>` (returns the notice once, then `None`).
  - Debug builds only: `apply_dev_env(cfg: &mut AppConfig, overlay: &MemoryStore)` reads `concat!(env!("CARGO_MANIFEST_DIR"), "/../.env")`, fills empty non-secret fields and puts keys in the overlay only. `sync_to_dotenv` and every `env::set_var` are deleted.

Migration rules, in order:
1. Collect the eight key fields from the raw JSON (trimmed, non-empty).
2. If `custom_api_key == openrouter_api_key` and `custom_endpoint == "https://openrouter.ai/api/v1"`: drop the custom key, clear `custom_endpoint`, and clear `custom_model` if it equals `openrouter_model`.
3. If `custom_api_key == deepseek_api_key` and `custom_endpoint` does not contain `deepseek.com`: drop the custom key.
4. If `openai_api_key` starts with `gsk_`: move it to Groq when Groq is empty, otherwise drop it; and if `llm_provider == "groq"`, set `groq_model = openai_model` and `openai_model = "gpt-4o"`.
5. `smart_model_routing = false`; `config_version = 2`.
6. Each rule that fires appends one plain sentence to `notes`.

Load: on v1, call `secrets.set` for every key, read each back and compare; only if all match, save the v2 file (which has no keys). If any write fails, leave the v1 file byte-for-byte untouched, run this session from the migrated config with the keys in a `MemoryStore` overlay, and set the notice. On a parse failure copy the file to `ghostcue_config.bad-<unix_seconds>.json`, start from defaults, set the notice.

- [ ] **Step 1:** Create the four fixtures from the current field set (`config.rs` at commit `ff1139d`). Use obviously fake keys such as `sk-or-v1-TESTONLY`.
- [ ] **Step 2:** Failing tests:
  - `v1_openrouter_bridge_is_unmerged`, `v1_groq_key_moves_out_of_openai`, `v1_all_keys_extracted_exactly` (eight distinct keys in, eight distinct pairs out), `v1_minimal_fills_defaults`.
  - `migration_never_loses_a_key`: for each fixture, every distinct non-empty key string in the input appears in `keys` or the matching rule's note.
  - `migrated_file_contains_no_key_strings`: after `load`, the saved file's text contains none of the fixture key strings and no `_api_key` field.
  - `migration_keeps_file_when_store_fails` (Review Focus 3): `MemoryStore::failing()`; file bytes unchanged, outcome `Migrated`, notice set, resolved key still available this session.
  - `corrupt_file_is_quarantined_not_overwritten`: inputs `""`, `"{"`, `"[]"`, `"null"`, 1 MB of `x`; a `.bad-` copy with identical bytes exists.
  - `unknown_and_missing_fields_do_not_reset` : v2 file with an extra field and a missing field loads with other values intact.
  - `wrong_typed_field_quarantines`: `"opacity": "high"`.
  - `failed_save_leaves_memory_unchanged` (Review Focus 5): point the manager at a directory path that is a file; `update_config` is `Err` and `get_config()` equals the previous value.
  - `save_is_atomic`: after a successful save no `.tmp` file remains and the file parses.
  - `smart_routing_env_no_longer_overrides`: set process env `SMART_MODEL_ROUTING=true`; loaded value is unchanged.
- [ ] **Step 3:** Run `cargo test --manifest-path src-tauri/Cargo.toml config`: FAIL. Implement. PASS.
- [ ] **Step 4:** Update `lib.rs` setup to use `ConfigManager::load` and register `get_config_notice`. `save_app_config` keeps its name and argument.
- [ ] **Step 5:** Keep the crate compiling: in the existing `llm/orchestrator.rs` and `stt/engine.rs`, replace each `config.<x>_api_key` read with `secrets.get(KeyId::<X>).unwrap_or_default()` for that provider's own key only (delete the fallback chains at `orchestrator.rs:119-140`), thread `Arc<dyn SecretStore>` through `generate_ai_suggestion` and the STT worker closure, and replace `get_effective_model` calls with the provider's own model field. These are temporary call-site edits; Tasks 2 and 10 replace them. `cargo test --manifest-path src-tauri/Cargo.toml config` must still pass.
- [ ] **Step 6:** Checkpoint.

### Task 5: Error model and stream reader

**Files:**
- Create: `src-tauri/src/llm/error.rs`
- Modify: `src-tauri/src/llm/http.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Serialize, Clone, Copy, PartialEq, Debug)] #[serde(rename_all = "snake_case")]
pub enum LlmErrorKind { MissingKey, BadKey, NoCredit, ModelNotFound, ModelNotChosen, RateLimited, Unreachable, Timeout,
    EmptyResponse, InvalidEndpoint, UnknownProvider, ProviderError, Cancelled }
#[derive(Serialize, Clone, Debug)]
pub struct LlmFailure { pub provider: String, pub kind: LlmErrorKind, pub message: String, pub retriable: bool }
pub fn classify_http(provider: &str, status: u16, body: &str) -> LlmFailure;
pub fn classify_transport(provider: &str, err: &reqwest::Error) -> LlmFailure;
pub struct LineReader;  // push(&[u8]) -> Vec<String>; finish() -> Option<String>; splits on \n, handles \r\n and a split multi-byte UTF-8 sequence across chunks
```

Classification: 401 and 403 are `BadKey`; 402 or a body containing `insufficient_quota`, `insufficient credits`, `exceeded your current quota` is `NoCredit`; 404 with a body mentioning the model, or Ollama's `model '<x>' not found`, is `ModelNotFound`; 429 is `RateLimited` (retriable); 5xx and 529 are `ProviderError` (retriable); connect errors are `Unreachable`; timeouts are `Timeout`. `message` starts with the provider display name and is at most 300 characters; a non-JSON or HTML body is summarised as the status code, never dumped.

- [ ] **Step 1:** Failing table-driven tests `classify_http_table` covering each row above plus: empty body, HTML body, 50 KB body (message length <= 300), JSON error with `message` nested under `error`, Gemini's `error.status` shape. `message_names_the_real_provider` for `"Groq"`.
- [ ] **Step 2:** Failing `LineReader` tests: `splits_across_chunks`, `crlf`, `utf8_split_mid_character` (a 4-byte emoji split 2+2 yields the intact character), `trailing_line_without_newline_is_returned_by_finish`.
- [ ] **Step 3:** Run: FAIL. Implement. PASS. Checkpoint.

### Task 6: OpenAI-compatible client

**Files:**
- Rewrite: `src-tauri/src/llm/openai.rs`

**Interfaces:**
- Consumes: `ResolvedProvider`, `HttpTimeouts`, `LineReader`, `classify_*`.
- Produces:

```rust
pub struct ChatRequest<'a> { pub system: &'a str, pub user: &'a str, pub image_jpeg_b64: Option<&'a str>, pub max_tokens: u32 }
pub type OnToken<'a> = &'a (dyn Fn(&str) + Send + Sync);
pub async fn stream_chat(p: &ResolvedProvider, req: ChatRequest<'_>, timeouts: HttpTimeouts,
    abort: Arc<AtomicBool>, on_token: OnToken<'_>) -> Result<String, LlmFailure>;
```

Decisions: `Authorization` header is sent only when `api_key` is `Some`. OpenRouter keeps its two attribution headers. Up to 3 retries on `retriable` failures, honouring `Retry-After` clamped to 800-6000 ms, abort checked every 100 ms. The `o1`/`o3` special-casing and the silent swap to `gpt-4o` are removed; instead, if the provider answers 400 naming `max_tokens` or `temperature` as unsupported, retry once with `max_completion_tokens` and no temperature. A stream that ends with no content is `EmptyResponse`. A mid-stream drop after content returns the partial text. Cancel returns `Cancelled`.

- [ ] **Step 1:** Failing tests against `wiremock` (base URL = mock server URI):
  `streams_tokens_in_order`, `no_auth_header_when_key_is_none`, `bearer_header_is_trimmed_key`, `bad_key_401`, `no_credit_402`, `model_not_found_404`, `rate_limited_then_success` (two 429s then 200; asserts three requests), `gives_up_after_three_retries`, `server_error_html_body_is_summarised`, `empty_stream_is_empty_response`, `inline_error_event_before_content_is_error`, `drop_after_content_returns_partial`, `cancel_during_retry_wait_returns_cancelled_within_300ms`, `cancel_mid_stream`, `read_timeout_is_timeout` (mock delays past a 200 ms read timeout), `unsupported_max_tokens_retries_with_max_completion_tokens`, `image_is_sent_as_image_url_part`, `unreachable_port_is_unreachable`.
- [ ] **Step 2:** Run `cargo test --manifest-path src-tauri/Cargo.toml llm::openai`: FAIL. Implement. PASS. Checkpoint.

### Task 7: Gemini client

**Files:**
- Rewrite: `src-tauri/src/llm/gemini.rs`

**Interfaces:**
- Produces: `pub async fn stream_chat(p: &ResolvedProvider, req: ChatRequest<'_>, timeouts, abort, on_token) -> Result<String, LlmFailure>` (same shapes as Task 6).

Decisions: URL `{base_url}/models/{model}:streamGenerateContent?alt=sse`; key in the `x-goog-api-key` header, never in the URL. `maxOutputTokens` from `req.max_tokens`. A response whose candidates carry a `finishReason` of `SAFETY` or `MAX_TOKENS` with no text is `EmptyResponse` with a message naming the reason.

- [ ] **Step 1:** Failing tests: `key_is_in_header_not_url` (assert the received request URL has no `key=`), `streams_tokens`, `bad_key_400_api_key_invalid_is_bad_key`, `model_not_found_404`, `empty_candidates_is_empty_response`, `finish_reason_max_tokens_without_text`, `cancel_mid_stream`, `timeout`.
- [ ] **Step 2:** Run: FAIL. Implement. PASS. Checkpoint.

### Task 8: Ollama client

**Files:**
- Rewrite: `src-tauri/src/llm/ollama.rs`

**Interfaces:**
- Produces:

```rust
pub async fn stream_chat(p: &ResolvedProvider, req: ChatRequest<'_>, supports_vision: bool, timeouts, abort, on_token) -> Result<String, LlmFailure>;
pub async fn installed_models(base_url: &str, timeouts: HttpTimeouts) -> Result<Vec<String>, LlmFailure>;      // GET /api/tags
pub async fn model_supports_vision(base_url: &str, model: &str, timeouts: HttpTimeouts) -> Result<bool, LlmFailure>; // POST /api/show, "capabilities" contains "vision"
```

Decisions: use `POST /api/chat` with `messages` (system, user) and `stream: true`. A stream line with an `error` field is an error (`ModelNotFound` when it matches `not found`, with message `Ollama does not have "<model>" installed. Run: ollama pull <model>`). An image is sent only when `supports_vision`; otherwise the request proceeds without it and the returned text is unchanged (the orchestrator reports the omission). Empty reply is `EmptyResponse`. Timeouts `HttpTimeouts::local()`.

- [ ] **Step 1:** Failing tests: `streams_tokens`, `error_line_is_surfaced`, `model_not_installed_message_has_pull_command`, `empty_reply_is_error`, `server_down_is_unreachable_within_connect_timeout`, `image_omitted_when_not_vision`, `image_sent_when_vision`, `cancel_mid_stream`, `installed_models_parses_names`, `installed_models_empty_list_is_ok_empty`, `model_supports_vision_true_and_false`, `show_on_older_server_without_capabilities_is_false`.
- [ ] **Step 2:** Run: FAIL. Implement. PASS. Checkpoint.

### Task 9: Provider test and model listing

**Files:**
- Create: `src-tauri/src/llm/discovery.rs`
- Modify: `src-tauri/src/llm/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces:

```rust
#[derive(Serialize)] pub struct ProviderTestResult { pub ok: bool, pub kind: Option<LlmErrorKind>, pub message: String, pub model: String, pub latency_ms: u64 }
#[derive(Serialize)] pub struct ModelInfo { pub id: String, pub vision: Option<bool> }
pub async fn test_provider(cfg: &AppConfig, secrets: &dyn SecretStore, slug: &str) -> ProviderTestResult;
pub async fn list_models(cfg: &AppConfig, secrets: &dyn SecretStore, slug: &str) -> Result<Vec<ModelInfo>, LlmFailure>;
#[tauri::command] pub async fn test_llm_provider(provider: String, state) -> Result<ProviderTestResult, String>;
#[tauri::command] pub async fn list_provider_models(provider: String, state) -> Result<Vec<ModelInfo>, String>;
```

Decisions: `test_provider` resolves the named provider (not necessarily the active one) and sends a real streaming request, system `"Reply with the single word OK."`, user `"OK"`, `max_tokens` 16, overall deadline 20 s (60 s for Ollama). `ok` is true only when at least one token arrived. For Ollama it first calls `installed_models`: zero models gives `ok: false`, `kind: ModelNotFound`, message `Ollama is running but has no models installed. Run: ollama pull <name>`. Listing: OpenAI-wire providers `GET {base}/models` reading `data[].id`; Gemini `GET {base}/models` keeping entries whose `supportedGenerationMethods` contains `generateContent`, id with the `models/` prefix removed; Ollama `installed_models`. Lists are sorted by id; no result is cached.

- [ ] **Step 1:** Failing tests (wiremock): `test_ok_when_token_arrives`, `test_bad_key_reports_bad_key`, `test_reports_model_and_latency`, `test_unknown_slug_is_unknown_provider`, `test_missing_key_makes_no_request` (mock receives zero requests), `ollama_no_models_is_its_own_result` (Review Focus 4), `ollama_down_is_unreachable`, `list_openai_wire`, `list_gemini_filters_and_strips_prefix`, `list_ollama`, `list_with_bad_key_is_bad_key`, `list_with_malformed_json_is_provider_error`, `two_concurrent_tests_do_not_interfere`.
- [ ] **Step 2:** Run: FAIL. Implement. PASS. Register both commands. Checkpoint.

### Task 10: Orchestrator and STT call sites

**Files:**
- Modify: `src-tauri/src/llm/orchestrator.rs`, `src-tauri/src/llm/mod.rs`, `src-tauri/src/stt/engine.rs:100-170`

**Interfaces:**
- Consumes: `resolve`, the three clients, `SecretStore`.
- Produces: `generate_suggestion` gains `secrets: Arc<dyn SecretStore>`; `llm-start` payload unchanged in shape (`smart_routed` is true only when a code model was actually substituted); `llm-error` payload becomes `{ error: String, kind: LlmErrorKind, provider: String, action: String }`; new `llm-notice` event `{ message }` emitted when an image was dropped for a non-vision Ollama model.

Decisions: dispatch on `def.wire`. `max_tokens` 4096. The STT branch chain keeps its current order and conditions but reads each key with `secrets.get(KeyId::…)`; no behaviour change beyond the key source.

- [ ] **Step 1:** Extract the provider dispatch into `async fn run(p: &ResolvedProvider, req, abort, on_token, vision: bool) -> Result<String, LlmFailure>` so it is testable without `AppHandle`. Failing tests: `dispatches_by_wire` (three mock servers, one request each to the right one), `new_generation_cancels_previous`, `cancelled_generation_emits_no_error` (via a recording callback).
- [ ] **Step 2:** Run: FAIL. Implement. PASS.
- [ ] **Step 3:** `cargo build --manifest-path src-tauri/Cargo.toml` with zero warnings from the touched files. `grep -rn "_api_key" src-tauri/src` shows no `config.` readers.
- [ ] **Step 4:** Checkpoint.

### Task 11: Frontend types, API and interim key fields

**Files:**
- Modify: `src/types/config.ts`, `src/types/llm.ts`, `src/services/tauriApi.ts`, `src/components/settings/ModelSettings.tsx` (key inputs at lines 525, 577, 594, 688, 744, 798, 852, 962, 1043, 1172 and the Groq model block 860-894), `src/components/settings/SettingsModal.tsx:60-64`
- Create: `src/components/settings/SecretField.tsx`, `src/components/settings/SecretField.test.tsx`, `src/services/tauriApi.test.ts`

**Interfaces:**
- Consumes: commands `get_key_status`, `set_provider_key`, `clear_provider_key`, `test_llm_provider`, `list_provider_models`, `get_config_notice`.
- Produces:

```ts
export type KeyId = "openrouter" | "gemini" | "openai" | "anthropic" | "deepseek" | "groq" | "custom" | "deepgram";
TauriApi.getKeyStatus(): Promise<Record<KeyId, boolean>>
TauriApi.setProviderKey(keyId: KeyId, value: string): Promise<void>
TauriApi.clearProviderKey(keyId: KeyId): Promise<void>
TauriApi.testLlmProvider(provider: string): Promise<ProviderTestResult>
TauriApi.listProviderModels(provider: string): Promise<ModelInfo[]>
TauriApi.getConfigNotice(): Promise<string | null>
<SecretField keyId={KeyId} label={string} placeholder={string} />
```

Decisions: `AppConfig` in TS loses every `*_api_key` field and gains `config_version`, `groq_model`, `code_models`; `DEFAULT_CONFIG` matches the Rust defaults exactly. Outside Tauri the key functions use an in-memory map (never `localStorage`). `SecretField` shows "Saved" with Replace and Remove when the status is true, otherwise an empty password input with Save; the value is cleared from component state after a successful save. Save is disabled while a save is in flight. Errors render inline, never `alert`. Groq's model block edits `groq_model`. This is interim wiring only; no restyling (plan 2 replaces the file). Reset no longer touches keys.

- [ ] **Step 1:** Failing tests:
  - `SecretField.test.tsx`: `shows_saved_state_without_revealing_value`, `save_calls_setProviderKey_once_on_double_click`, `value_is_cleared_from_input_after_save`, `whitespace_only_is_not_saved`, `failed_save_shows_inline_error_and_keeps_input`, `remove_calls_clearProviderKey`, `unmount_during_save_does_not_set_state` (no React warning), `pasted_10kb_unicode_value_is_passed_through_unchanged`.
  - `tauriApi.test.ts`: `default_config_has_no_key_fields` (no property name ends in `_api_key`), `browser_fallback_does_not_write_keys_to_localStorage`.
- [ ] **Step 2:** Run `npx vitest run src/components/settings/SecretField.test.tsx src/services/tauriApi.test.ts`: FAIL. Implement. PASS.
- [ ] **Step 3:** `npx tsc --noEmit`: zero errors.
- [ ] **Step 4:** Checkpoint.

### Task 12: End-to-end verification

- [ ] **Step 1:** Full Rust suite once: `cargo test --manifest-path src-tauri/Cargo.toml`. Full frontend suite once: `npm test`. Report counts and any failure verbatim.
- [ ] **Step 2:** Back up the real `%APPDATA%\com.ghostcue.app\ghostcue_config.json`, then `npm run tauri dev` and walk through, reporting what happened for each: upgrade from the existing v1 file (keys appear in Credential Manager under `GhostCue`, file has none); corrupt file; each configured provider answers; wrong key shows the provider's name and "key" in the message; Ollama stopped; Ollama running with no models; Custom pointed at a keyless local server; network disconnected mid-answer; app killed and relaunched mid-save.
- [ ] **Step 3:** List what was not exercised (any provider with no key available to test with) rather than marking it passed.
- [ ] **Step 4:** Checkpoint with the complete list of files changed across the plan.
