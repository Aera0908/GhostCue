# UI Overhaul Implementation Plan (plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "everything at once" interface with a guided flow: first-run Setup, a quiet Home, a two-step New interview, Settings as a section list, and a redesigned live HUD whose behaviour is unchanged.

**Architecture:** New presentation code lives beside the old (`src/ui` primitives, `src/features/*` screens) and replaces the old components screen by screen. `App.tsx` keeps its session, audio and generation logic; only what it renders changes. Provider setup is one shared component used by Setup and Settings, built on the plan 1 commands (`get_key_status`, `set_provider_key`, `list_provider_models`, `test_llm_provider`).

**Tech Stack:** React 19, TypeScript, Tailwind 3, framer-motion (already installed), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-setup-reliability-and-ui-flow-design.md` (approach A, approved neutral graphite direction).

## Global Constraints

- Branch `development`. No `git add`, `git commit` or `git push`.
- Palette: base `#0E0F11`, raised `#17191C`, line `#2A2D32`, text `#ECEAE4`, secondary `#A3A19A`, one accent `#F2A93B`. Flat fills, 1px borders. No gradients, glows, blur, shadows as decoration.
- Type: Segoe UI Variable for text, Cascadia Code for code. No font download. Minimum 12px. Sentence case.
- Motion: framer-motion, transform and opacity only, step change is a 12px slide plus fade over 220ms with an ease-out cubic, micro-interactions 150ms. Every animation has a `prefers-reduced-motion` fallback.
- Every control has hover, pressed, focus-visible and disabled states.
- Copy: plain sentences, no emoji, no em dashes, no invented figures, the provider's real name.
- None of the 15 banned patterns in any file this plan touches.
- Settings save as they are changed. There is no Cancel that pretends to undo.
- No stored key is ever read into the page.
- Tests first, shown failing, then passing. Mock only `@tauri-apps/api`.
- New screens are English only; the existing 11-language dictionary keeps serving the HUD. This is reported to the owner, not hidden.

## Review Focus

1. Switching provider while a model list or a test is still loading must never show the earlier provider's result (Task 2, `stale_results_are_discarded`).
2. A provider whose model list cannot be loaded must still be usable by typing a model name (Task 2, `list_failure_allows_manual_model`).
3. Double-clicking Test or Continue must not send two requests or skip a step (Tasks 2 and 4).
4. Setup must be resumable: closing the app mid-setup returns to the same step with saved work intact (Task 4, `setup_resumes_where_it_stopped`).
5. A user with existing sessions and working settings must never be forced through Setup (Task 4, `existing_users_skip_setup`).

## Tasks

1. **Tokens and primitives.** `tailwind.config.js` graphite tokens (`g-*`), `src/index.css`, `index.html` (remove Google Fonts), `src/ui/{Button,Field,Switch,Notice,StepTransition}.tsx`, `src/copy.ts`.
2. **Provider setup.** `src/features/providers/{providers.ts,ProviderSetup.tsx,ModelPicker.tsx}` plus the restyled `SecretField`. Provider list (rows, not tiles), key, model from the live list with manual entry, real Test.
3. **Listening setup.** `src/features/listening/ListeningSetup.tsx`: speech-to-text choice, key where needed, local Whisper model download with real progress, language.
4. **Setup flow.** `src/features/setup/SetupFlow.tsx`: Answers, Listening, Sound check. Shown only on first run.
5. **Home and New interview.** `src/features/home/{Home,NewInterview}.tsx` replace `StartupSessionScreen.tsx`.
6. **Settings.** `src/features/settings/Settings.tsx` section list replaces `SettingsModal` and its four tabs.
7. **HUD.** Restyle header, meters, transcript, answer, action row. Behaviour and hotkeys unchanged. Show `llm-notice` and the config notice.
8. **Sweep.** Remove replaced components and legacy tokens, grep the diff for banned patterns, full test run, manual pass.
