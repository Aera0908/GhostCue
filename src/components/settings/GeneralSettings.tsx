import React from "react";
import { ShieldCheck, Command, Eye, Globe, Bot } from "lucide-react";
import { AppConfig } from "../../types/config";
import { useTranslation, SupportedLocale } from "../../i18n";

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

  const hotkeys = [
    { key: "Ctrl + Shift + H", desc: t.header.hideHud },
    { key: "Ctrl + Shift + C", desc: t.header.clickThrough },
    { key: "Ctrl + Shift + Space", desc: t.actions.answerDesc },
    { key: "Ctrl + Shift + K", desc: t.actions.codeDesc },
    { key: "Ctrl + Shift + L", desc: t.actions.clarifyDesc },
    { key: "Ctrl + Shift + E", desc: t.actions.systemDesignDesc },
    { key: "Ctrl + Shift + S", desc: t.actions.screenVisionDesc },
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
