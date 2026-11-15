# GhostCue: provider setup reliability and UI flow revamp

Date: 2026-11-15. Status: awaiting approval. Nothing is built until this is approved.

## Intent

Setting up an answer engine (cloud API key or local model) is unreliable, and the UI shows every option at once. A new user should be able to go from install to a working session by answering a few questions in order, with each choice verified before they rely on it in a live session.

## Goals

- Every provider uses its own key, endpoint, and model. Nothing is shared or silently copied between providers.
- The user can verify a provider before a session: a "Test" action that makes a real request and reports a plain result.
- Local models work without guessing: the app lists what the local server actually has installed.
- Saved settings survive app updates and are never silently reset.
- First launch is a guided setup. After that, the app opens on a short session start, and settings show one thing at a time.
- UI follows the global UI and motion directives (section 7 of the user's CLAUDE.md).

## Non-goals

- No new providers, no new STT engines, no changes to prompts, audio capture, VAD, OCR, or the window/stealth modules.
- No change to what the live HUD does (same actions, hotkeys, layout modes, capture behaviour). Its look and arrangement are fully redesigned; see Visual direction.
- No translation of new copy into all 11 locales in the first pass (English first, keys added for the rest with English fallback).

## Anti-goals

- A setup flow that blocks a returning user who is already configured.
- A "Test" that reports success without making a real request.
- Any migration that loses a key the user already saved.

## Audit findings this design answers

Found by reading the code. None reproduced at runtime yet; each gets a failing test before its fix.

Backend (`src-tauri/src`)

1. `llm/orchestrator.rs:104` Anthropic uses `custom_endpoint` when it is non-empty. `config.rs:381` auto-fills `custom_endpoint` with the OpenRouter URL whenever an OpenRouter key exists, so Anthropic requests go to OpenRouter with the Anthropic key.
2. `llm/orchestrator.rs:113` Groq (LLM) sends `openai_api_key`, and `config.rs:506` uses `openai_model` for Groq. The dedicated `groq_api_key` is only used for STT.
3. `config.rs:378-386` copies keys between OpenRouter and Custom in both directions on every load. `orchestrator.rs:119-140` falls back from DeepSeek/OpenRouter to the Custom and OpenAI keys, so a key can be sent to a provider it does not belong to.
4. `config.rs:513-608` smart routing overrides the user's model. DeepSeek and Groq ignore the selected model entirely. Ollama is switched to `qwen2.5-coder:7b` or `llama3.1:8b`, which fails if that model is not installed. Routing defaults to on.
5. `config.rs:491` `SMART_MODEL_ROUTING` from `.env` overwrites the saved setting on every load.
6. `config.rs:697-705` any parse failure discards the whole config and falls back to defaults. Most fields have no `#[serde(default)]`, so adding or removing a field wipes every saved key.
7. `config.rs:217-248, 655-690` `.env` is read from and written to the process working directory. In an installed build that is not the project folder. `LLM_PROVIDER` from `.env` can never apply because the default is non-empty.
8. `llm/ollama.rs` no timeouts, `{"error": ...}` stream lines are ignored, an empty reply is returned as success, images are dropped unless the model name contains one of four substrings, and there is no way to list installed models or check the server.
9. `llm/openai.rs:171` an empty key is rejected before the request, which blocks keyless local servers (LM Studio, llama.cpp, Ollama's OpenAI-compatible endpoint) through Custom. `openai.rs:202` only `o1`/`o3` are treated as reasoning models, so other reasoning models listed in the UI are sent parameters they may reject. Every error is labelled "OpenAI" regardless of provider.
10. `llm/gemini.rs` key is passed in the URL, no timeouts, raw JSON error bodies are shown to the user, empty reply is returned as success.
11. API keys are stored in plain JSON in the app data folder, and `tauri.conf.json` has `csp: null`.
12. There are no tests of any kind (no Rust tests, no frontend test runner).

Settings UI (`src/components/settings`)

13. `ModelSettings.tsx:854` the Groq key field edits `openai_api_key`. `:964-968` and `:1045-1049` DeepSeek and OpenRouter fields display the Custom key as a fallback and write to both, so entering one overwrites the other and a field cannot be cleared.
14. `ModelSettings.tsx:259, 283` choosing or downloading a Whisper model saves to disk immediately while the rest of the dialog is unsaved. `SettingsModal.tsx:45` pushes every edit into live app state, so Cancel does not cancel.
15. `SettingsModal.tsx:62` Reset uses the frontend defaults, which wipe all keys and differ from the Rust defaults (provider, role text).
16. `ModelSettings.tsx:224` download progress is never updated. Errors use `alert()`/`confirm()`.
17. Model lists are hardcoded (about 100 entries). Several ids look retired or not valid for that provider; they need checking against each provider's live list, not from memory. The Ollama list offers models regardless of what is installed. The Cohere preset points at an endpoint that is not OpenAI-compatible.
18. Nothing checks that a provider is configured before a session starts. The first sign of a bad key is an error during the live session.

Flow and visual (`src/App.tsx`, `StartupSessionScreen.tsx`, settings)

19. First screen shows, at once: session history, four role presets, title, company, role, job description, resume upload and text, project folders with scanner, context preview. Provider setup is not part of it at all; it lives behind Settings, third tab, below the STT section.
20. The Models tab shows STT languages (12), STT engines (5), the active engine's options, LLM providers (8), a routing explainer, and the active provider's options in one scroll.
21. Against the directives: frosted backdrop, glow shadows, cards inside cards throughout settings, uniform card grids (8 providers, 5 engines, 4 presets), icon chips, uppercase bold labels everywhere, emoji and em dashes in copy, unverified figures ("Saves ~95%", "sub-100ms", "~200ms"), Inter loaded from Google Fonts on every launch (a network request, and unused offline), 10-11px text.
22. `App.tsx` is 1,577 lines with about 30 state values; `ModelSettings.tsx` is 1,228.

## Approaches considered

A. Guided flow (chosen). First-run setup, short session start, settings reorganised around one selection at a time. Fixes the first-run problem and the density problem. Most work.

B. Same screens, collapsed sections. Wrap existing groups in accordions and restyle. Cheap, but provider setup stays hidden behind Settings and nothing verifies a choice, so the main complaint remains.

C. Separate settings window. Cleaner separation, but adds a second Tauri window that must also carry the capture-protection and focus handling. Cost with no gain for the stated problem.

A is chosen as my call; the request described outcomes and left the how open.

## Design

### Provider layer (Rust)

- One table of provider definitions: id, base URL, auth style, key field, model field, default model, whether a key is required. The orchestrator resolves key/endpoint/model only from the selected provider's own fields. No cross-provider fallback.
- Groq gets its own LLM model field and uses `groq_api_key`. Anthropic always uses its own endpoint.
- Smart routing becomes opt-in, defaults to off, and never substitutes a model the user did not choose: each provider gets an optional second "model for code and screen tasks" field, empty by default.
- Config: `#[serde(default)]` at struct level, a `config_version` field, and a one-time migration from the current shape (un-merge the bridged Custom key/endpoint when they equal the OpenRouter values; move a `gsk_` key found in `openai_api_key` to Groq). A file that fails to parse is copied to `ghostcue_config.bad-<timestamp>.json` and the user is told, never silently replaced.
- `.env` is read only in debug builds, from the project root, as initial values for empty fields. The app stops writing to `.env`.
- New commands: `test_llm_provider(provider)` makes a one-token real request and returns a typed result (ok, bad key, no credit, model not found, unreachable, timeout) with a plain message; `list_provider_models(provider)` calls the provider's model list endpoint; for Ollama this is the installed-model list plus a server reachability check.
- Ollama: connect and read timeouts, error lines surfaced, empty reply is an error, "model not installed" gets its own message with the pull command, vision support read from the server's model info instead of name matching.
- OpenAI-compatible client: provider name in errors, key optional when the provider definition says so, timeouts on all clients. Gemini key moves to a header.
- Keys live in Windows Credential Manager (owner decision, 2026-11-15), one entry per provider under the service name `GhostCue`, via the `keyring` crate (new Rust dependency). The config file holds no secrets. Migration moves every key found in the old JSON into Credential Manager, verifies it reads back, and only then removes it from the file.
- The frontend never receives a stored key. `get_app_config` returns a `has_key` flag per provider; keys are written with `set_provider_key(provider, key)` and removed with `clear_provider_key(provider)`. Key fields show "Saved" with Replace and Remove, not the value. If Credential Manager is unavailable the user is told and the key is not written anywhere else.

### Flow

Window stays 780x560 minimum 420x280; every step must fit without horizontal scroll at 420 wide.

1. First run (no provider has passed a test): Setup, three steps, one per screen.
   - Answers: choose "Cloud" or "On this computer". Cloud shows a provider list (plain rows, not tiles), then key, then model from the live list, then Test. Local shows server status, installed models, Test.
   - Listening: transcription engine. Local Whisper preselected with one model download and real progress, or a cloud engine with key and Test.
   - Sound check: pick mic and system audio, live meters, a spoken line transcribed back.
   - Each step has Back and Continue; Continue is enabled when the step's test has passed. "Skip for now" is available and leaves a visible "not set up" state on Home.
2. Home: session list and one primary action, "New interview". A status line states the active answer engine and transcription engine, with a link to change them. If either is untested or failing, the status line says so and Start is replaced by "Finish setup".
3. New interview: two steps. Role and job description first (presets become a single "Start from a template" menu). Resume and project folders second, marked optional, skippable.
4. Live HUD: redesigned around the answer. The answer is the largest element and the only one with body-size text. The transcript becomes a single line showing the interviewer's latest sentence, expandable to the full history. Actions are one row of labelled buttons with their hotkeys; secondary actions sit in an overflow menu. The header shrinks to a thin drag strip with session name, listening state from real capture status, and window controls. The existing layout modes and compact pill stay, restyled.
5. Settings: left list of sections (Answers, Listening, Audio, Interview context, Window, Language). Each section shows the current selection and its fields only; changing provider is a picker, not a wall. Advanced options (routing, custom endpoint, prompt override, VAD timings) sit behind a disclosure in their section. Edits are held in the dialog until Save; Cancel discards. Reset asks in-app and keeps keys unless the user ticks "also remove saved keys".

### Visual direction

Complete overhaul (owner decision, 2026-11-15): the current slate-and-sky look is dropped, every screen is rebuilt on new tokens, and no existing component styling is carried over. The direction below is my proposal and is confirmed with mockups before phase 3.

- Palette: neutral graphite, not blue-tinted. Base `#0E0F11`, raised `#17191C`, line `#2A2D32`, text `#ECEAE4`, secondary text `#A3A19A`. One accent, amber `#F2A93B`, used only for the primary action and the active selection. Green, red and a separate yellow are for status only. Flat fills, 1px borders, no glows, no backdrop blur. The HUD keeps user-set opacity on a solid fill.
- Type: Segoe UI Variable (Display for headings, Text for body) with Cascadia Code for code and ids. Both ship with Windows 11, the only target platform, so no font download. Minimum 12px. Sentence case; no all-caps labels.
- Layout: one container level per group; rows and dividers inside. No tile grids.
- Motion: framer-motion (already a dependency). Step changes slide 12px and fade, 220ms, ease-out cubic; buttons have hover, pressed, focus-visible, disabled; Test shows progress then result in place. `prefers-reduced-motion` gets fades only or none. Transform and opacity only.
- Copy: plain, no emoji, no em dashes, no figures that are not measured.

### Code structure

- `src/providers/` typed provider catalogue shared by setup and settings (mirrors the Rust table; ids and fields only, model lists come from the backend).
- `src/components/setup/`, `src/components/home/`, `src/components/settings/sections/`; shared `ui/` primitives (Button, Field, SecretField, Select, StatusLine, Stepper, Dialog).
- `ModelSettings.tsx` is replaced by the Answers and Listening sections. `App.tsx` keeps the HUD; routing between Setup, Home, New interview, HUD moves to a small view-state hook.

### Testing

- Rust unit tests (`cargo test`): provider resolution for every provider, migration from real old-shape fixtures, corrupt and partial config files, routing never substituting a model. Client tests against a local mock HTTP server: bad key, no credit, 429 then success, timeout, mid-stream drop, empty stream, error line in stream, cancel during retry.
- Frontend: add Vitest and Testing Library (new dev dependencies, flagged). Tests for setup gating, Cancel discarding edits, key fields not leaking across providers, double-click on Test and Save, provider switch during an in-flight test, empty/huge/unicode key input.
- Each fix: test written first and shown failing against current code, then passing.
- Manual: `tauri dev` walk-through of first run, returning user with old config, offline, Ollama stopped, Ollama running with no models.

## Phases

1. Test harness (Rust tests, Vitest, Testing Library) plus backend provider correctness and config migration (findings 1-7, 9-10, 12).
2. Credential Manager key storage, test and model-list commands, Ollama hardening (8, 11, 17, 18).
3. Mockups approved, then new tokens and UI primitives, Setup flow, Home, New interview (19, 21).
4. Settings sections, removal of `ModelSettings.tsx`, dialog behaviour fixes (13-16, 20, 22).
5. HUD redesign, banned-pattern sweep, full manual run.

## Left to the builder

Exact component APIs, file names inside the folders above, mock server crate choice, and the wording of error messages (within the copy rules).

## Open items for the owner

- `development` was created locally from `main` on 2026-11-15 and is not pushed. `staging` and `production` do not exist.
- `graphify-out/` is missing and Mnemosyne has no entries for this project.
- The visual direction above is a proposal until the mockups are approved.
