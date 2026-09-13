<p align="center">
  <img src="assets/banner.svg" alt="GhostCue Banner" width="100%" />
</p>

<p align="center">
  <a href="https://tauri.app"><img src="https://img.shields.io/badge/Tauri-v2.0-blue.svg?logo=tauri&logoColor=white" alt="Tauri v2" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/Rust-1.75+-orange.svg?logo=rust&logoColor=white" alt="Rust" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" alt="Platform" />
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
    subgraph AudioIngestion["1. Dual-Channel Audio Ingestion"]
        WASAPI["Interviewer Voice<br/>(WASAPI System Loopback)"]
        MIC["Candidate Voice<br/>(Microphone Input)"]
        CPAL["cpal Audio Controller<br/>(Mono 16 kHz F32 Conversion)"]
        VAD["Voice Activity Detection<br/>(Energy, ZCR & 85 Hz High-Pass Filter)"]
        
        WASAPI --> CPAL
        MIC --> CPAL
        CPAL --> VAD
    end

    subgraph SpeechPipeline["2. Speech-to-Text Pipeline"]
        VAD --> STT_SELECT{"STT Engine Selector"}
        STT_SELECT -->|"Offline / Local"| WHISPER["Local Whisper GGML<br/>(tiny, base, small, medium, large-v3-turbo)"]
        STT_SELECT -->|"Cloud Low-Latency"| DEEPGRAM["Deepgram Nova-2 Streaming WebSocket"]
        STT_SELECT -->|"Cloud API"| CLOUD_WHISPER["OpenAI / Groq Cloud Whisper"]
        
        WHISPER --> DIARIZATION["Speaker Diarization<br/>(Interviewer vs Candidate)"]
        DEEPGRAM --> DIARIZATION
        CLOUD_WHISPER --> DIARIZATION
    end

    subgraph ContextAssembly["3. Context & Multimodal Ingestion"]
        DIARIZATION --> CONTEXT_BUS["Conversation State Manager"]
        SCANNER["Local Project Scanner<br/>(package.json, Cargo.toml, go.mod manifests)"] --> CONTEXT_BUS
        PROFILE["Candidate Resume & Job Description"] --> CONTEXT_BUS
        OCR["Native Windows OCR / Screen Vision<br/>(Real-Time Framebuffer Extraction)"] --> CONTEXT_BUS
    end

    subgraph ModelRouting["4. LLM Orchestration & Smart Routing"]
        CONTEXT_BUS --> ROUTER{"Smart Task Router"}
        ROUTER -->|"Complex Code & System Design"| FLAGSHIP["Flagship Models<br/>(GPT-4o, Claude 3.5/3.7 Sonnet, Gemini 2.5 Pro)"]
        ROUTER -->|"Instant Hints & Rapid Q&A"| FAST["High-Speed Models<br/>(Gemini 2.5 Flash, GPT-4o Mini, Claude 3.5 Haiku)"]
        ROUTER -->|"Local & Sovereign"| OLLAMA["Local Ollama<br/>(Qwen 2.5 Coder, Llama 3.1, DeepSeek R1)"]
        
        FLAGSHIP --> IPC_STREAM["Tauri IPC Streaming Bridge"]
        FAST --> IPC_STREAM
        OLLAMA --> IPC_STREAM
    end

    subgraph DesktopHUD["5. Native Stealth Presentation Layer"]
        IPC_STREAM --> HUD["GhostCue Floating HUD Window"]
        SEC_CAP["Anti-Capture Guard<br/>(WDA_EXCLUDEFROMCAPTURE)"] -.-> HUD
        SEC_FOC["Focus Shield<br/>(WS_EX_NOACTIVATE)"] -.-> HUD
        SEC_TYP["Stealth Typer<br/>(Simulated Keystrokes)"] -.-> HUD
        SEC_KAT["KaTeX Math Engine & Code Studio<br/>(LaTeX Rendering & Multi-Language Editor)"] -.-> HUD
    end
```

<p align="center">
  <img src="assets/divider.svg" alt="Section Divider" width="100%" />
</p>

## Event Lifecycle

The interaction flow from audio capture to the simulated typing of a solution is structured as follows:

```mermaid
sequenceDiagram
    autonumber
    actor Interviewer as Interviewer
    participant WASAPI as WASAPI Loopback
    participant VAD as VAD Engine
    participant STT as STT Pipeline
    participant Orchestrator as Context & LLM Router
    participant HUD as GhostCue HUD
    actor Candidate as Candidate

    Interviewer->>WASAPI: Asks interview question
    WASAPI->>VAD: Streams 16 kHz audio buffer
    Interviewer->>WASAPI: Stops speaking
    VAD->>STT: Emits voice chunk after silence threshold
    STT->>Orchestrator: Delivers speaker-tagged transcript
    Orchestrator->>Orchestrator: Compiles project context, resume, and active screen OCR
    Orchestrator->>HUD: Streams tokens in real time via Tauri IPC
    HUD->>Candidate: Displays hints, mathematical analysis, and code
    Candidate->>HUD: Invokes Stealth Typer (Ctrl + Shift + T)
    HUD-->>Candidate: Types code solution into active editor window
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
   * **Windows:** Visual Studio 2022 C++ Build Tools (including Windows 10/11 SDK)
   * **macOS:** Xcode Command Line Tools
   * **Linux:** `libwebkit2gtk-4.1-dev`, `libasound2-dev`, `libssl-dev`

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
# Primary LLM Provider: "gemini" | "ollama" | "openai" | "anthropic" | "groq"
LLM_PROVIDER=openai

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

# Groq
GROQ_API_KEY=

# Ollama (Local & Offline)
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=qwen2.5-coder:7b

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
