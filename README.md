# 👻 GhostCue

> **Lightweight, uncapturable desktop HUD & AI interview copilot with real-time speech transcription, local OCR, and multi-model LLM orchestration.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-1.75+-orange.svg?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)](#)

---

## ⚡ Overview

GhostCue is a high-performance, low-latency desktop assistant designed for real-time interview support, technical assessment practice, and speech accessibility. Built with a **Rust (Tauri v2)** backend and **React 19 / TypeScript** frontend, GhostCue captures both sides of a conversation (system audio and microphone), transcribes speech in real time, and synthesizes contextual hints, algorithmic solutions, and architectural breakdowns.

---

## 🚀 Pre-Built Installers

Ready-to-use Windows installers are located directly in the root directory:

| Installer Format | Filename | Download / Location |
| :--- | :--- | :--- |
| **NSIS Setup Executable** | `GhostCue_0.1.0_x64-setup.exe` | [`./GhostCue_0.1.0_x64-setup.exe`](./GhostCue_0.1.0_x64-setup.exe) |
| **Windows MSI Package** | `GhostCue_0.1.0_x64_en-US.msi` | [`./GhostCue_0.1.0_x64_en-US.msi`](./GhostCue_0.1.0_x64_en-US.msi) |

Simply run either installer to set up GhostCue on Windows without having to compile from source.

---

## ✨ Key Features

### 🛡️ 1. Window Protection & Stealth
* **OS-Level Anti-Capture:** Uses Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` and macOS `NSWindowSharingNone`. The HUD window is excluded from screen recordings, window shares, and conference tools (Zoom, Microsoft Teams, Google Meet, Discord, OBS).
* **Focus Shield (`WS_EX_NOACTIVATE`):** Interacting with or dragging the HUD will not steal keyboard/system focus from your active browser, code editor, or test environment.
* **Click-Through Mode:** Pass mouse clicks through the HUD directly to windows underneath.
* **Stealth Typer:** Simulates natural keyboard typing character-by-character into any active text editor or assessment terminal.

### 🎙️ 2. Dual-Channel Audio & Speech-to-Text
* **Concurrent Audio Capture:**
  * **Interviewer Audio:** Captures remote audio via low-latency system loopback (`cpal` WASAPI on Windows).
  * **Candidate Audio:** Simultaneously captures local microphone input.
  * Resamples streams to 16 kHz mono 32-bit float PCM.
* **Voice Activity Detection (VAD):**
  * Energy-based VAD with zero-crossing rate analysis and an 85 Hz high-pass rumble filter.
  * Pre-roll buffer preserves initial consonants; dynamic speech duration and silence cutoff thresholds prevent mid-sentence fragmentation.
* **Flexible STT Providers:**
  * **Local Offline:** Quantized Whisper GGML models (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`) running locally on device with zero cloud dependency.
  * **Cloud Fallback:** Deepgram Nova-2 or OpenAI/Groq Cloud Whisper.
  * Speaker diarization tagging (`Interviewer:` vs `Candidate:`).
  * Multi-language transcription support (English, Chinese, Spanish, Japanese, German, French, Portuguese, Korean, Russian, Tagalog, Hindi, Arabic).

### 🧠 3. Intelligence & Multi-Provider LLM
* **Broad Provider Support:** Google Gemini (`gemini-2.0-flash`, `gemini-1.5-pro`), OpenAI (`gpt-4o`, `gpt-4o-mini`, `o3-mini`), Anthropic Claude (`claude-3-7-sonnet`, `claude-3-5-haiku`), Groq (`llama-3.3-70b`), and Ollama (local offline models).
* **Smart Model Routing:** Automatically routes heavy tasks (code generation, screen vision) to advanced flagship models while routing conversational hints to fast, low-latency models.
* **Auto-Trigger Assistant:** Automatically detects when the interviewer finishes asking a question and produces timely hints without manual intervention.
* **Local Screen OCR:** Extracts text directly from the active screen using native Windows OCR—minimizing vision token costs and latency.
* **Mathematical Typography:** Renders algorithms, time/space complexity ($O(N \log N)$), and formulas using KaTeX LaTeX typesetting.

### 📁 4. Context & Session History
* **Project Context Scanner:** Recursively indexes local code repositories, reading key manifests (`package.json`, `Cargo.toml`, `go.mod`, `README.md`) to inject project-specific context into responses.
* **Persistent Sessions:** Saves interview transcript logs, custom queries, and AI answers with search, pagination, and one-click `.txt` export.

---

## 🏛️ System Architecture

```
                                 ┌───────────────────────────────┐
                                 │   Interviewer Audio (WASAPI)  │
                                 └───────────────┬───────────────┘
┌──────────────────────────────┐                 │
│    Candidate Mic Audio       │                 ▼
└──────────────┬───────────────┘       [ cpal Audio Capture ]
               │                                 │
               ▼                                 ▼
        [ Mono 16kHz F32 ]              [ Mono 16kHz F32 ]
               │                                 │
               └───────────────┬─────────────────┘
                               │
                               ▼
                    [ VAD Detection Engine ]
               (Energy, ZCR & Silence Segmentation)
                               │
                               ▼
                  [ Speech-to-Text Pipeline ]
             (Local Whisper GGML / Cloud Providers)
                               │
                               ▼
               [ Conversation State & Context ]
           (Project Scanner + Resume + Dialogue Turns)
                               │
                               ▼
                 [ LLM Orchestration Engine ]
           (Smart Routing: Gemini / Claude / OpenAI / Ollama)
                               │
                               ▼ (Tauri IPC Event Stream)
       ┌─────────────────────────────────────────────────┐
       │             GhostCue HUD Interface              │
       │  - Anti-Capture (WDA_EXCLUDEFROMCAPTURE)        │
       │  - Focus Shield (WS_EX_NOACTIVATE)              │
       │  - Stealth Typer & Local Native OCR             │
       │  - KaTeX LaTeX Math & Interactive Code Studio   │
       └─────────────────────────────────────────────────┘
```

---

## ⌨️ Global Shortcuts

| Hotkey | Action | Function |
| :--- | :--- | :--- |
| `Ctrl + Shift + H` | **Panic Hide / Restore** | Toggles window visibility instantly |
| `Ctrl + Shift + C` | **Click-Through** | Toggles click-through mode to pass mouse events to underlying apps |
| `Ctrl + Shift + F` | **Focus Shield** | Toggles non-activating mode to prevent stealing window focus |
| `Ctrl + Shift + P` | **Pause / Resume** | Pauses or resumes audio processing and AI auto-triggers |
| `Ctrl + Shift + M` | **Mute Mic** | Toggles candidate microphone mute |
| `Ctrl + Shift + Space`| **Instant Hint** | Generates response for the latest dialogue context |
| `Ctrl + Shift + K` | **Code Solution** | Generates algorithmic implementation with complexity analysis |
| `Ctrl + Shift + L` | **Clarifying Questions**| Generates strategic questions to ask the interviewer |
| `Ctrl + Shift + E` | **System Design** | Generates architecture breakdown, scaling considerations, and trade-offs |
| `Ctrl + Shift + S` | **Screen Vision** | Captures active display and extracts problem statement via local OCR |
| `Ctrl + Shift + O` | **Live OCR Auto-Scan** | Toggles periodic background screen watching and problem detection |
| `Ctrl + Shift + T` | **Stealth Typer** | Simulates typing the latest generated code into your active editor |
| `Esc` | **Stop / Dismiss** | Cancels active LLM streaming or closes modal dialogs |

---

## 🛠️ Building From Source

### Prerequisites
1. **Node.js**: v18+ (v22+ LTS recommended)
2. **Rust & Cargo**: v1.75+ (`rustup`)
3. **C++ Build Tools**:
   * **Windows:** Visual Studio 2022 C++ Build Tools (with Windows 10/11 SDK)
   * **macOS:** Xcode Command Line Tools
   * **Linux:** `libwebkit2gtk-4.1-dev`, `libasound2-dev`, `libssl-dev`

### Installation
```bash
# 1. Clone repository
git clone https://github.com/your-username/ghostcue.git
cd ghostcue

# 2. Install frontend dependencies
npm install

# 3. Configure environment variables (optional)
cp .env.example .env
```

### Running Locally
```bash
# Run Vite dev server and native Tauri HUD window concurrently
npm run tauri dev
```

### Building Release Package
```bash
# Compile optimized native executable and setup bundle
npm run tauri build
```
Built binaries and installers will be output to `src-tauri/target/release/bundle/`.

---

## ⚙️ Configuration Options

Configuration can be set either via the in-app Settings modal (`Ctrl + ,` or gear icon) or through the `.env` file:

```env
# Primary LLM Provider: "gemini" | "ollama" | "openai" | "anthropic" | "groq"
LLM_PROVIDER=openai

# Google Gemini Configuration
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash

# OpenAI Configuration
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic Claude Configuration
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Groq Configuration
GROQ_API_KEY=

# Local Ollama Configuration (Offline)
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Smart Model Routing (routes complex tasks to advanced models)
SMART_MODEL_ROUTING=true

# Speech-to-Text: "local_whisper" | "deepgram"
STT_PROVIDER=local_whisper
DEEPGRAM_API_KEY=

# Auto-answer conversational pause delay in milliseconds
AUTO_TRIGGER_DELAY_MS=1500

# Periodic Screen OCR
LIVE_OCR_ENABLED=false
LIVE_OCR_INTERVAL_SECS=10
```

---

## 🔒 Privacy & Local Execution

* **Zero-Cloud Offline Mode:** When configured with **Local Whisper** and **Ollama**, GhostCue operates completely offline. No audio samples, transcripts, or queries leave your machine.
* **Transparent Storage:** Session records and configuration data are stored locally in your operating system's standard application data directory.
* **No Telemetry or Tracking:** GhostCue contains no built-in analytics, trackers, or telemetry beacons.

---

## 📜 License & Disclaimer

Distributed under the **MIT License**. See `LICENSE` for details.

**Disclaimer:** GhostCue is developed as a technical interview preparation aid, practice tool, and accessibility copilot. Users are responsible for complying with the policies, codes of conduct, and terms of service of their prospective employers, academic institutions, and assessment platforms.
