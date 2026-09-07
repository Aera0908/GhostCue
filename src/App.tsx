import React, { useEffect, useState, useRef } from "react";
import { AppConfig } from "./types/config";
import { TranscriptSegment } from "./types/transcript";
import { InterviewSession, AiLogEntry } from "./types/session";
import { DEFAULT_CONFIG, TauriApi } from "./services/tauriApi";
import { HudHeader, HudLayoutMode, FontScale } from "./components/hud/HudHeader";
import { AudioMeters } from "./components/hud/AudioMeters";
import { TranscriptStream } from "./components/hud/TranscriptStream";
import { SuggestionCard } from "./components/hud/SuggestionCard";
import { ActionControls } from "./components/hud/ActionControls";
import { SettingsModal } from "./components/settings/SettingsModal";
import { StartupSessionScreen } from "./components/session/StartupSessionScreen";
import { DirectoryPermissionModal } from "./components/common/DirectoryPermissionModal";
import { exportSessionAsTxt } from "./utils/exportTxt";
import { Sparkles, Maximize, ShieldCheck } from "lucide-react";
import { I18nProvider } from "./i18n";

const STORAGE_SESSIONS_KEY = "ghostcue_interview_sessions";
const STORAGE_ACTIVE_SESSION_KEY = "ghostcue_active_session_id";
const STORAGE_FONT_SCALE_KEY = "ghostcue_font_scale";
const STORAGE_LAYOUT_MODE_KEY = "ghostcue_layout_mode";

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [opacity, setOpacity] = useState<number>(0.94);
  const [clickThrough, setClickThrough] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Pluely-style User-side Modes & Accessibility
  const [layoutMode, setLayoutMode] = useState<HudLayoutMode>(() => {
    return (localStorage.getItem(STORAGE_LAYOUT_MODE_KEY) as HudLayoutMode) || "split";
  });
  const [fontScale, setFontScale] = useState<FontScale>(() => {
    return (localStorage.getItem(STORAGE_FONT_SCALE_KEY) as FontScale) || "md";
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

  const handleGrantDirectoryPermission = () => {
    localStorage.setItem("ghostcue_directory_permission", "granted");
    setShowDirectoryPermissionPrompt(false);
  };

  const handleDismissDirectoryPermission = () => {
    localStorage.setItem("ghostcue_directory_permission", "dismissed");
    setShowDirectoryPermissionPrompt(false);
  };

  const activePromptRef = useRef<{ id: string; action: string; query?: string; timestamp: string } | null>(null);

  // Layout & Font Scale persistence
  const handleChangeLayoutMode = (mode: HudLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem(STORAGE_LAYOUT_MODE_KEY, mode);
  };

  const handleChangeFontScale = (scale: FontScale) => {
    setFontScale(scale);
    localStorage.setItem(STORAGE_FONT_SCALE_KEY, scale);
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
      case "ollama":
        return cfg.ollama_model;
      case "openai":
        return cfg.openai_model;
      case "anthropic":
        return cfg.anthropic_model;
      case "groq":
        return cfg.openai_model || "llama-3.3-70b-versatile";
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
      provider: config.llm_provider,
      model: getProviderModel(config),
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

  // Init config & event listeners on mount
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    const init = async () => {
      try {
        const loadedConfig = await TauriApi.getConfig();
        setConfig(loadedConfig);
        setOpacity(loadedConfig.opacity);
        setClickThrough(loadedConfig.click_through);

        await TauriApi.startAudioCapture();

        const u1 = await TauriApi.onTranscript((seg) => {
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
          if (config.auto_trigger_enabled && seg.speaker === "Interviewer" && seg.text.trim().length > 3 && !isStreaming) {
            handleTriggerAction("hint", seg.text, false);
          }
        });

        const u2 = await TauriApi.onMicLevel((ev) => {
          if (micMuted) {
            setMicLevel(0);
            setMicActive(false);
          } else {
            setMicLevel(ev.level);
            setMicActive(ev.active);
          }
        });

        const u3 = await TauriApi.onLoopbackLevel((ev) => {
          if (loopbackMuted) {
            setLoopbackLevel(0);
            setLoopbackActive(false);
          } else {
            setLoopbackLevel(ev.level);
            setLoopbackActive(ev.active);
          }
        });

        const u4 = await TauriApi.onLlmStart((ev) => {
          setIsStreaming(true);
          setSelectedLogId(null);
          setSuggestion("");
          setLlmError(null);
          setActiveAction(ev.action);
        });

        const u5 = await TauriApi.onLlmToken((ev) => {
          setSuggestion((prev) => prev + ev.token);
        });

        const u6 = await TauriApi.onLlmComplete((ev: any) => {
          setIsStreaming(false);
          const fullText = ev.text || ev.full_text;
          if (fullText) {
            setSuggestion(fullText);
            saveAiLogEntry(fullText);
          }
        });

        const u7 = await TauriApi.onLlmError((ev) => {
          setIsStreaming(false);
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
              if (config.auto_trigger_enabled && latest && latest.speaker === "Interviewer" && latest.text.trim().length > 3 && !isStreaming) {
                handleTriggerAction("hint", latest.text, false);
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
    };
  }, [activeSessionId, micMuted, loopbackMuted]);

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

      // Ctrl + Shift + M: Toggle Mic Mute
      if (e.ctrlKey && e.shiftKey && (e.key === "M" || e.key === "m")) {
        e.preventDefault();
        setMicMuted((prev) => !prev);
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

      // Esc: Stop generation or close modal
      if (e.key === "Escape") {
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
    setActiveSessionId(sessionId);
    localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, sessionId);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession) {
      setTranscripts(targetSession.transcripts || []);
      setAiLogs(targetSession.aiLogs || []);
      setSuggestion(targetSession.lastSuggestion || "");
      setSelectedLogId(null);
      const newConfig: AppConfig = {
        ...config,
        target_role: targetSession.role || config.target_role,
        company_name: targetSession.company || "",
        interview_title: targetSession.title || "",
        job_description: targetSession.jobDescription || config.job_description || "",
        candidate_resume: targetSession.candidateResume || config.candidate_resume || "",
        project_directory: targetSession.projectDirectory || config.project_directory || "",
        project_context: targetSession.projectContext || config.project_context || "",
      };
      setConfig(newConfig);
      TauriApi.saveConfig(newConfig);
    }
  };

  const handleCreateSession = (data: Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts" | "aiLogs">) => {
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
      ...config,
      target_role: data.role || config.target_role,
      company_name: data.company || "",
      interview_title: data.title || "",
      job_description: data.jobDescription || config.job_description || "",
      candidate_resume: data.candidateResume || config.candidate_resume || "",
      project_directory: data.projectDirectory || config.project_directory || "",
      project_context: data.projectContext || config.project_context || "",
    };
    setConfig(newConfig);
    TauriApi.saveConfig(newConfig);
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

  const handleExportActiveSessionTxt = () => {
    const activeSession = sessions.find((s) => s.id === activeSessionId);
    const currentSession: InterviewSession = {
      id: activeSessionId || `session-${Date.now()}`,
      title: activeSession?.title || config.interview_title || "Interview Session",
      role: activeSession?.role || config.target_role || "Candidate",
      company: activeSession?.company || config.company_name,
      jobDescription: activeSession?.jobDescription || config.job_description,
      candidateResume: activeSession?.candidateResume || config.candidate_resume,
      projectDirectory: activeSession?.projectDirectory || config.project_directory,
      projectContext: activeSession?.projectContext || config.project_context,
      createdAt: activeSession?.createdAt || new Date().toISOString(),
      lastActive: new Date().toISOString(),
      transcripts: transcripts,
      aiLogs: aiLogs,
    };
    exportSessionAsTxt(currentSession, config);
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

  const handleToggleAutoTrigger = async () => {
    const next = !config.auto_trigger_enabled;
    const newConfig = { ...config, auto_trigger_enabled: next };
    setConfig(newConfig);
    await TauriApi.saveConfig(newConfig);
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

  const handleTriggerAction = async (action: string, customQuery?: string, isManualInput: boolean = false) => {
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

    try {
      const res = await TauriApi.generateAiSuggestion(action, customQuery);
      if (res && res.trim().length > 0) {
        setSuggestion((prev) => prev || res);
        saveAiLogEntry(res, action, promptQuery);
      }
    } catch (err: any) {
      console.error("AI Generation error:", err);
      setLlmError(err?.toString() || "Failed to generate AI suggestion. Check API key in settings.");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleCancelAi = async () => {
    await TauriApi.cancelAiSuggestion();
    setIsStreaming(false);
  };

  const handleSaveSettings = async (newConfig: AppConfig) => {
    const saved = await TauriApi.saveConfig(newConfig);
    setConfig(saved);
    setOpacity(saved.opacity);
    await TauriApi.setAntiCapture(saved.anti_capture_enabled);

    try {
      await TauriApi.stopAudioCapture();
      await TauriApi.startAudioCapture();
    } catch (err) {
      console.warn("Audio restart error:", err);
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
        <main className={`relative flex flex-col h-screen w-screen overflow-hidden font-sans font-scale-${fontScale}`}>
          <StartupSessionScreen
            sessions={sessions}
            activeSessionId={activeSessionId}
            config={config}
            onSelectSession={handleSelectSession}
            onCreateSession={handleCreateSession}
            onDeleteSession={handleDeleteSession}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onStartLiveHud={() => setInLiveHud(true)}
          />
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            config={config}
            onSave={handleSaveSettings}
          />
          <DirectoryPermissionModal
            isOpen={showDirectoryPermissionPrompt}
            onGrant={handleGrantDirectoryPermission}
            onDismiss={handleDismissDirectoryPermission}
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
          className={`relative flex items-center justify-between px-3 py-2 bg-slate-900 border border-slate-700 rounded-full shadow-2xl select-none font-sans font-scale-${fontScale}`}
          style={{ backgroundColor: `rgba(15, 23, 42, ${opacity})` }}
        >
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
            <button
              type="button"
              onClick={() => handleTriggerAction("hint")}
              disabled={isStreaming}
              className="flex items-center gap-1 px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
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
        className={`relative flex flex-col h-screen w-screen overflow-hidden select-none font-sans font-scale-${fontScale} rounded-xl border border-slate-700/60 shadow-2xl`}
        style={{
          backgroundColor: `rgba(11, 16, 27, ${opacity})`,
        }}
      >
        {/* 1. HUD Header */}
        <HudHeader
          config={config}
          opacity={opacity}
          onToggleAntiCapture={handleToggleAntiCapture}
          onToggleAutoTrigger={handleToggleAutoTrigger}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSessions={() => setInLiveHud(false)}
          layoutMode={layoutMode}
          onChangeLayoutMode={handleChangeLayoutMode}
          fontScale={fontScale}
          onChangeFontScale={handleChangeFontScale}
          isCompactPill={isCompactPill}
          onToggleCompactPill={() => setIsCompactPill((prev) => !prev)}
          activeProvider={config.llm_provider}
          sessionTitle={activeSession?.title}
        />

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
            <div style={{ height: `${100 - splitPercent}%` }} className="overflow-hidden flex flex-col">
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
          <div className="flex-1 overflow-hidden flex flex-col">
            <TranscriptStream
              transcripts={transcripts}
              onClear={handleClearTranscripts}
              onAskAiAboutTurn={(text: string) => handleTriggerAction("hint", text, false)}
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
          <div className="flex-1 overflow-hidden flex flex-col">
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
        />

        {/* 7. Directory Access Permission Modal */}
        <DirectoryPermissionModal
          isOpen={showDirectoryPermissionPrompt}
          onGrant={handleGrantDirectoryPermission}
          onDismiss={handleDismissDirectoryPermission}
        />
      </main>
    </I18nProvider>
  );
};
