import React, { useEffect, useState, useRef } from "react";
import { AppConfig } from "./types/config";
import { TranscriptSegment } from "./types/transcript";
import { InterviewSession, AiLogEntry } from "./types/session";
import { DEFAULT_CONFIG, TauriApi } from "./services/tauriApi";
import { HudHeader, HudLayoutMode } from "./components/hud/HudHeader";
import { AudioMeters } from "./components/hud/AudioMeters";
import { TranscriptStream, isInterviewerQuestion } from "./components/hud/TranscriptStream";
import { SuggestionCard } from "./components/hud/SuggestionCard";
import { ActionControls } from "./components/hud/ActionControls";
import { SettingsModal } from "./components/settings/SettingsModal";
import { StartupSessionScreen } from "./components/session/StartupSessionScreen";
import { DirectoryPermissionModal } from "./components/common/DirectoryPermissionModal";
import { exportSessionAsTxt } from "./utils/exportTxt";
import { Sparkles, Maximize, ShieldCheck, ShieldAlert, Pause, Play } from "lucide-react";
import { I18nProvider } from "./i18n";

const STORAGE_SESSIONS_KEY = "ghostcue_interview_sessions";
const STORAGE_ACTIVE_SESSION_KEY = "ghostcue_active_session_id";
const STORAGE_LAYOUT_MODE_KEY = "ghostcue_layout_mode";

// Computes bit difference between two 64-bit hex hash strings
const getHexHammingDistance = (h1: string, h2: string): number => {
  try {
    if (!h1 || !h2) return 64;
    let b1 = BigInt(`0x${h1}`);
    let b2 = BigInt(`0x${h2}`);
    let xor = b1 ^ b2;
    let distance = 0;
    while (xor > 0n) {
      if (xor & 1n) distance++;
      xor >>= 1n;
    }
    return distance;
  } catch {
    return 64;
  }
};

// Computes word-level Jaccard similarity between two text snippets
const getProblemSimilarity = (textA: string, textB: string): number => {
  if (!textA || !textB) return 0;

  const extractWords = (t: string) => {
    return new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
    );
  };

  const setA = extractWords(textA);
  const setB = extractWords(textB);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [opacity, setOpacity] = useState<number>(0.94);
  const [clickThrough, setClickThrough] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const [hudToast, setHudToast] = useState<{ message: string; type?: "info" | "success" | "warning" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHudToast = (message: string, type: "info" | "success" | "warning" = "info") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setHudToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setHudToast(null);
    }, 3200);
  };

  // Layout mode and view state
  const [layoutMode, setLayoutMode] = useState<HudLayoutMode>(() => {
    return (localStorage.getItem(STORAGE_LAYOUT_MODE_KEY) as HudLayoutMode) || "split";
  });
  const [isCompactPill, setIsCompactPill] = useState<boolean>(false);

  // Audio Mute States
  const [micMuted, setMicMuted] = useState<boolean>(false);
  const [loopbackMuted, setLoopbackMuted] = useState<boolean>(false);

  // Sessions & Navigation Mode
  const [inLiveHud, setInLiveHud] = useState<boolean>(false);
  const [sessions, setSessions] = useState<InterviewSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Audio Levels
  const [micLevel, setMicLevel] = useState<number>(0);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [loopbackLevel, setLoopbackLevel] = useState<number>(0);
  const [loopbackActive, setLoopbackActive] = useState<boolean>(false);

  // Transcripts & AI State
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [suggestion, setSuggestion] = useState<string>("");
  const [aiLogs, setAiLogs] = useState<AiLogEntry[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string>("hint");
  const [llmError, setLlmError] = useState<string | null>(null);

  // Split view sizing
  const [splitPercent, setSplitPercent] = useState<number>(42);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Directory Access Permission Prompt (first-run)
  const [showDirectoryPermissionPrompt, setShowDirectoryPermissionPrompt] = useState<boolean>(() => {
    return !localStorage.getItem("ghostcue_directory_permission");
  });

  const [isGrantingDirectory, setIsGrantingDirectory] = useState<boolean>(false);

  const handleGrantDirectoryPermission = async () => {
    localStorage.setItem("ghostcue_directory_permission", "granted");
    setIsGrantingDirectory(true);
    try {
      const chosenDir = await TauriApi.selectDirectoryDialog();
      if (chosenDir && chosenDir.trim().length > 0) {
        const cleanPath = chosenDir.trim();
        const summary = await TauriApi.scanProjectDirectory(cleanPath);
        const newDirs = config.project_directories?.includes(cleanPath)
          ? config.project_directories
          : [...(config.project_directories || []), cleanPath];
        const newConfig: AppConfig = {
          ...config,
          project_directory: cleanPath,
          project_directories: newDirs,
          project_context: summary || "",
        };
        setConfig(newConfig);
        await TauriApi.saveConfig(newConfig);

        if (activeSessionId) {
          updateSessionsState((sessList) =>
            sessList.map((s) =>
              s.id === activeSessionId
                ? {
                    ...s,
                    projectDirectory: cleanPath,
                    projectDirectories: newDirs,
                    projectContext: summary || "",
                    lastActive: new Date().toISOString(),
                  }
                : s
            )
          );
        }
      }
    } catch (err) {
      console.warn("Directory grant & scan error:", err);
    } finally {
      setIsGrantingDirectory(false);
      setShowDirectoryPermissionPrompt(false);
    }
  };

  const handleDismissDirectoryPermission = () => {
    localStorage.setItem("ghostcue_directory_permission", "dismissed");
    setShowDirectoryPermissionPrompt(false);
  };

  const activePromptRef = useRef<{ id: string; action: string; query?: string; timestamp: string } | null>(null);

  // Layout persistence
  const handleChangeLayoutMode = (mode: HudLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem(STORAGE_LAYOUT_MODE_KEY, mode);
  };

  // Load persistent sessions from storage
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_SESSIONS_KEY);
      if (savedSessions) {
        const parsed: InterviewSession[] = JSON.parse(savedSessions);
        setSessions(parsed);
        const lastActiveId = localStorage.getItem(STORAGE_ACTIVE_SESSION_KEY);
        if (lastActiveId && parsed.some((s) => s.id === lastActiveId)) {
          setActiveSessionId(lastActiveId);
          const activeSess = parsed.find((s) => s.id === lastActiveId);
          if (activeSess) {
            setTranscripts(activeSess.transcripts || []);
            setAiLogs(activeSess.aiLogs || []);
            setSuggestion(activeSess.lastSuggestion || "");
          }
        } else if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
          setTranscripts(parsed[0].transcripts || []);
          setAiLogs(parsed[0].aiLogs || []);
          setSuggestion(parsed[0].lastSuggestion || "");
        }
      }
    } catch (e) {
      console.warn("Failed to parse saved sessions:", e);
    }
  }, []);

  const updateSessionsState = (updater: (prev: InterviewSession[]) => InterviewSession[]) => {
    setSessions((prev) => {
      const updated = updater(prev);
      try {
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn("Failed to persist sessions:", e);
      }
      return updated;
    });
  };

  const getProviderModel = (cfg: AppConfig) => {
    switch (cfg.llm_provider) {
      case "gemini":
        return cfg.gemini_model || "gemini-2.5-flash";
      case "ollama":
        return cfg.ollama_model || "qwen2.5-coder:7b";
      case "openai":
        return cfg.openai_model || "gpt-4o";
      case "anthropic":
        return cfg.anthropic_model || "claude-3-5-sonnet-20241022";
      case "groq":
        return cfg.openai_model || "llama-3.3-70b-versatile";
      case "deepseek":
        return cfg.deepseek_model || cfg.custom_model || "deepseek-chat";
      default:
        return cfg.custom_model || cfg.llm_provider;
    }
  };

  const saveAiLogEntry = (fullText: string, actionName?: string, queryText?: string) => {
    if (!fullText || fullText.trim().length === 0) return;

    const currentPrompt = activePromptRef.current;
    const entryId = currentPrompt?.id || `log-${Date.now()}`;
    const timestamp = currentPrompt?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const action = actionName || currentPrompt?.action || activeAction || "hint";
    const query = queryText || currentPrompt?.query;

    const newEntry: AiLogEntry = {
      id: entryId,
      timestamp,
      action,
      query,
      answer: fullText.trim(),
      provider: configRef.current.llm_provider,
      model: getProviderModel(configRef.current),
    };

    setAiLogs((prev) => {
      const idx = prev.findIndex((l) => l.id === entryId);
      let updatedList: AiLogEntry[];
      if (idx >= 0) {
        updatedList = [...prev];
        updatedList[idx] = newEntry;
      } else {
        updatedList = [...prev, newEntry];
      }

      if (activeSessionId) {
        updateSessionsState((sessList) =>
          sessList.map((s) =>
            s.id === activeSessionId
              ? { ...s, aiLogs: updatedList, lastSuggestion: fullText, lastActive: new Date().toISOString() }
              : s
          )
        );
      }
      return updatedList;
    });
  };

  const inLiveHudRef = useRef<boolean>(inLiveHud);
  useEffect(() => {
    inLiveHudRef.current = inLiveHud;
    if (inLiveHud) {
      TauriApi.startAudioCapture().catch(console.warn);
      if (configRef.current.focus_shield_enabled ?? true) {
        TauriApi.setFocusShield(true).catch(console.warn);
      }
    } else {
      TauriApi.stopAudioCapture().catch(console.warn);
      setMicLevel(0);
      setMicActive(false);
      setLoopbackLevel(0);
      setLoopbackActive(false);
      TauriApi.setFocusShield(false).catch(console.warn);
    }
  }, [inLiveHud]);

  useEffect(() => {
    if (isSettingsOpen) {
      TauriApi.setFocusShield(false).catch(console.warn);
    } else if (inLiveHud && (configRef.current.focus_shield_enabled ?? true)) {
      TauriApi.setFocusShield(true).catch(console.warn);
    }
  }, [isSettingsOpen, inLiveHud]);

  const configRef = useRef<AppConfig>(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const isStreamingRef = useRef<boolean>(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const layoutModeRef = useRef<HudLayoutMode>(layoutMode);
  useEffect(() => {
    layoutModeRef.current = layoutMode;
  }, [layoutMode]);

  const lastAutoAnsweredTurnRef = useRef<string | null>(null);
  const handleTriggerActionRef = useRef<((action: string, customQuery?: string, isManualInput?: boolean, preloadedImage?: string) => Promise<void>) | null>(null);
  const autoTriggerTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingAutoTriggerTurnRef = useRef<{ text: string; turnId: string } | null>(null);
  const liveOcrTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScreenHashRef = useRef<string | null>(null);
  const lastPromptedProblemTextRef = useRef<string | null>(null);

  const maybeAutoTrigger = (turnText: string, turnId?: string, speaker?: string) => {
    if (!inLiveHudRef.current || isPausedRef.current) return;
    if (!configRef.current.auto_trigger_enabled) return;

    // If Candidate speaks, cancel any pending auto-answer (candidate is already answering)
    if (speaker && speaker.toLowerCase() !== "interviewer") {
      if (autoTriggerTimerRef.current) {
        clearTimeout(autoTriggerTimerRef.current);
        autoTriggerTimerRef.current = null;
      }
      pendingAutoTriggerTurnRef.current = null;
      return;
    }

    if (isStreamingRef.current) return;

    const trimmed = turnText.trim();
    if (trimmed.length < 5) return;

    const turnKey = turnId || trimmed;
    if (lastAutoAnsweredTurnRef.current === turnKey) return;

    // Check if the current speech contains an interviewer question or prompt
    if (!isInterviewerQuestion(trimmed)) return;

    // Store latest question text
    pendingAutoTriggerTurnRef.current = { text: trimmed, turnId: turnKey };

    // Reset debounce timer: wait auto_trigger_delay_ms of conversational pause to ensure interviewer finished full thought
    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
    }

    const delayMs = Math.max(300, configRef.current.auto_trigger_delay_ms || 1500);

    autoTriggerTimerRef.current = setTimeout(() => {
      autoTriggerTimerRef.current = null;
      const pending = pendingAutoTriggerTurnRef.current;
      if (!pending) return;

      if (!inLiveHudRef.current || isPausedRef.current) return;
      if (!configRef.current.auto_trigger_enabled) return;
      if (isStreamingRef.current) return;

      const fullQuestion = pending.text.trim();
      if (fullQuestion.length < 6) return;
      if (!isInterviewerQuestion(fullQuestion)) return;
      if (lastAutoAnsweredTurnRef.current === pending.turnId) return;

      lastAutoAnsweredTurnRef.current = pending.turnId;

      if (layoutModeRef.current === "listen") {
        handleChangeLayoutMode("split");
      }

      if (handleTriggerActionRef.current) {
        handleTriggerActionRef.current("hint", fullQuestion, false);
      }
    }, delayMs);
  };

  // Init config & event listeners on mount
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    const init = async () => {
      try {
        const loadedConfig = await TauriApi.getConfig();
        setConfig(loadedConfig);
        configRef.current = loadedConfig;
        setOpacity(loadedConfig.opacity);
        setClickThrough(loadedConfig.click_through);
        await TauriApi.setFocusShield(loadedConfig.focus_shield_enabled ?? true);

        const u1 = await TauriApi.onTranscript((seg) => {
          if (!inLiveHudRef.current || isPausedRef.current) return;
          if (micMuted && seg.speaker !== "Interviewer") return;
          if (loopbackMuted && seg.speaker === "Interviewer") return;

          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.id === seg.id);
            let updatedList: TranscriptSegment[];
            if (idx >= 0) {
              updatedList = [...prev];
              updatedList[idx] = seg;
            } else {
              updatedList = [...prev, seg];
            }

            if (activeSessionId) {
              updateSessionsState((sessList) =>
                sessList.map((s) =>
                  s.id === activeSessionId
                    ? { ...s, transcripts: updatedList, lastActive: new Date().toISOString() }
                    : s
                )
              );
            }

            return updatedList;
          });

          // Auto-trigger AI answer whenever interviewer speaks
          maybeAutoTrigger(seg.text, seg.id, seg.speaker);
        });

        const u2 = await TauriApi.onMicLevel((ev) => {
          if (!inLiveHudRef.current || isPausedRef.current || micMuted) {
            setMicLevel(0);
            setMicActive(false);
          } else {
            setMicLevel(ev.level);
            setMicActive(ev.active);
          }
        });

        const u3 = await TauriApi.onLoopbackLevel((ev) => {
          if (!inLiveHudRef.current || isPausedRef.current || loopbackMuted) {
            setLoopbackLevel(0);
            setLoopbackActive(false);
          } else {
            setLoopbackLevel(ev.level);
            setLoopbackActive(ev.active);
          }
        });

        const u4 = await TauriApi.onLlmStart((ev: any) => {
          setIsStreaming(true);
          isStreamingRef.current = true;
          setSelectedLogId(null);
          setSuggestion("");
          setLlmError(null);
          setActiveAction(ev.action);
          if (ev.query && (!activePromptRef.current || !activePromptRef.current.query)) {
            activePromptRef.current = {
              id: `log-${Date.now()}`,
              action: ev.action,
              query: ev.query,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            };
          }
        });

        const u5 = await TauriApi.onLlmToken((ev) => {
          setSuggestion((prev) => {
            if (prev.startsWith("📸") || prev.startsWith("🧠")) {
              return ev.token;
            }
            return prev + ev.token;
          });
        });

        const u6 = await TauriApi.onLlmComplete((ev: any) => {
          setIsStreaming(false);
          isStreamingRef.current = false;
          const fullText = ev.text || ev.full_text;
          if (fullText) {
            setSuggestion(fullText);
            saveAiLogEntry(fullText, ev.action, ev.query);
          }
        });

        const u7 = await TauriApi.onLlmError((ev) => {
          setIsStreaming(false);
          isStreamingRef.current = false;
          setLlmError(ev.error);
        });

        unlistens = [u1, u2, u3, u4, u5, u6, u7];
      } catch (err) {
        console.error("Initialization error:", err);
      }
    };

    init();

    const pollInterval = setInterval(async () => {
      try {
        if (!inLiveHudRef.current || isPausedRef.current) {
          setMicLevel(0);
          setMicActive(false);
          setLoopbackLevel(0);
          setLoopbackActive(false);
          return;
        }

        const lv = await TauriApi.getAudioLevels();
        if (!micMuted && (lv.mic_level > 0 || lv.mic_active)) {
          setMicLevel(lv.mic_level);
          setMicActive(lv.mic_active);
        } else if (!micMuted) {
          setMicLevel((prev) => (prev > 0.02 ? prev * 0.8 : 0));
          setMicActive(false);
        }

        if (!loopbackMuted && (lv.loopback_level > 0 || lv.loopback_active)) {
          setLoopbackLevel(lv.loopback_level);
          setLoopbackActive(lv.loopback_active);
        } else if (!loopbackMuted) {
          setLoopbackLevel((prev) => (prev > 0.02 ? prev * 0.8 : 0));
          setLoopbackActive(false);
        }

        const history = await TauriApi.getTranscriptHistory();
        if (history && history.length > 0) {
          setTranscripts((prev) => {
            const hasNewItem = prev.length !== history.length || (prev.length > 0 && prev[prev.length - 1].id !== history[history.length - 1].id);
            if (hasNewItem) {
              const latest = history[history.length - 1];
              if (latest) {
                maybeAutoTrigger(latest.text, latest.id, latest.speaker);
              }

              if (activeSessionId) {
                updateSessionsState((sessList) =>
                  sessList.map((s) =>
                    s.id === activeSessionId
                      ? { ...s, transcripts: history, lastActive: new Date().toISOString() }
                      : s
                  )
                );
              }
              return history;
            }
            return prev;
          });
        }
      } catch (_) {}
    }, 100);

    return () => {
      unlistens.forEach((u) => u());
      clearInterval(pollInterval);
      if (autoTriggerTimerRef.current) {
        clearTimeout(autoTriggerTimerRef.current);
      }
      if (liveOcrTimerRef.current) {
        clearInterval(liveOcrTimerRef.current);
        liveOcrTimerRef.current = null;
      }
    };
  }, [activeSessionId, micMuted, loopbackMuted]);

  // Periodic Live Screen OCR Autonomous Scanner
  useEffect(() => {
    if (!inLiveHud || isPaused || !config.live_ocr_enabled) {
      if (liveOcrTimerRef.current) {
        clearInterval(liveOcrTimerRef.current);
        liveOcrTimerRef.current = null;
      }
      return;
    }

    const intervalSecs = Math.max(3, config.live_ocr_interval_secs || 10);
    const intervalMs = intervalSecs * 1000;

    const performLiveOcrScan = async () => {
      if (!inLiveHudRef.current || isPausedRef.current || isStreamingRef.current || !configRef.current.live_ocr_enabled) {
        return;
      }

      try {
        const captureRes = await TauriApi.captureScreenForOcr();
        if (!captureRes) return;

        // Perceptual hash diff check to skip identical screens
        const smartDiff = configRef.current.live_ocr_smart_diff ?? true;
        if (smartDiff && captureRes.screen_hash && lastScreenHashRef.current) {
          const distance = getHexHammingDistance(lastScreenHashRef.current, captureRes.screen_hash);
          if (distance < 4) {
            return;
          }
        }
        lastScreenHashRef.current = captureRes.screen_hash || null;

        // Text similarity check against previous scan
        const currentText = captureRes.extracted_text?.trim() || "";
        if (currentText.length >= 15) {
          if (lastPromptedProblemTextRef.current) {
            const similarity = getProblemSimilarity(currentText, lastPromptedProblemTextRef.current);
            if (similarity >= 0.70) {
              console.log(`[Live OCR] Same problem detected on screen (${(similarity * 100).toFixed(1)}% match). Skipping duplicate request.`);
              return;
            }
          }
        }

        if (!inLiveHudRef.current || isPausedRef.current || isStreamingRef.current) {
          return;
        }

        if (layoutModeRef.current === "listen") {
          handleChangeLayoutMode("split");
        }

        // Send extracted text as query if available, otherwise send screenshot
        if (handleTriggerActionRef.current) {
          if (currentText.length >= 15) {
            lastPromptedProblemTextRef.current = currentText;
            const query = `[Visible Screen Problem & Code (Extracted Locally via Native OCR)]:\n\n${currentText}`;
            handleTriggerActionRef.current("vision", query, false, undefined);
          } else if (captureRes.base64_image) {
            handleTriggerActionRef.current("vision", undefined, false, captureRes.base64_image);
          }
        }
      } catch (err) {
        console.warn("Live Screen OCR scan error:", err);
      }
    };

    // Initial scan after short delay
    const initialTimer = setTimeout(() => {
      performLiveOcrScan();
    }, 1500);

    liveOcrTimerRef.current = setInterval(performLiveOcrScan, intervalMs);

    return () => {
      clearTimeout(initialTimer);
      if (liveOcrTimerRef.current) {
        clearInterval(liveOcrTimerRef.current);
        liveOcrTimerRef.current = null;
      }
    };
  }, [inLiveHud, isPaused, config.live_ocr_enabled, config.live_ocr_interval_secs, config.live_ocr_smart_diff]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Ctrl + Shift + H: Panic Hide
      if (e.ctrlKey && e.shiftKey && (e.key === "H" || e.key === "h")) {
        e.preventDefault();
        TauriApi.toggleHudVisibility();
        return;
      }

      // Ctrl + Shift + C: Toggle Click Through
      if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        e.preventDefault();
        handleToggleClickThrough();
        return;
      }

      // Ctrl + Shift + P: Toggle Pause / Resume
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      // Ctrl + Shift + M: Toggle Mic Mute
      if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        setMicMuted((prev) => !prev);
        return;
      }

      // Ctrl + Shift + F: Toggle Focus Shield
      if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        handleToggleFocusShield();
        return;
      }

      // Open Settings / Shortcuts (? or Ctrl+/ or Ctrl+,)
      if (!isTyping && (e.key === "?" || (e.ctrlKey && e.key === "/") || (e.ctrlKey && e.key === ","))) {
        e.preventDefault();
        setIsSettingsOpen(true);
        return;
      }

      if (isTyping) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

      if (!inLiveHud) return;

      // Ctrl + Shift + Space: Hint (STAR Answer)
      if (e.ctrlKey && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        handleTriggerAction("hint");
        return;
      }

      // Ctrl + Shift + K: Code Solution
      if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        handleTriggerAction("code");
        return;
      }

      // Ctrl + Shift + L: Clarifying Questions
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        handleTriggerAction("clarify");
        return;
      }

      // Ctrl + Shift + E: System Design / Deep Dive
      if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        handleTriggerAction("elaborate");
        return;
      }

      // Ctrl + Shift + S: Vision / Screen Problem
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        handleTriggerAction("vision");
        return;
      }

      // Ctrl + Shift + O: Toggle Live Screen OCR (Auto-Scan)
      if (e.ctrlKey && e.shiftKey && (e.key === "O" || e.key === "o")) {
        e.preventDefault();
        handleToggleLiveOcr();
        return;
      }

      // Ctrl + Shift + T: Stealth Typer (simulates keyboard typing)
      if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        handleStealthTypeLatestCode();
        return;
      }

      // Esc: Stop generation, cancel stealth typing, or close modal
      if (e.key === "Escape") {
        TauriApi.cancelStealthTyping().catch(console.warn);
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
        } else if (isStreaming) {
          handleCancelAi();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inLiveHud, isStreaming, isSettingsOpen, clickThrough, micMuted]);

  // Mouse drag handler for split resizer
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const newPercent = (relativeY / rect.height) * 100;
      setSplitPercent(Math.min(80, Math.max(15, newPercent)));
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    if (isDraggingSplit) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingSplit]);

  // Session Operations
  const handleSelectSession = (sessionId: string) => {
    TauriApi.clearTranscriptHistory().catch(console.warn);
    setActiveSessionId(sessionId);
    localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, sessionId);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession) {
      setTranscripts(targetSession.transcripts || []);
      setAiLogs(targetSession.aiLogs || []);
      setSuggestion(targetSession.lastSuggestion || "");
      setSelectedLogId(null);
      const newConfig: AppConfig = {
        ...configRef.current,
        target_role: targetSession.role || configRef.current.target_role,
        company_name: targetSession.company || "",
        interview_title: targetSession.title || "",
        job_description: targetSession.jobDescription || configRef.current.job_description || "",
        candidate_resume: targetSession.candidateResume || configRef.current.candidate_resume || "",
        project_directory: targetSession.projectDirectory || configRef.current.project_directory || "",
        project_directories: targetSession.projectDirectories || (targetSession.projectDirectory ? [targetSession.projectDirectory] : configRef.current.project_directories || []),
        project_context: targetSession.projectContext || configRef.current.project_context || "",
      };
      configRef.current = newConfig;
      setConfig(newConfig);
      TauriApi.saveConfig(newConfig);
    }
  };

  const handleCreateSession = (data: Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts" | "aiLogs">) => {
    TauriApi.clearTranscriptHistory().catch(console.warn);
    const newSession: InterviewSession = {
      ...data,
      id: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      transcripts: [],
      aiLogs: [],
    };
    updateSessionsState((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, newSession.id);
    setTranscripts([]);
    setAiLogs([]);
    setSuggestion("");
    setSelectedLogId(null);
    const newConfig: AppConfig = {
      ...configRef.current,
      target_role: data.role || configRef.current.target_role,
      company_name: data.company || "",
      interview_title: data.title || "",
      job_description: data.jobDescription || configRef.current.job_description || "",
      candidate_resume: data.candidateResume || configRef.current.candidate_resume || "",
      project_directory: data.projectDirectory || configRef.current.project_directory || "",
      project_directories: data.projectDirectories || (data.projectDirectory ? [data.projectDirectory] : configRef.current.project_directories || []),
      project_context: data.projectContext || configRef.current.project_context || "",
    };
    configRef.current = newConfig;
    setConfig(newConfig);
    TauriApi.saveConfig(newConfig);
  };

  const handleStartLiveHud = () => {
    TauriApi.clearTranscriptHistory().catch(console.warn);
    setInLiveHud(true);
  };

  const handleDeleteSession = (sessionId: string) => {
    updateSessionsState((prev) => prev.filter((s) => s.id !== sessionId));
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      localStorage.removeItem(STORAGE_ACTIVE_SESSION_KEY);
      setTranscripts([]);
      setAiLogs([]);
      setSuggestion("");
      setSelectedLogId(null);
    }
  };

  const handleExportActiveSessionTxt = async () => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    const currentSession: InterviewSession = {
      id: activeSessionId || `session-${Date.now()}`,
      title: activeSession?.title || config.interview_title || "Interview Session",
      role: activeSession?.role || config.target_role || "Candidate",
      company: activeSession?.company || config.company_name,
      jobDescription: activeSession?.jobDescription || config.job_description,
      candidateResume: activeSession?.candidateResume || config.candidate_resume,
      projectDirectory: activeSession?.projectDirectory || config.project_directory,
      projectDirectories: activeSession?.projectDirectories || config.project_directories,
      projectContext: activeSession?.projectContext || config.project_context,
      createdAt: activeSession?.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
      transcripts: transcripts,
      aiLogs: aiLogs,
    };
    await exportSessionAsTxt(currentSession, config);
  };

  const handleClearAiLogs = () => {
    setAiLogs([]);
    setSelectedLogId(null);
    setSuggestion("");
    if (activeSessionId) {
      updateSessionsState((sessList) =>
        sessList.map((s) => (s.id === activeSessionId ? { ...s, aiLogs: [], lastSuggestion: "" } : s))
      );
    }
  };

  const handleDeleteAiLog = (id: string) => {
    setAiLogs((prev) => {
      const updated = prev.filter((l) => l.id !== id);
      if (selectedLogId === id) {
        setSelectedLogId(null);
      }
      if (activeSessionId) {
        updateSessionsState((sessList) =>
          sessList.map((s) => (s.id === activeSessionId ? { ...s, aiLogs: updated } : s))
        );
      }
      return updated;
    });
  };

  // Actions
  const handleToggleClickThrough = async () => {
    const next = !clickThrough;
    setClickThrough(next);
    await TauriApi.setClickThrough(next);
  };

  const handleToggleAntiCapture = async () => {
    const next = !config.anti_capture_enabled;
    const updated = await TauriApi.setAntiCapture(next);
    const newConfig = { ...config, anti_capture_enabled: updated };
    setConfig(newConfig);
    await TauriApi.saveConfig(newConfig);
  };

  const handleToggleFocusShield = async () => {
    const currentState = configRef.current.focus_shield_enabled ?? true;
    const next = !currentState;
    const updated = await TauriApi.setFocusShield(next);
    const newConfig = { ...configRef.current, focus_shield_enabled: updated };
    configRef.current = newConfig;
    setConfig(newConfig);
    await TauriApi.saveConfig(newConfig);
    showHudToast(
      updated
        ? "Focus Shield ON: Clicks will not steal focus from exam"
        : "Focus Shield OFF: Typing enabled in GhostCue",
      updated ? "success" : "warning"
    );
  };

  const handleStealthTypeLatestCode = async () => {
    const textToSearch = suggestion || (aiLogs.length > 0 ? aiLogs[aiLogs.length - 1].answer : "");
    const codeMatch = /```[a-zA-Z0-9_+#.-]*\n([\s\S]*?)```/.exec(textToSearch);
    if (!codeMatch || !codeMatch[1]?.trim()) {
      return; // Only type if code block is present
    }
    const codeToType = codeMatch[1].trimEnd();
    if (codeToType.length > 0 && codeToType.length < 5000) {
      try {
        await TauriApi.typeTextStealth(codeToType);
      } catch (err) {
        console.error("Stealth typer hotkey error:", err);
      }
    }
  };

  const handleToggleAutoTrigger = async () => {
    const next = !configRef.current.auto_trigger_enabled;
    const newConfig = { ...configRef.current, auto_trigger_enabled: next };
    configRef.current = newConfig;
    setConfig(newConfig);
    await TauriApi.saveConfig(newConfig);
  };

  const handleToggleLiveOcr = async () => {
    const next = !configRef.current.live_ocr_enabled;
    const newConfig = { ...configRef.current, live_ocr_enabled: next };
    configRef.current = newConfig;
    setConfig(newConfig);
    if (next) {
      lastScreenHashRef.current = null;
      lastPromptedProblemTextRef.current = null;
    }
    await TauriApi.saveConfig(newConfig);
    showHudToast(
      next
        ? `Live Screen OCR ON (Scanning every ${newConfig.live_ocr_interval_secs || 10}s)`
        : "Live Screen OCR OFF",
      next ? "success" : "info"
    );
  };

  const handleTogglePause = async () => {
    const next = !isPaused;
    setIsPaused(next);
    isPausedRef.current = next;

    if (next) {
      if (autoTriggerTimerRef.current) {
        clearTimeout(autoTriggerTimerRef.current);
        autoTriggerTimerRef.current = null;
      }
      pendingAutoTriggerTurnRef.current = null;

      // Immediate freeze: cancel active generation and halt audio capture
      await TauriApi.cancelAiSuggestion();
      setIsStreaming(false);
      isStreamingRef.current = false;
      try {
        await TauriApi.stopAudioCapture();
      } catch (err) {
        console.warn("Audio pause error:", err);
      }
      setMicLevel(0);
      setMicActive(false);
      setLoopbackLevel(0);
      setLoopbackActive(false);
    } else {
      // Resume audio capture
      try {
        await TauriApi.startAudioCapture();
      } catch (err) {
        console.warn("Audio resume error:", err);
      }
    }
  };

  const handleClearTranscripts = async () => {
    await TauriApi.clearTranscriptHistory();
    setTranscripts([]);
    if (activeSessionId) {
      updateSessionsState((sessList) =>
        sessList.map((s) => (s.id === activeSessionId ? { ...s, transcripts: [] } : s))
      );
    }
  };

  const handleTriggerAction = async (action: string, customQuery?: string, isManualInput: boolean = false, preloadedImage?: string) => {
    const hasQuery = customQuery && customQuery.trim().length > 0;

    let promptQuery = customQuery?.trim();
    if (!promptQuery) {
      const lastInterviewerTurn = [...transcripts].reverse().find((t) => t.speaker === "Interviewer");
      if (lastInterviewerTurn) {
        promptQuery = lastInterviewerTurn.text.trim();
      }
    }

    const newLogId = `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    activePromptRef.current = {
      id: newLogId,
      action,
      query: promptQuery,
      timestamp,
    };

    setActiveAction(action);
    setSelectedLogId(null);
    setLlmError(null);
    setSuggestion("");
    setIsStreaming(true);
    isStreamingRef.current = true;

    if (hasQuery && isManualInput) {
      const manualSegment: TranscriptSegment = {
        id: `manual-${Date.now()}`,
        speaker: "Candidate",
        text: customQuery!.trim(),
        timestamp,
        is_final: true,
        confidence: 1.0,
        duration_secs: 0.5,
      };
      setTranscripts((prev) => [...prev, manualSegment]);
    }

    // Include recent Q&A turns from this session for context
    const pastAnswersPayload = aiLogs.slice(-6).map((log) => ({
      action: log.action,
      query: log.query || "",
      answer: log.answer,
    }));

    let base64Image: string | undefined = preloadedImage;

    if (action === "vision") {
      if (!customQuery && !base64Image) {
        setSuggestion("🔍 Parsing screen with native local OCR (0 vision tokens)...");
        try {
          const captureRes = await TauriApi.captureScreenForOcr();
          if (captureRes) {
            if (captureRes.screen_hash) {
              lastScreenHashRef.current = captureRes.screen_hash;
            }
            const extracted = captureRes.extracted_text?.trim() || "";
            if (extracted.length >= 15) {
              lastPromptedProblemTextRef.current = extracted;
              promptQuery = `[Visible Screen Problem & Code (Extracted Locally via Native OCR)]:\n\n${extracted}`;
              customQuery = promptQuery;
              base64Image = undefined; // Prefer extracted text over image payload
              setSuggestion(`🧠 Solving extracted problem (${extracted.length} chars) with ${configRef.current.llm_provider || "AI"}...`);
            } else if (captureRes.base64_image) {
              base64Image = captureRes.base64_image;
              setSuggestion(`📸 Analyzing diagram screenshot with ${configRef.current.llm_provider || "AI"}...`);
            }
          }
        } catch (capErr: any) {
          console.warn("Screen capture failed:", capErr);
          setLlmError(`Screen capture failed: ${capErr?.toString() || "Unknown error"}. Check display permissions.`);
          setIsStreaming(false);
          isStreamingRef.current = false;
          return;
        }
      } else if (customQuery) {
        setSuggestion(`🧠 Solving extracted problem with ${configRef.current.llm_provider || "AI"}...`);
      } else {
        setSuggestion(`📸 Analyzing screen with ${configRef.current.llm_provider || "AI"}...`);
      }
    }

    try {
      const res = await TauriApi.generateAiSuggestion(action, customQuery, pastAnswersPayload, base64Image);
      if (res && res.trim().length > 0) {
        setSuggestion((prev) => {
          if (!prev || prev.startsWith("📸") || prev.startsWith("🧠")) {
            return res;
          }
          return prev;
        });
        saveAiLogEntry(res, action, promptQuery);
      }
    } catch (err: any) {
      console.error("AI Generation error:", err);
      setLlmError(err?.toString() || "Failed to generate AI suggestion. Check API key in settings.");
    } finally {
      setIsStreaming(false);
      isStreamingRef.current = false;
    }
  };

  handleTriggerActionRef.current = handleTriggerAction;
  useEffect(() => {
    handleTriggerActionRef.current = handleTriggerAction;
  }, [handleTriggerAction]);

  const handleCancelAi = async () => {
    if (autoTriggerTimerRef.current) {
      clearTimeout(autoTriggerTimerRef.current);
      autoTriggerTimerRef.current = null;
    }
    pendingAutoTriggerTurnRef.current = null;
    await TauriApi.cancelAiSuggestion();
    setIsStreaming(false);
    isStreamingRef.current = false;
  };

  const handleSaveSettings = async (newConfig: AppConfig) => {
    const saved = await TauriApi.saveConfig(newConfig);
    configRef.current = saved;
    setConfig(saved);
    setOpacity(saved.opacity);
    await TauriApi.setAntiCapture(saved.anti_capture_enabled);
    if (inLiveHud) {
      await TauriApi.setFocusShield(saved.focus_shield_enabled ?? true);
      try {
        await TauriApi.stopAudioCapture();
        await TauriApi.startAudioCapture();
      } catch (err) {
        console.warn("Audio restart error:", err);
      }
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // If not in live HUD mode, show Startup / Session Hub Screen
  if (!inLiveHud) {
    return (
      <I18nProvider
        initialLocale={config.ui_language}
        onLocaleChange={(l) => setConfig((prev) => ({ ...prev, ui_language: l }))}
      >
        <main className="relative flex flex-col h-screen w-screen overflow-hidden font-sans">
          <StartupSessionScreen
            sessions={sessions}
            activeSessionId={activeSessionId}
            config={config}
            onSelectSession={handleSelectSession}
            onCreateSession={handleCreateSession}
            onDeleteSession={handleDeleteSession}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onStartLiveHud={handleStartLiveHud}
          />
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            onSave={handleSaveSettings}
            inLiveHud={inLiveHud}
          />
          <DirectoryPermissionModal
            isOpen={showDirectoryPermissionPrompt}
            onGrant={handleGrantDirectoryPermission}
            onDismiss={handleDismissDirectoryPermission}
            isGranting={isGrantingDirectory}
          />
        </main>
      </I18nProvider>
    );
  }

  // Compact Pill HUD Mode
  if (isCompactPill) {
    return (
      <I18nProvider
        initialLocale={config.ui_language}
        onLocaleChange={(l) => setConfig((prev) => ({ ...prev, ui_language: l }))}
      >
        <main
          data-tauri-drag-region
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest("button, [role='button']")) {
              TauriApi.startDragging();
            }
          }}
          className="relative flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-700 rounded-full shadow-2xl select-none font-sans"
          style={{ backgroundColor: `rgba(15, 23, 42, ${opacity})` }}
        >
          {/* Floating Notification Toast */}
          {hudToast && (
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 z-50 px-3 py-1 bg-slate-900/95 border border-indigo-500/60 rounded-full shadow-xl text-[11px] font-semibold text-slate-100 flex items-center gap-1.5 pointer-events-none whitespace-nowrap animate-in fade-in">
              <ShieldAlert className={`w-3 h-3 ${hudToast.type === 'success' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span>{hudToast.message}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-slate-300 font-semibold px-2 py-0.5 bg-slate-800 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>GhostCue</span>
            </div>

            <div className="flex items-center gap-1.5 px-2 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${loopbackActive ? "bg-sky-400 animate-pulse" : "bg-slate-600"}`}
                title="Interviewer voice activity"
              />
              <span
                className={`w-2 h-2 rounded-full ${micActive ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`}
                title="Candidate voice activity"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Pause button in compact pill */}
            <button
              type="button"
              onClick={handleTogglePause}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full transition-colors ${
                isPaused
                  ? "bg-amber-500/30 text-amber-300 border border-amber-400/80 animate-pulse"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300"
              }`}
              title={isPaused ? "Resume (Ctrl+Shift+P)" : "Pause (Ctrl+Shift+P)"}
            >
              {isPaused ? <Play className="w-3 h-3 text-amber-400 fill-amber-400" /> : <Pause className="w-3 h-3 text-slate-400" />}
              <span>{isPaused ? "Resume" : "Pause"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleTriggerAction("hint")}
              disabled={isStreaming || isPaused}
              className="flex items-center gap-1 px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
              title="Instant Answer (Ctrl+Shift+Space)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Answer</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCompactPill(false)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full transition-colors"
              title="Expand Full HUD"
            >
              <Maximize className="w-3.5 h-3.5" />
            </button>
          </div>
        </main>
      </I18nProvider>
    );
  }

  return (
    <I18nProvider
      initialLocale={config.ui_language}
      onLocaleChange={(l) => setConfig((prev) => ({ ...prev, ui_language: l }))}
    >
      <main
        className="relative flex flex-col h-screen w-screen overflow-hidden select-none font-sans rounded-xl border border-slate-700/60 shadow-2xl"
        style={{
          backgroundColor: `rgba(11, 16, 27, ${opacity})`,
        }}
      >
        {/* 1. HUD Header */}
        <HudHeader
          config={config}
          opacity={opacity}
          onToggleAntiCapture={handleToggleAntiCapture}
          onToggleFocusShield={handleToggleFocusShield}
          onToggleAutoTrigger={handleToggleAutoTrigger}
          onToggleLiveOcr={handleToggleLiveOcr}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSessions={() => setInLiveHud(false)}
          layoutMode={layoutMode}
          onChangeLayoutMode={handleChangeLayoutMode}
          isCompactPill={isCompactPill}
          onToggleCompactPill={() => setIsCompactPill((prev) => !prev)}
          activeProvider={config.llm_provider}
          sessionTitle={activeSession?.title}
          isPaused={isPaused}
          onTogglePause={handleTogglePause}
        />

        {/* Floating Notification Toast */}
        {hudToast && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 bg-slate-900/95 border border-indigo-500/60 rounded-full shadow-2xl text-xs font-semibold text-slate-100 flex items-center gap-2 pointer-events-none backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
            <ShieldAlert className={`w-3.5 h-3.5 ${hudToast.type === 'success' ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{hudToast.message}</span>
          </div>
        )}

        {/* 2. Audio Level Strip */}
        <AudioMeters
          micLevel={micLevel}
          loopbackLevel={loopbackLevel}
          micActive={micActive}
          loopbackActive={loopbackActive}
          sensitivity={config.vad_sensitivity}
          micMuted={micMuted}
          loopbackMuted={loopbackMuted}
          onToggleMicMute={() => setMicMuted((prev) => !prev)}
          onToggleLoopbackMute={() => setLoopbackMuted((prev) => !prev)}
          isPaused={isPaused}
        />

        {/* 3. Main Workspace based on Layout Mode */}
        {layoutMode === "split" ? (
          <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden bg-transparent relative">
            {/* Upper: Transcript Stream */}
            <div style={{ height: `${splitPercent}%` }} className="overflow-hidden flex flex-col">
              <TranscriptStream
                transcripts={transcripts}
                onClear={handleClearTranscripts}
                onAskAiAboutTurn={(text: string) => handleTriggerAction("hint", text, false)}
                autoTriggerEnabled={config.auto_trigger_enabled}
                onToggleAutoTrigger={handleToggleAutoTrigger}
                aiLogs={aiLogs}
                onSelectAiAnswer={(logId) => setSelectedLogId(logId)}
                onExportTxt={handleExportActiveSessionTxt}
              />
            </div>

            {/* Split Resizer Handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDraggingSplit(true);
              }}
              className="group relative h-2 bg-slate-900 hover:bg-slate-800 cursor-row-resize flex items-center justify-center border-y border-slate-800 transition-colors z-20 select-none"
              title="Drag to resize panels"
            >
              <div className="w-12 h-1 bg-slate-600 group-hover:bg-sky-400 rounded-full transition-colors" />
            </div>

            {/* Lower: AI Suggestion & Code Studio */}
            <div style={{ height: `${100 - splitPercent}%` }} className="overflow-hidden flex flex-col min-h-0">
              <SuggestionCard
                content={suggestion}
                isStreaming={isStreaming}
                activeAction={activeAction}
                provider={config.llm_provider}
                model={getProviderModel(config)}
                error={llmError}
                onRetry={() => handleTriggerAction(activeAction, undefined, false)}
                aiLogs={aiLogs}
                selectedLogId={selectedLogId}
                onSelectLog={(id) => setSelectedLogId(id)}
                onDeleteLog={handleDeleteAiLog}
                onClearLogs={handleClearAiLogs}
                onExportTxt={handleExportActiveSessionTxt}
              />
            </div>
          </div>
        ) : layoutMode === "listen" ? (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <TranscriptStream
              transcripts={transcripts}
              onClear={handleClearTranscripts}
              onAskAiAboutTurn={(text: string) => {
                setLayoutMode("split");
                handleTriggerAction("hint", text, false);
              }}
              autoTriggerEnabled={config.auto_trigger_enabled}
              onToggleAutoTrigger={handleToggleAutoTrigger}
              aiLogs={aiLogs}
              onSelectAiAnswer={(logId) => {
                setSelectedLogId(logId);
                setLayoutMode("split");
              }}
              onExportTxt={handleExportActiveSessionTxt}
            />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <SuggestionCard
              content={suggestion}
              isStreaming={isStreaming}
              activeAction={activeAction}
              provider={config.llm_provider}
              model={getProviderModel(config)}
              error={llmError}
              onRetry={() => handleTriggerAction(activeAction, undefined, false)}
              aiLogs={aiLogs}
              selectedLogId={selectedLogId}
              onSelectLog={(id) => setSelectedLogId(id)}
              onDeleteLog={handleDeleteAiLog}
              onClearLogs={handleClearAiLogs}
              onExportTxt={handleExportActiveSessionTxt}
            />
          </div>
        )}

        {/* 4. Bottom Action Dock & Prompt Bar */}
        <ActionControls
          isStreaming={isStreaming}
          onTriggerAction={(action, query) => handleTriggerAction(action, query, true)}
          onCancel={handleCancelAi}
        />

        {/* 5. Settings Modal (Includes Hotkeys & Shortcuts guide) */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          config={config}
          onSave={handleSaveSettings}
          inLiveHud={inLiveHud}
        />

        {/* 7. Directory Access Permission Modal */}
        <DirectoryPermissionModal
          isOpen={showDirectoryPermissionPrompt}
          onGrant={handleGrantDirectoryPermission}
          onDismiss={handleDismissDirectoryPermission}
          isGranting={isGrantingDirectory}
        />
      </main>
    </I18nProvider>
  );
};
