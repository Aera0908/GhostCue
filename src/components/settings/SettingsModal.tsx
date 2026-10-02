import React, { useState, useEffect } from "react";
import { X, User, Sliders, Cpu, Settings as SettingsIcon, Save, RotateCcw } from "lucide-react";
import { AppConfig } from "../../types/config";
import { ContextSettings } from "./ContextSettings";
import { AudioSettings } from "./AudioSettings";
import { ModelSettings } from "./ModelSettings";
import { GeneralSettings } from "./GeneralSettings";
import { DEFAULT_CONFIG } from "../../services/tauriApi";
import { useTranslation } from "../../i18n";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig;
  onSave: (config: AppConfig) => Promise<void>;
  onLiveUpdate?: (key: keyof AppConfig, value: any) => void;
  inLiveHud?: boolean;
}

type SettingsTab = "context" | "audio" | "models" | "general";

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config: initialConfig,
  onSave,
  onLiveUpdate,
  inLiveHud = false,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("context");
  const [formData, setFormData] = useState<AppConfig>(initialConfig);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(initialConfig);
    }
  }, [isOpen, initialConfig]);

  if (!isOpen) return null;

  const handleChange = (key: keyof AppConfig, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    onLiveUpdate?.(key, value);
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm font-sans"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-850 border-b border-slate-700 select-none">
          <div className="flex items-center gap-2.5 text-slate-100 font-bold text-sm">
            <img
              src="/GhostCue_icon.png"
              alt="GhostCue"
              className="w-5 h-5 rounded-md object-cover shadow-[0_0_8px_rgba(56,189,248,0.35)] shrink-0"
            />
            <span id="settings-modal-title">{t.settings.modalTitle}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <nav aria-label="Settings categories" className="flex bg-slate-900 border-b border-slate-800 text-xs font-semibold select-none px-2 pt-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("context")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg transition-all ${
              activeTab === "context"
                ? "bg-slate-800 text-sky-300 border-t-2 border-sky-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t.settings.tabContext.toUpperCase()}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audio")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg transition-all ${
              activeTab === "audio"
                ? "bg-slate-800 text-sky-300 border-t-2 border-sky-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t.settings.tabAudio.toUpperCase()}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("models")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg transition-all ${
              activeTab === "models"
                ? "bg-slate-800 text-sky-300 border-t-2 border-sky-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{t.settings.tabModel.toUpperCase()}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-lg transition-all ${
              activeTab === "general"
                ? "bg-slate-800 text-sky-300 border-t-2 border-sky-400 font-bold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>{t.settings.tabGeneral.toUpperCase()}</span>
          </button>
        </nav>

        {/* Tab Content */}
        <div className="flex-1 p-5 overflow-y-auto max-h-[62vh] scrollbar-thin bg-slate-950">
          {activeTab === "context" && <ContextSettings config={formData} onChange={handleChange} />}
          {activeTab === "audio" && <AudioSettings config={formData} onChange={handleChange} onLiveUpdate={onLiveUpdate} inLiveHud={inLiveHud} />}
          {activeTab === "models" && <ModelSettings config={formData} onChange={handleChange} />}
          {activeTab === "general" && <GeneralSettings config={formData} onChange={handleChange} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-850 border-t border-slate-700 select-none text-xs">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 font-medium"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg shadow-sm transition-colors disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? t.common.loading : t.common.save}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
