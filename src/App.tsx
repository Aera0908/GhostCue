import React, { useEffect, useState, useRef } from "react";
import { AppConfig } from "./types/config";
import { TranscriptSegment } from "./types/transcript";
import { InterviewSession } from "./types/session";
import { DEFAULT_CONFIG, TauriApi } from "./services/tauriApi";
import { HudHeader } from "./components/hud/HudHeader";
import { AudioMeters } from "./components/hud/AudioMeters";
import { TranscriptStream } from "./components/hud/TranscriptStream";
import { SuggestionCard } from "./components/hud/SuggestionCard";
import { ActionControls } from "./components/hud/ActionControls";
import { SettingsModal } from "./components/settings/SettingsModal";
import { StartupSessionScreen } from "./components/session/StartupSessionScreen";

const STORAGE_SESSIONS_KEY = "ghostcue_interview_sessions";
const STORAGE_ACTIVE_SESSION_KEY = "ghostcue_active_session_id";

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [opacity, setOpacity] = useState<number>(0.94);
  const [clickThrough, setClickThrough] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

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
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string>("hint");
  const [llmError, setLlmError] = useState<string | null>(null);

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
        } else if (parsed.length > 0) {
          setActiveSessionId(parsed[0].id);
        }
      }
    } catch (e) {
      console.warn("Failed to parse saved sessions:", e);
    }
  }, []);

  // Save sessions to storage whenever they change
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

  // Load config & setup event listeners on mount
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    const init = async () => {
      try {
        const loadedConfig = await TauriApi.getConfig();
        setConfig(loadedConfig);
        setOpacity(loadedConfig.opacity);
        setClickThrough(loadedConfig.click_through);

        const started = await TauriApi.startAudioCapture();
        setIsCapturing(started);

        const u1 = await TauriApi.onTranscript((seg) => {
          console.log("[HUD] Live transcript received:", seg);
          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.id === seg.id);
            let updatedList: TranscriptSegment[];
            if (idx >= 0) {
              updatedList = [...prev];
              updatedList[idx] = seg;
            } else {
              updatedList = [...prev, seg];
            }

            // Sync to active session
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
          if (config.auto_trigger_enabled && seg.speaker === "Interviewer" && seg.text.trim().length > 3) {
            handleTriggerAction("hint", seg.text, false);
          }
        });

        const u2 = await TauriApi.onMicLevel((ev) => {
          if (Math.random() < 0.01) console.log("[DIAG] mic-level event:", ev);
          setMicLevel(ev.level);
          setMicActive(ev.active);
        });

        const u3 = await TauriApi.onLoopbackLevel((ev) => {
          if (Math.random() < 0.01) console.log("[DIAG] loopback-level event:", ev);
          setLoopbackLevel(ev.level);
          setLoopbackActive(ev.active);
        });

        const u4 = await TauriApi.onLlmStart((ev) => {
          setIsStreaming(true);
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
            if (activeSessionId) {
              updateSessionsState((sessList) =>
                sessList.map((s) =>
                  s.id === activeSessionId
                    ? { ...s, lastSuggestion: fullText, lastActive: new Date().toISOString() }
                    : s
                )
              );
            }
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

    // High-rate polling fallback to guarantee real-time updates across all webviews
    const pollInterval = setInterval(async () => {
      try {
        // 1. Sync Audio Levels
        const lv = await TauriApi.getAudioLevels();
        if (lv.mic_level > 0 || lv.mic_active) {
          setMicLevel(lv.mic_level);
          setMicActive(lv.mic_active);
        } else {
          setMicLevel((prev) => (prev > 0.02 ? prev * 0.8 : 0));
          setMicActive(false);
        }

        if (lv.loopback_level > 0 || lv.loopback_active) {
          setLoopbackLevel(lv.loopback_level);
          setLoopbackActive(lv.loopback_active);
        } else {
          setLoopbackLevel((prev) => (prev > 0.02 ? prev * 0.8 : 0));
          setLoopbackActive(false);
        }

        // 2. Continuous Transcript History Sync from backend
        const history = await TauriApi.getTranscriptHistory();
        if (history && history.length > 0) {
          setTranscripts((prev) => {
            const hasNewItem = prev.length !== history.length || (prev.length > 0 && prev[prev.length - 1].id !== history[history.length - 1].id);
            if (hasNewItem) {
              const latest = history[history.length - 1];
              // Auto-trigger if new turn is from interviewer
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
  }, [activeSessionId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Ctrl + Shift + H: Panic Hide / Show HUD
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

      if (isTyping) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

      if (!inLiveHud) return;

      // Ctrl + Shift + Space: Trigger Hint
      if (e.ctrlKey && e.shiftKey && e.code === "Space") {
        e.preventDefault();
        handleTriggerAction("hint");
        return;
      }

      // Ctrl + Shift + K: Trigger Code
      if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        handleTriggerAction("code");
        return;
      }

      // Ctrl + Shift + L: Trigger Clarify
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        handleTriggerAction("clarify");
        return;
      }

      // Ctrl + Shift + E: Trigger Elaborate
      if (e.ctrlKey && e.shiftKey && (e.key === "E" || e.key === "e")) {
        e.preventDefault();
        handleTriggerAction("elaborate");
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
  }, [inLiveHud, isStreaming, isSettingsOpen, clickThrough]);

  // Session Operations
  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, sessionId);
    const targetSession = sessions.find((s) => s.id === sessionId);
    if (targetSession) {
      setTranscripts(targetSession.transcripts || []);
      setSuggestion(targetSession.lastSuggestion || "");
      const newConfig: AppConfig = {
        ...config,
        target_role: targetSession.role || config.target_role,
        company_name: targetSession.company || "",
        interview_title: targetSession.title || "",
        job_description: targetSession.jobDescription || config.job_description || "",
        candidate_resume: targetSession.candidateResume || config.candidate_resume || "",
      };
      setConfig(newConfig);
      TauriApi.saveConfig(newConfig);
    }
  };

  const handleCreateSession = (data: Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts">) => {
    const newSession: InterviewSession = {
      ...data,
      id: `session-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      transcripts: [],
    };
    updateSessionsState((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, newSession.id);
    setTranscripts([]);
    setSuggestion("");
    const newConfig: AppConfig = {
      ...config,
      target_role: data.role || config.target_role,
      company_name: data.company || "",
      interview_title: data.title || "",
      job_description: data.jobDescription || config.job_description || "",
      candidate_resume: data.candidateResume || config.candidate_resume || "",
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
      setSuggestion("");
    }
  };

  // Actions
  const handleOpacityChange = (val: number) => {
    setOpacity(val);
    TauriApi.setHudOpacity(val);
    setConfig((prev) => ({ ...prev, opacity: val }));
  };

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

  const handleToggleCapture = async () => {
    if (isCapturing) {
      await TauriApi.stopAudioCapture();
      setIsCapturing(false);
    } else {
      const started = await TauriApi.startAudioCapture();
      setIsCapturing(started);
    }
  };

  const [splitPercent, setSplitPercent] = useState<number>(42);
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

    setActiveAction(action);
    setLlmError(null);
    setSuggestion("");
    setIsStreaming(true);

    // ONLY add a manual transcript turn if typed into the prompt bar by the candidate
    if (hasQuery && isManualInput) {
      const manualSegment: TranscriptSegment = {
        id: `manual-${Date.now()}`,
        speaker: "Candidate",
        text: customQuery!.trim(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        is_final: true,
        confidence: 1.0,
        duration_secs: 0.5,
      };
      setTranscripts((prev) => [...prev, manualSegment]);
    }

    try {
      const res = await TauriApi.generateAiSuggestion(action, customQuery);
      if (res) {
        setSuggestion((prev) => prev || res);
      }
    } catch (err: any) {
      console.error("AI Generation error:", err);
      setLlmError(err?.toString() || "Failed to generate AI suggestion. Check API key in settings or .env");
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

    // Restart audio capture with newly selected devices & sensitivity
    try {
      await TauriApi.stopAudioCapture();
      const restarted = await TauriApi.startAudioCapture();
      setIsCapturing(restarted);
    } catch (err) {
      console.warn("Audio restart error:", err);
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // If not in live HUD mode, show Startup / Session Hub Screen
  if (!inLiveHud) {
    return (
      <main className="relative flex flex-col h-screen w-screen overflow-hidden font-sans">
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
      </main>
    );
  }

  return (
    <main
      className="relative flex flex-col h-screen w-screen overflow-hidden select-none font-sans"
      style={{
        backgroundColor: `rgba(10, 10, 10, ${opacity})`,
      }}
    >
      {/* 1. HUD Header */}
      <HudHeader
        config={config}
        opacity={opacity}
        bgOpacity={opacity}
        onOpacityChange={handleOpacityChange}
        clickThrough={clickThrough}
        onToggleClickThrough={handleToggleClickThrough}
        onToggleAntiCapture={handleToggleAntiCapture}
        onToggleAutoTrigger={handleToggleAutoTrigger}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSessions={() => setInLiveHud(false)}
        onPanicHide={() => TauriApi.toggleHudVisibility()}
        isCapturing={isCapturing}
        onToggleCapture={handleToggleCapture}
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
        bgOpacity={opacity}
      />

      {/* 3. Main Workspace (Draggable Resizable Split) */}
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden bg-transparent relative">
        {/* Upper Panel: Live Conversation Transcript */}
        <div style={{ height: `${splitPercent}%` }} className="overflow-hidden flex flex-col">
          <TranscriptStream
            transcripts={transcripts}
            onClear={handleClearTranscripts}
            onAskAiAboutTurn={(text: string) => handleTriggerAction("hint", text, false)}
            bgOpacity={opacity}
            autoTriggerEnabled={config.auto_trigger_enabled}
            onToggleAutoTrigger={handleToggleAutoTrigger}
          />
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDraggingSplit(true);
          }}
          className="group relative h-2 bg-[#1a1a1a] hover:bg-[#2c2c2c] cursor-row-resize flex items-center justify-center border-y border-[#262626] transition-colors z-20 select-none"
          title="Drag to resize panels"
        >
          <div className="w-12 h-1 bg-[#444444] group-hover:bg-[#38bdf8] transition-colors" />
        </div>

        {/* Lower Panel: AI Suggestion / IDE Code Studio */}
        <div style={{ height: `${100 - splitPercent}%` }} className="overflow-hidden flex flex-col">
          <SuggestionCard
            content={suggestion}
            isStreaming={isStreaming}
            activeAction={activeAction}
            provider={config.llm_provider}
            model={
              config.llm_provider === "ollama"
                ? config.ollama_model
                : config.llm_provider === "openai"
                ? config.openai_model
                : config.llm_provider === "anthropic"
                ? config.anthropic_model
                : config.custom_model
            }
            error={llmError}
            onRetry={() => handleTriggerAction(activeAction, undefined, false)}
            bgOpacity={opacity}
          />
        </div>
      </div>

      {/* 4. Bottom Action Dock & Prompt Bar */}
      <ActionControls
        isStreaming={isStreaming}
        onTriggerAction={(action, query) => handleTriggerAction(action, query, true)}
        onCancel={handleCancelAi}
        bgOpacity={opacity}
      />

      {/* 5. Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveSettings}
      />
    </main>
  );
};
