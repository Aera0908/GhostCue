# 👻 GhostCue

> **Stealth AI Interview Assistant & Uncapturable Desktop HUD**  
> Powered by Tauri v2 (Rust Backend + React 19 / TypeScript Frontend), `cpal` WASAPI Loopback Audio Capture, Silero VAD, Local Whisper STT, and Ollama/Cloud LLM Orchestration.

---

## 🌟 Key Features

* **OS-Level Anti-Capture Stealth:**
  * Uses Windows `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)` (and macOS `NSWindowSharingNone`).
  * The HUD window is **100% invisible** to screen-sharing applications (Zoom, Microsoft Teams, Google Meet, Discord, Slack) and screen recorders/OBS.
* **Dual-Channel Real-Time Audio Capture:**
  * **Interviewer Stream:** Captures system audio via `cpal` WASAPI loopback.
  * **Candidate Stream:** Concurrently captures the microphone input.
  * Resamples both channels to 16,000 Hz mono 32-bit float PCM.
* **Voice Activity Detection (VAD):**
  * Silero VAD energy/zero-crossing segmentation with 512-sample frame analysis.
  * Minimum speech duration threshold ($>300\text{ ms}$) and silence cutoff ($>800\text{ ms}$).
  * Real-time animated VU meters and speech indicator bulbs.
* **Dual-Mode Speech-to-Text (STT):**
  * **Offline/Local:** Quantized Whisper GGML models (`tiny.en`, `base.en`, `small.en`) running directly on device.
  * **Cloud Fallback:** Deepgram Nova-2 streaming API for zero CPU overhead.
  * Automatic speaker tagging (`Interviewer:` vs `Candidate:`).
* **LLM Prompt Synthesis & Auto-Triggering:**
  * Rolling sliding window of recent conversation turns.
  * Context injection: Candidate Resume/Bio, Target Role, and Job Description.
  * Behavioral rules: Concise, punchy answers (max 3 bullet points, code snippets, trade-offs).
  * **Auto-Trigger Heuristic:** Automatically generates hints when the interviewer completes a question.
  * Integrates with local **Ollama** (`llama3.2`, `mistral`, `deepseek-r1`) or cloud APIs (**OpenAI**, **Anthropic Claude**, **Groq**).
* **Cyber-Stealth HUD:**
  * Frameless, transparent, draggable anywhere on screen.
  * Live opacity slider (10% to 100%).
  * Click-through toggle (passes clicks through the HUD to underlying windows).
  * Global panic hotkey (`Ctrl + Shift + H`) to hide/restore instantly.

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────────┐
                                  │      System Audio (WASAPI)    │
                                  └───────────────┬───────────────┘
┌───────────────────────────────┐                 │
│      Microphone Input (Mic)   │                 ▼
└───────────────┬───────────────┘       [ cpal Audio Capture ]
                │                                 │
                ▼                                 ▼
         [ Mono 16kHz F32 ]              [ Mono 16kHz F32 ]
                │                                 │
                └───────────────┬─────────────────┘
                                │
                                ▼
                     [ Silero VAD Engine ]
               (Speech Probability & Segmentation)
                                │
                                ▼
                  [ Speech-to-Text Pipeline ]
               (Local Whisper GGML / Deepgram)
                                │
                                ▼
                 [ Conversation Context State ]
             (Speaker Tagged: Interviewer / Candidate)
                                │
                                ▼
                   [ LLM Orchestration Engine ]
           (Ollama Local / OpenAI / Anthropic / Groq)
                                │
                                ▼ (Tauri IPC Event Stream)
       ┌──────────────────────────────────────────────────┐
       │             GhostCue React 19 HUD Overlay        │
       │  - Anti-Capture (WDA_EXCLUDEFROMCAPTURE)         │
       │  - Frameless, Glassmorphic, Draggable, Resizable │
       │  - Click-Through Toggle & Global Panic Hotkey    │
       │  - Real-Time Live Transcripts & Streaming Hints  │
       └──────────────────────────────────────────────────┘
```

---

## ⌨️ Global Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| `Ctrl + Shift + H` | **Panic Hide / Restore** | Instantly hides the HUD window from view or restores it |
| `Ctrl + Shift + C` | **Click-Through Toggle** | Allows mouse clicks to pass through HUD to windows behind |
| `Ctrl + Shift + Space` | **Instant Hint** | Forces AI suggestion for latest conversation context |
| `Ctrl + Shift + K` | **Code Solution** | Generates clean algorithmic code with time/space complexity |
| `Ctrl + Shift + L` | **Clarifying Questions** | Generates strategic senior-level clarifying questions |
| `Ctrl + Shift + E` | **Deep Dive / Elaborate**| Generates architectural trade-offs and system design points |
| `Esc` | **Stop Stream / Close** | Aborts active AI streaming response or closes settings modal |

---

## 🚀 Quick Start

### Prerequisites
1. **Node.js**: v18+ (v22+ recommended)
2. **Rust & Cargo**: v1.75+ (`rustup`)
3. **C++ Build Tools**: Visual Studio 2022 C++ Build Tools (Windows) / Xcode CLI Tools (macOS) / `libwebkit2gtk` (Linux)
4. *(Optional for local LLM)* **Ollama**: Installed and running (`ollama run llama3.2`)

### 1. Clone & Install
```bash
git clone https://github.com/your-username/ghostcue.git
cd ghostcue
npm install
```

### 2. Run in Development Mode
```bash
# Runs Vite dev server and launches the native Tauri v2 HUD window
npm run tauri dev
```

### 3. Build Production Executable
```bash
npm run tauri build
```
The compiled stealth binary will be available in `src-tauri/target/release/`.

---

## ⚙️ Configuration

Open the HUD Settings modal (gear icon or `Ctrl+,`) to configure:

1. **Context & Persona:**
   * **Target Role:** e.g., *Staff Distributed Systems Engineer*.
   * **Job Description:** Paste key responsibilities, tech stack, and evaluation criteria.
   * **Candidate Resume:** Paste your background, key achievements, and strengths.
2. **Audio & VAD:**
   * Select specific Microphone and Loopback hardware devices.
   * Adjust speech detection sensitivity and silence cutoff timeouts.
3. **Models & Providers:**
   * **STT:** Switch between Local Whisper (download models in 1 click) and Deepgram.
   * **LLM:** Choose Ollama (local), OpenAI, Anthropic Claude, or Groq with your model name and API key.

---

## 🛡️ Stealth & Security

* **No Unsolicited Network Calls:** When configured with local Whisper and local Ollama, 100% of audio and inference stays strictly offline on your device.
* **Display Affinity Protection:** The OS window manager ensures no window bits are composited into screen-capturing framebuffers.

---

## 📄 License
MIT License. Built for ethical interview preparation, practice, and accessibility assistance.
