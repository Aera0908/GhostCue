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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl overflow-hidden font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-800">
          <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm">
            <SettingsIcon className="w-4 h-4 text-sky-400" />
            <span>GhostCue Configuration</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "context"
                ? "border-sky-400 text-sky-400 bg-sky-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Context & Role</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "audio"
                ? "border-sky-400 text-sky-400 bg-sky-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Audio & VAD</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "models"
                ? "border-sky-400 text-sky-400 bg-sky-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>STT & LLM</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-1.5 px-3 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "general"
                ? "border-sky-400 text-sky-400 bg-sky-950/20"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Stealth & Hotkeys</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-4 overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-slate-800">
          {activeTab === "context" && <ContextSettings config={formData} onChange={handleChange} />}
          {activeTab === "audio" && <AudioSettings config={formData} onChange={handleChange} />}
          {activeTab === "models" && <ModelSettings config={formData} onChange={handleChange} />}
          {activeTab === "general" && <GeneralSettings config={formData} onChange={handleChange} />}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-t border-slate-800">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Saving..." : "Save Changes"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
