import React, { useState } from "react";
import { X, User, Sliders, Cpu, Settings as SettingsIcon, Save, RotateCcw } from "lucide-react";
import { AppConfig } from "../../types/config";
import { ContextSettings } from "./ContextSettings";
import { AudioSettings } from "./AudioSettings";
import { ModelSettings } from "./ModelSettings";
import { GeneralSettings } from "./GeneralSettings";
import { DEFAULT_CONFIG } from "../../services/tauriApi";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
}

type SettingsTab = "context" | "audio" | "models" | "general";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("context");
  const [formData, setFormData] = useState<AppConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleChange = (key: keyof AppConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      alert(`Failed to save settings: ${err}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (confirm("Reset all settings to default values?")) {
      setFormData(DEFAULT_CONFIG);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 font-sans">
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-[#0e0e0e] border border-[#262626] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#222222] select-none font-mono">
          <div className="flex items-center gap-2 text-white font-bold text-sm">
            <SettingsIcon className="w-4 h-4 text-[#888888]" />
            <span>GHOSTCUE SETTINGS</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#888888] hover:text-white hover:bg-[#222222] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs Bar */}
        <div className="flex bg-[#121212] border-b border-[#222222] text-xs font-mono select-none">
          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "context"
                ? "border-white text-white font-bold bg-[#1a1a1a]"
                : "border-transparent text-[#777777] hover:text-[#cccccc] hover:bg-[#161616]"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>CONTEXT</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "audio"
                ? "border-white text-white font-bold bg-[#1a1a1a]"
                : "border-transparent text-[#777777] hover:text-[#cccccc] hover:bg-[#161616]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>AUDIO & VAD</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "models"
                ? "border-white text-white font-bold bg-[#1a1a1a]"
                : "border-transparent text-[#777777] hover:text-[#cccccc] hover:bg-[#161616]"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>MODELS & API</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "general"
                ? "border-white text-white font-bold bg-[#1a1a1a]"
                : "border-transparent text-[#777777] hover:text-[#cccccc] hover:bg-[#161616]"
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>STEALTH & KEYS</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 p-4 overflow-y-auto max-h-[62vh] scrollbar-thin scrollbar-thumb-[#2a2a2a] bg-[#0a0a0a]">
          {activeTab === "context" && <ContextSettings config={formData} onChange={handleChange} />}
          {activeTab === "audio" && <AudioSettings config={formData} onChange={handleChange} />}
          {activeTab === "models" && <ModelSettings config={formData} onChange={handleChange} />}
          {activeTab === "general" && <GeneralSettings config={formData} onChange={handleChange} />}
        </div>

        {/* Modal Footer Bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-t border-[#222222] select-none font-mono text-xs">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#282828] text-[#888888] hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>RESET DEFAULTS</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#282828] text-[#cccccc] hover:text-white transition-colors"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#333333] hover:bg-[#444444] text-white font-bold transition-colors disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "SAVING..." : "SAVE CONFIG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
