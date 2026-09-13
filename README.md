<p align="center">
  <img src="assets/GhostCue_icon.png" alt="GhostCue App Icon" width="128" height="128" />
</p>

<h1 align="center">GhostCue</h1>

<p align="center">
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white" alt="Tauri v2" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.75+-orange.svg?logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011%20(x64)-0078d4.svg?logo=windows&logoColor=white" alt="Platform" />
</p>

<p align="center">
  <strong>Lightweight, uncapturable desktop HUD and AI interview copilot with real-time dual audio transcription, local OCR screen capture, and multi-model LLM orchestration.</strong>
</p>

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Overview

GhostCue is a high-performance, low-latency desktop assistant designed for real-time technical assessment practice, technical interview preparation, and speech accessibility. Built on a native **Rust (Tauri v2)** backend paired with a **React 19 / TypeScript** user interface, GhostCue captures both sides of a conversation via system audio loopback and microphone, transcribes speech in real time, and synthesizes contextual hints, algorithmic solutions, and architectural breakdowns on demand.

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Pre-Built Installers

Standalone Windows binaries and setup packages are available directly in the root directory:

| Package Format | Target Platform | Architecture | Installer File |
| :--- | :--- | :--- | :--- |
| **NSIS Setup Installer** | Windows 10 / 11 | x64 | [`GhostCue_0.1.0_x64-setup.exe`](./GhostCue_0.1.0_x64-setup.exe) |
| **Windows MSI Package** | Windows 10 / 11 | x64 | [`GhostCue_0.1.0_x64_en-US.msi`](./GhostCue_0.1.0_x64_en-US.msi) |

To get started immediately without compiling from source, run either installer.

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## System Architecture

The following diagram illustrates the complete audio capture, speech transcription, context aggregation, model routing, and native desktop presentation pipelines:

```mermaid
flowchart TD
    subgraph S1 ["1. INPUT & CAPTURE STREAMS"]
        WASAPI["System Audio Loopback<br/>(WASAPI / cpal 16 kHz)"]:::cyan
        MIC["Microphone Input<br/>(Candidate Audio)"]:::cyan
        VISION["Live Screen Capture<br/>(Native Windows OCR)"]:::emerald
        REPO["Project Codebase<br/>(Manifests & Architecture)"]:::emerald
    end

    subgraph S2 ["2. REAL-TIME PROCESSING & SPEECH-TO-TEXT"]
        VAD["Voice Activity Detection<br/>(85 Hz High-Pass Filter + Silence Cutoff)"]:::blue
        STT["Speech-to-Text Engine<br/>Local Whisper GGML • Deepgram • Cloud Whisper"]:::blue
        STATE["Conversation & Context Manager<br/>Dialogue History + Codebase Context"]:::purple
    end

    subgraph S3 ["3. LLM INTELLIGENCE & ROUTING"]
        ROUTER{"Smart Task Router<br/>Task & Latency Routing"}:::purpleAcc
        FLAGSHIP["Flagship Models<br/>GPT-4o • Claude 3.5/3.7 Sonnet • Gemini 2.5 Pro"]:::amber
        FAST["High-Speed Models<br/>Gemini 2.5 Flash • GPT-4o Mini • Claude 3.5 Haiku"]:::sky
        OLLAMA["Local Offline Models<br/>Qwen 2.5 Coder • Llama 3.1 • DeepSeek R1"]:::fuchsia
    end

    subgraph S4 ["4. NATIVE STEALTH HUD & INTERACTION"]
        HUD["GhostCue Floating HUD Window<br/>Anti-Capture Guard (WDA_EXCLUDEFROMCAPTURE) • Focus Shield (WS_EX_NOACTIVATE)"]:::rose
        OUTPUT["KaTeX LaTeX Math & Code Studio • Stealth Auto-Typer Keystroke Injection"]:::roseAcc
    end

    WASAPI --> VAD
    MIC --> VAD
    VAD --> STT
    STT --> STATE
    VISION --> STATE
    REPO --> STATE

    STATE --> ROUTER
    ROUTER -->|"Complex Code & Design"| FLAGSHIP
    ROUTER -->|"Instant Hints"| FAST
    ROUTER -->|"100% Offline"| OLLAMA

    FLAGSHIP --> HUD
    FAST --> HUD
    OLLAMA --> HUD
    HUD --> OUTPUT

    %% High-Contrast Vibrant Color Classes
    classDef cyan fill:#0369a1,stroke:#38bdf8,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef blue fill:#1d4ed8,stroke:#60a5fa,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef emerald fill:#047857,stroke:#34d399,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef purple fill:#581c87,stroke:#c084fc,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef purpleAcc fill:#6b21a8,stroke:#e9d5ff,stroke-width:2.5px,color:#ffffff,font-size:15px,font-weight:bold;
    classDef amber fill:#b45309,stroke:#fcd34d,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef sky fill:#0284c7,stroke:#7dd3fc,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef fuchsia fill:#a21caf,stroke:#f0abfc,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef rose fill:#be123c,stroke:#fda4af,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;
    classDef roseAcc fill:#9f1239,stroke:#f43f5e,stroke-width:2px,color:#ffffff,font-size:14px,font-weight:bold;

    style S1 fill:#081528,stroke:#0284c7,stroke-width:1.5px,color:#38bdf8;
    style S2 fill:#0f172a,stroke:#3b82f6,stroke-width:1.5px,color:#60a5fa;
    style S3 fill:#190b2e,stroke:#9333ea,stroke-width:1.5px,color:#c084fc;
    style S4 fill:#200714,stroke:#e11d48,stroke-width:1.5px,color:#fb7185;
```

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Event Lifecycle

The interaction flow from audio capture to the simulated typing of a solution is structured as follows:

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'actorBkg': '#0369a1',
    'actorBorder': '#38bdf8',
    'actorTextColor': '#ffffff',
    'actorLineColor': '#0284c7',
    'signalColor': '#0284c7',
    'signalTextColor': '#0284c7',
    'labelBoxBkgColor': '#0f172a',
    'labelBoxBorderColor': '#38bdf8',
    'labelTextColor': '#ffffff',
    'noteBkgColor': '#1e1b4b',
    'noteBorderColor': '#818cf8',
    'noteTextColor': '#ffffff',
    'activationBkgColor': '#0284c7',
    'activationBorderColor': '#38bdf8',
    'sequenceNumberColor': '#ffffff',
    'fontSize': '15px',
    'fontFamily': 'ui-sans-serif, system-ui, -apple-system, sans-serif'
  }
}}%%
sequenceDiagram
    autonumber
    actor Interviewer as Interviewer
    participant AudioEngine as Audio & Speech Pipeline
    participant LLM as Context & Smart Router
    participant HUD as GhostCue Stealth HUD

    Interviewer->>AudioEngine: Speaks interview question via system audio
    activate AudioEngine
    Note over AudioEngine: VAD captures 16 kHz stream & detects silence cutoff
    AudioEngine->>LLM: Dispatches speaker-tagged transcript
    deactivate AudioEngine
    activate LLM
    Note over LLM: Merges screen OCR + project codebase architecture
    LLM-->>HUD: Streams token chunks in real time via Tauri IPC
    deactivate LLM
    activate HUD
    Note over HUD: Formats KaTeX algorithmic complexity & code
    HUD-->>Interviewer: Candidate triggers Stealth Typer (Ctrl + Shift + T) to inject code
    deactivate HUD
```

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Key Features

### 1. Window Protection and Stealth
* **Operating System Anti-Capture:** Employs Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` and macOS `NSWindowSharingNone`. The HUD window is excluded from screen recordings, window shares, and conference software such as Zoom, Microsoft Teams, Google Meet, Discord, and OBS.
* **Focus Shield (`WS_EX_NOACTIVATE`):** Moving or interacting with the HUD does not steal focus from the primary development environment, browser, or code assessment terminal.
* **Click-Through Mode:** Pass mouse clicks through the HUD directly to the applications running underneath.
* **Stealth Typer:** Simulates natural character-by-character keyboard input directly into any active editor or assessment interface.

### 2. Dual-Channel Audio and Speech-to-Text
* **Concurrent Audio Capture:**
  * **Interviewer Audio:** Captures remote audio through low-latency system loopback via `cpal` WASAPI on Windows.
  * **Candidate Audio:** Concurrently captures local microphone input.
  * Resamples incoming streams to standardized 16 kHz mono 32-bit float PCM.
* **Voice Activity Detection (VAD):**
  * Energy-based detection with zero-crossing rate analysis and an 85 Hz high-pass rumble filter.
  * Pre-roll buffering retains word-initial consonants; dynamic silence thresholds avoid splitting sentences prematurely.
* **Flexible STT Engines:**
  * **Local Offline:** Quantized Whisper GGML models (`tiny`, `base`, `small`, `medium`, `large-v3-turbo`) executing entirely on-device.
  * **Cloud Fallback:** Deepgram Nova-2 streaming WebSocket or OpenAI/Groq Cloud Whisper.
  * Automatic speaker diarization tagging (`Interviewer:` vs `Candidate:`).
  * Multi-language support across English, Filipino, Spanish, Chinese, Japanese, German, French, Portuguese, Korean, Russian, Hindi, and Arabic.

### 3. Intelligence and Multi-Provider LLM
* **Broad Provider Support:** Google Gemini (`gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-pro`), OpenAI (`gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1`), Anthropic Claude (`claude-3-5-sonnet`, `claude-3-7-sonnet`, `claude-3-5-haiku`), Groq (`llama-3.3-70b`), and Ollama (local offline models).
* **Smart Model Routing:** Directs complex tasks such as algorithmic generation and architecture design to flagship models while routing rapid hints to low-latency variants.
* **Auto-Trigger Assistant:** Automatically detects when the interviewer has finished speaking and generates timely answers without manual intervention.
* **Local Screen OCR:** Extracts text directly from the active display buffer via native Windows OCR, avoiding repetitive vision token costs.
* **Mathematical Notation:** Formats algorithmic complexity analysis, asymptotic bounds ($O(N \log N)$), and proofs using KaTeX LaTeX typesetting.

### 4. Context and Session History
* **Project Context Scanner:** Indexes local project directories, parsing key manifests (`package.json`, `Cargo.toml`, `go.mod`, `README.md`) to integrate repository architecture into LLM responses.
* **Session Persistence:** Retains question transcripts, candidate queries, and generated solutions with filtering, search, and one-click plain-text export.

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Global Shortcuts

All shortcuts can be reconfigured or customized in the Settings panel:

| Hotkey | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + H` | **Panic Hide / Restore** | Toggles HUD window visibility immediately |
| `Ctrl + Shift + C` | **Click-Through** | Enables mouse click pass-through to windows below |
| `Ctrl + Shift + F` | **Focus Shield** | Enables non-activating window mode to prevent stealing keyboard focus |
| `Ctrl + Shift + P` | **Pause / Resume** | Pauses or resumes audio capture and automatic LLM triggers |
| `Ctrl + Shift + M` | **Mute Microphone** | Toggles candidate microphone mute state |
| `Ctrl + Shift + Space`| **Instant Hint** | Triggers prompt generation based on current conversation context |
| `Ctrl + Shift + K` | **Code Solution** | Generates an algorithmic solution with complexity breakdown |
| `Ctrl + Shift + L` | **Clarifying Questions** | Formulates strategic clarifying questions for the interviewer |
| `Ctrl + Shift + E` | **System Design** | Generates architecture diagrams, scaling points, and trade-off notes |
| `Ctrl + Shift + S` | **Screen Vision** | Captures the active monitor and extracts problem text via OCR |
| `Ctrl + Shift + O` | **Live OCR Auto-Scan** | Toggles periodic background screen inspection |
| `Ctrl + Shift + T` | **Stealth Typer** | Types the latest code block into the currently focused editor |
| `Esc` | **Stop / Dismiss** | Halts active LLM streaming or dismisses open overlays |

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Building From Source

### Prerequisites
1. **Node.js**: v18 or later (v22+ LTS recommended)
2. **Rust & Cargo**: v1.75 or later (`rustup`)
3. **Platform Build Tools**:
   * **Windows 10 / 11:** Visual Studio 2022 C++ Build Tools (with Windows 10/11 SDK)

### Installation
```bash
# 1. Clone the repository
git clone https://github.com/Aera0908/GhostCue.git
cd GhostCue

# 2. Install frontend dependencies
npm install

# 3. Create environment file from template
cp .env.example .env
```

### Development Mode
```bash
# Runs the Vite dev server and native Tauri desktop window concurrently
npm run tauri dev
```

### Production Build
```bash
# Compiles the optimized binary and installer packages
npm run tauri build
```
Compiled setup bundles and binaries are placed into `src-tauri/target/release/bundle/`.

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Configuration Reference

Settings can be managed either through the in-app interface (`Ctrl + ,`) or by configuring the `.env` file:

```env
# Primary LLM Provider: "gemini" | "openai" | "anthropic" | "deepseek" | "groq" | "ollama" | "custom"
LLM_PROVIDER=gemini

# Google Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OPENAI_BASE_URL=https://api.openai.com/v1

# Anthropic Claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat

# Groq
GROQ_API_KEY=

# Ollama (Local & Offline)
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b

# Custom / OpenRouter / Mistral / xAI / Cohere / Qwen
CUSTOM_ENDPOINT=https://openrouter.ai/api/v1
CUSTOM_API_KEY=
CUSTOM_MODEL=deepseek/deepseek-r1

# Smart Model Routing (routes complex coding/vision tasks to flagship models)
SMART_MODEL_ROUTING=true

# Speech-to-Text: "local_whisper" | "deepgram" | "cloud_whisper"
STT_PROVIDER=local_whisper
DEEPGRAM_API_KEY=

# Auto-answer trigger delay in milliseconds after speaker finishes
AUTO_TRIGGER_DELAY_MS=1500

# Periodic Screen OCR
LIVE_OCR_ENABLED=false
LIVE_OCR_INTERVAL_SECS=10
```

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Privacy and Local Operation

* **Full Offline Operation:** Pairing **Local Whisper GGML** with **Ollama** allows GhostCue to operate completely without internet connectivity. No audio buffers, transcripts, or queries leave your device.
* **Transparent Local Storage:** Configuration parameters, audio logs, and session history remain strictly on the local machine in standard system application directories.
* **Zero Telemetry:** GhostCue contains no third-party tracking, diagnostic beacons, or analytics collectors.

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## License and Disclaimer

Distributed under the **MIT License**. See `LICENSE` for further terms.

**Disclaimer:** GhostCue is developed as a technical interview preparation aid, practice tool, and accessibility copilot. Users are responsible for complying with the policies, codes of conduct, and terms of service of their prospective employers, academic institutions, and assessment platforms.
