import React from "react";
import { X, Keyboard, Shield, Sparkles, Code2, HelpCircle, Layers, MousePointerClick, EyeOff, Mic, Monitor } from "lucide-react";
import { useTranslation } from "../../i18n";

interface HotkeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HotkeyModal: React.FC<HotkeyModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const shortcuts = [
    {
      category: t.hotkeysModal.categoryAi,
      items: [
        { keys: ["Ctrl", "Shift", "Space"], desc: t.actions.answerDesc, icon: Sparkles, color: "text-amber-400" },
        { keys: ["Ctrl", "Shift", "K"], desc: t.actions.codeDesc, icon: Code2, color: "text-sky-400" },
        { keys: ["Ctrl", "Shift", "L"], desc: t.actions.clarifyDesc, icon: HelpCircle, color: "text-purple-400" },
        { keys: ["Ctrl", "Shift", "E"], desc: t.actions.systemDesignDesc, icon: Layers, color: "text-emerald-400" },
        { keys: ["Ctrl", "Shift", "S"], desc: t.actions.screenVisionDesc, icon: Monitor, color: "text-rose-400" },
        { keys: ["Esc"], desc: t.actions.stopAi, icon: X, color: "text-slate-400" },
      ],
    },
    {
      category: t.hotkeysModal.categoryStealth,
      items: [
        { keys: ["Ctrl", "Shift", "H"], desc: t.header.hideHud, icon: EyeOff, color: "text-rose-400" },
        { keys: ["Ctrl", "Shift", "C"], desc: t.header.clickThrough, icon: MousePointerClick, color: "text-purple-400" },
        { keys: ["Ctrl", "Shift", "M"], desc: t.header.micMuted, icon: Mic, color: "text-emerald-400" },
        { keys: ["Ctrl", ","], desc: t.header.settings, icon: Shield, color: "text-sky-400" },
      ],
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hotkeys-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm font-sans"
    >
      <div className="relative flex flex-col w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-850 border-b border-slate-700 select-none">
          <div className="flex items-center gap-2.5 text-slate-100 font-semibold text-sm">
            <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg">
              <Keyboard className="w-4 h-4" />
            </div>
            <span id="hotkeys-modal-title">{t.hotkeysModal.title}</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts modal"
            className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700/60 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto scrollbar-thin">
          {shortcuts.map((group, gIdx) => (
            <div key={gIdx} className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                {group.category}
              </h3>

              <div className="grid gap-2">
                {group.items.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${item.color} shrink-0`} />
                        <span className="text-xs font-medium text-slate-200">
                          {item.desc}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-950 border border-slate-700 text-slate-200 rounded shadow-sm"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-850 border-t border-slate-700 text-xs text-slate-400">
          <span>{t.hotkeysModal.subtitle}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium rounded-lg transition-colors"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
