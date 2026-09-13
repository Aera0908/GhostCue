import React from "react";
import { ShieldCheck, ShieldAlert, Command, Eye, Globe, Bot, Monitor } from "lucide-react";
import { AppConfig } from "../../types/config";
import { useTranslation, SupportedLocale } from "../../i18n";
import { TauriApi } from "../../services/tauriApi";

interface GeneralSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({ config, onChange }) => {
  const { t, locale, setLocale, languages, responseLanguages } = useTranslation();

  const handleUiLanguageChange = (newLocale: string) => {
    setLocale(newLocale as SupportedLocale);
    onChange("ui_language", newLocale);
  };

  const handleToggleFocusShield = (checked: boolean) => {
    onChange("focus_shield_enabled", checked);
    TauriApi.setFocusShield(checked).catch(console.warn);
  };

  const hotkeys = [
    { key: "Ctrl + Shift + H", desc: t.header.hideHud },
    { key: "Ctrl + Shift + C", desc: t.header.clickThrough },
    { key: "Ctrl + Shift + Space", desc: t.actions.answerDesc },
    { key: "Ctrl + Shift + K", desc: t.actions.codeDesc },
    { key: "Ctrl + Shift + L", desc: t.actions.clarifyDesc },
    { key: "Ctrl + Shift + E", desc: t.actions.systemDesignDesc },
    { key: "Ctrl + Shift + S", desc: t.actions.screenVisionDesc },
    { key: "Ctrl + Shift + O", desc: "Toggle Live Screen OCR (Autonomous Scanner)" },
    { key: "Ctrl + Shift + T", desc: "Stealth Typer (Bypass Editor Paste Detection)" },
    { key: "Ctrl + Shift + F", desc: "Toggle Focus Shield (Anti-Detection / Typing Mode)" },
    { key: "Ctrl + Shift + M", desc: t.header.micMuted },
    { key: "Esc", desc: t.actions.stopAi },
  ];

  return (
    <div className="space-y-4 text-sm font-sans">
      {/* UI Display Language Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-sky-400" />
          <div>
            <p className="font-bold text-slate-100 uppercase">{t.settings.uiLanguage}</p>
            <p className="text-[11px] text-slate-400">{t.settings.uiLanguageDesc}</p>
          </div>
        </div>
        <select
          value={config.ui_language || locale}
          onChange={(e) => handleUiLanguageChange(e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg text-xs focus:border-sky-500 focus:outline-none cursor-pointer"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.nativeLabel} ({lang.label})
            </option>
          ))}
        </select>
      </div>

      {/* AI Response Language Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
        <div className="flex items-center gap-2.5">
          <Bot className="w-4 h-4 text-emerald-400" />
          <div>
            <p className="font-bold text-slate-100 uppercase">{t.settings.responseLanguage}</p>
            <p className="text-[11px] text-slate-400">{t.settings.responseLanguageDesc}</p>
          </div>
        </div>
        <select
          value={config.response_language || "auto"}
          onChange={(e) => onChange("response_language", e.target.value)}
          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg text-xs focus:border-emerald-500 focus:outline-none cursor-pointer"
        >
          {responseLanguages.map((rl) => (
            <option key={rl.code} value={rl.code}>
              {rl.flag} {rl.label}
            </option>
          ))}
        </select>
      </div>

      {/* Anti-Capture Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <p className="font-bold text-slate-100 uppercase">{t.settings.antiCaptureTitle}</p>
              <p className="text-[11px] text-slate-400">
                Windows WDA_EXCLUDEFROMCAPTURE Protection
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.anti_capture_enabled}
            onChange={(e) => onChange("anti_capture_enabled", e.target.checked)}
            className="w-4 h-4 accent-sky-400 cursor-pointer"
          />
        </div>
        <p className="text-xs text-slate-300 leading-relaxed pt-1">
          {t.settings.antiCaptureDesc}
        </p>
      </div>

      {/* Online Assessment Anti-Detection / Focus Shield Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-indigo-400" />
            <div>
              <p className="font-bold text-slate-100 uppercase">Assessment Anti-Detection (Focus Shield)</p>
              <p className="text-[11px] text-slate-400">
                Windows WS_EX_NOACTIVATE Anti-Blur Protection (Enabled by default)
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.focus_shield_enabled ?? true}
            onChange={(e) => handleToggleFocusShield(e.target.checked)}
            className="w-4 h-4 accent-indigo-500 cursor-pointer"
          />
        </div>
        <p className="text-xs text-slate-300 leading-relaxed pt-1">
          Prevents mouse clicks and window dragging on GhostCue from taking away system focus from other active applications, preventing window blur and tab-switch events.
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
          💡 <span className="font-semibold text-slate-300">Quick Typing Toggle:</span> When Focus Shield is enabled, GhostCue ignores keyboard input to avoid stealing focus. Press <kbd className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[10px] rounded font-bold">Ctrl + Shift + F</kbd> anytime to toggle Focus Shield off when you need to type into GhostCue.
        </p>
      </div>

      {/* Live Screen OCR (Autonomous Screen Watcher) Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-4 h-4 text-rose-400" />
            <div>
              <p className="font-bold text-slate-100 uppercase">Live Screen OCR (Autonomous Watcher)</p>
              <p className="text-[11px] text-slate-400">
                Periodically scans desktop screen to detect coding problems or questions automatically
              </p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={config.live_ocr_enabled ?? false}
            onChange={(e) => onChange("live_ocr_enabled", e.target.checked)}
            className="w-4 h-4 accent-rose-500 cursor-pointer"
          />
        </div>

        {/* Scan Interval Slider */}
        <div className="pt-2 border-t border-slate-800/80 space-y-2">
          <div className="flex justify-between items-center text-slate-200">
            <span className="font-semibold text-slate-300">Scan Interval</span>
            <span className="font-bold text-rose-300 font-mono text-xs bg-rose-950/60 border border-rose-800/50 px-2 py-0.5 rounded">
              {config.live_ocr_interval_secs || 10}s (Every {config.live_ocr_interval_secs || 10} seconds)
            </span>
          </div>
          <input
            type="range"
            min="4"
            max="60"
            step="1"
            value={config.live_ocr_interval_secs || 10}
            onChange={(e) => onChange("live_ocr_interval_secs", parseInt(e.target.value, 10))}
            className="w-full h-2 bg-slate-950 accent-rose-500 rounded cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Fast (4s)</span>
            <span>Balanced (10s)</span>
            <span>Relaxed (30s)</span>
            <span>Slow (60s)</span>
          </div>
        </div>

        {/* Smart Change Detection Checkbox */}
        <div className="flex items-start gap-2.5 pt-1">
          <input
            type="checkbox"
            id="live_ocr_smart_diff"
            checked={config.live_ocr_smart_diff ?? true}
            onChange={(e) => onChange("live_ocr_smart_diff", e.target.checked)}
            className="w-3.5 h-3.5 mt-0.5 accent-rose-500 cursor-pointer rounded"
          />
          <label htmlFor="live_ocr_smart_diff" className="cursor-pointer">
            <span className="font-semibold text-slate-200 block">Smart Problem Deduplication & Change Detection (Recommended)</span>
            <span className="text-[11px] text-slate-400 block leading-normal">
              Uses on-device OCR and perceptual hashing to detect when the same problem remains visible on screen. When the same problem is detected across scans, it skips re-prompting the LLM to save credits.
            </span>
          </label>
        </div>

        <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] space-y-1 text-slate-300">
          <p className="font-semibold text-rose-300 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-400" />
            Zero-Token Local Parsing Engine:
          </p>
          <p className="text-slate-400 leading-relaxed">
            GhostCue runs native Windows OCR locally on your machine to extract problem statements, questions, and code directly into text, sending plain text to the LLM instead of heavy image screenshots. This eliminates vision token costs and works with all models.
          </p>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
          💡 <span className="font-semibold text-slate-300">Quick Toggle:</span> Press <kbd className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 text-slate-200 font-mono text-[10px] rounded font-bold">Ctrl + Shift + O</kbd> anytime or click the Live OCR button in the HUD header to toggle autonomous screen scanning on/off.
        </p>
      </div>

      {/* Default Opacity Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2 text-xs">
        <div className="flex justify-between text-slate-200">
          <span className="flex items-center gap-2 font-bold uppercase">
            <Eye className="w-4 h-4 text-sky-400" />
            <span>{t.settings.opacityTitle}</span>
          </span>
          <span className="text-slate-100 font-bold">{Math.round(config.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1.0"
          step="0.02"
          value={config.opacity}
          onChange={(e) => onChange("opacity", parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-950 accent-sky-400 rounded cursor-pointer"
        />
      </div>

      {/* Shortcuts Guide Table Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 text-xs">
        <h4 className="flex items-center gap-2 font-bold text-slate-100 uppercase tracking-wider">
          <Command className="w-4 h-4 text-purple-400" />
          <span>{t.settings.hotkeysTitle}</span>
        </h4>

        <div className="bg-slate-950 border border-slate-800 rounded-lg divide-y divide-slate-800 overflow-hidden">
          {hotkeys.map((hk) => (
            <div key={hk.key} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-slate-300 font-sans">{hk.desc}</span>
              <kbd className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-slate-200 font-mono text-[11px] font-bold rounded">
                {hk.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
