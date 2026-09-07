import React from "react";
import { FolderGit2, ShieldCheck, CheckCircle2, Lock, HardDrive, ArrowRight, X } from "lucide-react";
import { useTranslation } from "../../i18n";

interface DirectoryPermissionModalProps {
  isOpen: boolean;
  onGrant: () => void;
  onDismiss: () => void;
}

export const DirectoryPermissionModal: React.FC<DirectoryPermissionModalProps> = ({
  isOpen,
  onGrant,
  onDismiss,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#111111] border border-[#2b2b2b] shadow-2xl overflow-hidden flex flex-col text-[#e0e0e0]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#171717] border-b border-[#242424]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#1e293b] border border-[#38bdf8]/40 text-[#38bdf8]">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <span>{t.permissionModal.title}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-[#143020] text-[#4ade80] border border-[#225030] font-mono">
                  LOCAL ONLY
                </span>
              </h3>
              <p className="text-[11px] text-[#777777]">Project Context Permission</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="p-1 hover:bg-[#252525] text-[#888888] hover:text-white transition-colors"
            title={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs text-[#cccccc] leading-relaxed">
          <p className="text-white font-medium">
            {t.permissionModal.desc}
          </p>

          <div className="space-y-2.5 bg-[#141414] p-3.5 border border-[#202020]">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#4ade80] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-semibold text-xs">100% Local & Isolated</strong>
                <span className="text-[#888888] text-[11px]">
                  Files never leave your machine. GhostCue only reads project READMEs, package manifests, and directory trees on demand.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <HardDrive className="w-4 h-4 text-[#38bdf8] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-semibold text-xs">Native Folder Picker</strong>
                <span className="text-[#888888] text-[11px]">
                  Select any workspace or project directory using your native system folder picker without typing paths manually.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#facc15] shrink-0 mt-0.5" />
              <div>
                <strong className="text-white block font-semibold text-xs">Zero-Steal Protection</strong>
                <span className="text-[#888888] text-[11px]">
                  Scanned context is stored purely inside your local session storage and can be cleared at any time.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#141414] border-t border-[#222222]">
          <button
            type="button"
            onClick={onDismiss}
            className="px-3.5 py-2 bg-[#1e1e1e] hover:bg-[#282828] text-white text-xs font-semibold transition-colors"
          >
            {t.permissionModal.skipBtn}
          </button>
          <button
            type="button"
            onClick={onGrant}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1d4ed8] hover:bg-[#2563eb] text-white text-xs font-bold transition-colors shadow-lg active:scale-[0.99]"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t.permissionModal.allowBtn}</span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
