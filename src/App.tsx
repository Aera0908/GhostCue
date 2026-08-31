import React, { useEffect, useState } from "react";
import { AppConfig } from "./types/config";
import { TranscriptSegment } from "./types/transcript";
import { DEFAULT_CONFIG, TauriApi } from "./services/tauriApi";
import { HudHeader } from "./components/hud/HudHeader";
import { AudioMeters } from "./components/hud/AudioMeters";
import { TranscriptStream } from "./components/hud/TranscriptStream";
import { SuggestionCard } from "./components/hud/SuggestionCard";
import { ActionControls } from "./components/hud/ActionControls";
import { SettingsModal } from "./components/settings/SettingsModal";

export const App: React.FC = () => {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [opacity, setOpacity] = useState<number>(0.92);
  const [clickThrough, setClickThrough] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Audio Levels
  const [micLevel, setMicLevel] = useState<number>(0);
  const [micActive, setMicActive] = useState<boolean>(false);
  const [loopbackLevel, setLoopbackLevel] = useState<number>(0);
  const [loopbackActive, setLoopbackActive] = useState<boolean>(false);

  // Transcripts
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);

  // LLM Stream State
  const [suggestion, setSuggestion] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activeAction, setActiveAction] = useState<string>("hint");
  const [llmError, setLlmError] = useState<string | null>(null);

  // Load config & initialize listeners on mount
  useEffect(() => {
    let unlistens: Array<() => void> = [];

    const init = async () => {
      try {
        const loadedConfig = await TauriApi.getConfig();
        setConfig(loadedConfig);
        setOpacity(loadedConfig.opacity);
        setClickThrough(loadedConfig.click_through);

        // Load existing transcript history
        const history = await TauriApi.getTranscriptHistory();
        if (history && history.length > 0) {
          setTranscripts(history);
        }

        // Start audio capture
        const started = await TauriApi.startAudioCapture();
        setIsCapturing(started);

        // Setup event listeners
        const u1 = await TauriApi.onTranscript((seg) => {
          setTranscripts((prev) => {
            const idx = prev.findIndex((t) => t.id === seg.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = seg;
              return updated;
            }
            return [...prev, seg];
          });
        });

        const u2 = await TauriApi.onMicLevel((ev) => {
          setMicLevel(ev.level);
          setMicActive(ev.active);
        });

        const u3 = await TauriApi.onLoopbackLevel((ev) => {
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

    return () => {
      unlistens.forEach((u) => u());
    };
  }, []);

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

      // If user is currently typing in search/input, let standard typing through
      if (isTyping) {
        if (e.key === "Escape") {
          target.blur();
        }
        return;
      }

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
  }, [isStreaming, isSettingsOpen, clickThrough]);

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

  const handleToggleCapture = async () => {
    if (isCapturing) {
      await TauriApi.stopAudioCapture();
      setIsCapturing(false);
    } else {
      const started = await TauriApi.startAudioCapture();
      setIsCapturing(started);
    }
  };

  const handleClearTranscripts = async () => {
    await TauriApi.clearTranscriptHistory();
    setTranscripts([]);
  };

  const handleTriggerAction = async (action: string, customQuery?: string) => {
    setActiveAction(action);
    setLlmError(null);
    setSuggestion("");
    setIsStreaming(true);

    if (customQuery && customQuery.trim()) {
      const manualSegment: TranscriptSegment = {
        id: `manual-${Date.now()}`,
        speaker: "Candidate Query",
        text: customQuery.trim(),
        timestamp: new Date().toISOString(),
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
      setIsStreaming(false);
      setLlmError(err?.toString() || "Failed to generate AI suggestion. Check API key in settings or .env");
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
  };

  return (
    <main
      className="relative flex flex-col h-screen w-screen overflow-hidden select-none border border-white/10 rounded-xl transition-all duration-150 shadow-2xl"
      style={{
        backgroundColor: `rgba(10, 12, 16, ${opacity})`,
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {/* HUD Header Bar */}
      <HudHeader
        config={config}
        opacity={opacity}
        onOpacityChange={handleOpacityChange}
        clickThrough={clickThrough}
        onToggleClickThrough={handleToggleClickThrough}
        onToggleAntiCapture={handleToggleAntiCapture}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onPanicHide={() => TauriApi.toggleHudVisibility()}
        isCapturing={isCapturing}
        onToggleCapture={handleToggleCapture}
        activeProvider={config.llm_provider}
      />

      {/* Real-Time Audio Meters */}
      <AudioMeters
        micLevel={micLevel}
        loopbackLevel={loopbackLevel}
        micActive={micActive}
        loopbackActive={loopbackActive}
        sensitivity={config.vad_sensitivity}
      />

      {/* Main Content Area: Transcript Stream & AI Suggestion Card */}
      <div className="flex-1 flex flex-col gap-2 p-2.5 overflow-hidden">
        {/* Real-Time Transcript Stream */}
        <div className="flex-1 min-h-[110px] overflow-hidden flex flex-col">
          <TranscriptStream
            transcripts={transcripts}
            onClear={handleClearTranscripts}
            onAskAiAboutTurn={(text: string) => handleTriggerAction("hint", text)}
          />
        </div>

        {/* AI Response Card (With IDE Split View) */}
        <div className="shrink-0 flex flex-col">
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
            onRetry={() => handleTriggerAction(activeAction)}
          />
        </div>
      </div>

      {/* Bottom Action Controls & Query Bar */}
      <ActionControls
        isStreaming={isStreaming}
        onTriggerAction={handleTriggerAction}
        onCancel={handleCancelAi}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSave={handleSaveSettings}
      />
    </main>
  );
};
