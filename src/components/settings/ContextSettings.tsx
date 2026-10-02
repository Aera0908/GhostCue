import React, { useRef, useState } from "react";
import {
  Briefcase,
  FileText,
  UserCheck,
  Code,
  Upload,
  FileCheck,
  FolderGit2,
  FolderOpen,
  FolderPlus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AppConfig } from "../../types/config";
import { extractTextFromFile } from "../../utils/fileParser";
import { TauriApi } from "../../services/tauriApi";
import { useTranslation } from "../../i18n";

interface ContextSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const ContextSettings: React.FC<ContextSettingsProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(() => localStorage.getItem("ghostcue_resume_filename"));
  const [isParsingResume, setIsParsingResume] = useState(false);

  const [manualFolderInput, setManualFolderInput] = useState("");
  const [isScanningDir, setIsScanningDir] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [showContextPreview, setShowContextPreview] = useState(false);

  const projectDirs: string[] = config.project_directories && config.project_directories.length > 0
    ? config.project_directories
    : config.project_directory && config.project_directory.trim().length > 0
    ? [config.project_directory.trim()]
    : [];

  const handleResumeFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingResume(true);
    setUploadedFileName(file.name);
    localStorage.setItem("ghostcue_resume_filename", file.name);

    try {
      const extracted = await extractTextFromFile(file);
      if (extracted && extracted.trim().length > 10) {
        const clean = extracted.trim();
        onChange("candidate_resume", clean);
        localStorage.setItem("ghostcue_resume_text", clean);
      } else {
        alert("Could not extract readable text from this file. Please paste your experience manually.");
      }
    } catch (err) {
      console.error("Resume extraction failed:", err);
      alert("Failed to parse document. Please try a .txt, .md, or .pdf file.");
    } finally {
      setIsParsingResume(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRoleChange = (val: string) => {
    onChange("target_role", val);
    localStorage.setItem("ghostcue_draft_role", val);
  };

  const handleJobDescChange = (val: string) => {
    onChange("job_description", val);
    localStorage.setItem("ghostcue_draft_job_desc", val);
  };

  const handleResumeTextChange = (val: string) => {
    onChange("candidate_resume", val);
    localStorage.setItem("ghostcue_resume_text", val);
  };

  const handleScanAllFolders = async (dirsToScan?: string[]) => {
    const targetDirs = dirsToScan || projectDirs;
    if (targetDirs.length === 0) {
      onChange("project_context", "");
      setScanStatus("No project folders connected.");
      return;
    }

    setIsScanningDir(true);
    setScanStatus(`Scanning ${targetDirs.length} project repository codebase${targetDirs.length > 1 ? "s" : ""}...`);

    try {
      const summary = await TauriApi.scanMultipleProjectDirectories(targetDirs);
      if (summary && summary.trim().length > 10) {
        onChange("project_context", summary.trim());
        setScanStatus(`Indexed ${targetDirs.length} project${targetDirs.length > 1 ? "s" : ""} (${summary.length.toLocaleString()} characters).`);
      } else {
        setScanStatus("Scan returned empty. Ensure selected directories exist.");
      }
    } catch (err: any) {
      console.error("Multi-project scan failed:", err);
      setScanStatus(`Scan failed: ${err.message || err}`);
    } finally {
      setIsScanningDir(false);
    }
  };

  const handleAddProjectDirectory = async (rawPath: string) => {
    const cleanPath = rawPath.trim();
    if (!cleanPath) return;

    if (projectDirs.includes(cleanPath)) {
      alert("This project folder is already added.");
      return;
    }

    const updated = [...projectDirs, cleanPath];
    onChange("project_directories", updated);
    onChange("project_directory", updated[0] || "");
    setManualFolderInput("");
    await handleScanAllFolders(updated);
  };

  const handleRemoveProjectDirectory = async (pathToRemove: string) => {
    const updated = projectDirs.filter((p) => p !== pathToRemove);
    onChange("project_directories", updated);
    onChange("project_directory", updated[0] || "");
    if (updated.length > 0) {
      await handleScanAllFolders(updated);
    } else {
      onChange("project_context", "");
      setScanStatus("0 project folders connected.");
    }
  };

  const handleSelectFolderDialog = async () => {
    try {
      const chosen = await TauriApi.selectDirectoryDialog();
      if (chosen && chosen.trim().length > 0) {
        await handleAddProjectDirectory(chosen.trim());
      }
    } catch (err) {
      console.error("Folder select error:", err);
    }
  };

  return (
    <div className="space-y-4 text-xs font-sans">
      {/* Target Role Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <label className="flex items-center gap-2 font-semibold text-slate-100">
          <Briefcase className="w-4 h-4 text-sky-400" />
          <span>{t.settings.targetRole}</span>
        </label>
        <input
          type="text"
          value={config.target_role}
          onChange={(e) => handleRoleChange(e.target.value)}
          placeholder="e.g. Senior Software Engineer / Distributed Systems"
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
        />
      </div>

      {/* Job Description Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <label className="flex items-center gap-2 font-semibold text-slate-100">
          <FileText className="w-4 h-4 text-sky-400" />
          <span>{t.settings.jobDescription}</span>
        </label>
        <textarea
          rows={4}
          value={config.job_description}
          onChange={(e) => handleJobDescChange(e.target.value)}
          placeholder="Paste key responsibilities, tech stack, or focus areas..."
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 leading-relaxed"
        />
      </div>

      {/* Candidate Resume Card */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 font-semibold text-slate-100">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>{t.settings.resumeText}</span>
          </label>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleResumeFileUpload}
              accept=".pdf,.docx,.txt,.md,.rtf"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingResume}
              className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 font-semibold border border-slate-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isParsingResume ? "Reading..." : "Upload Resume (PDF/TXT)"}</span>
            </button>
          </div>
        </div>

        {uploadedFileName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 rounded-lg">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            <span>Loaded resume from <strong>{uploadedFileName}</strong></span>
          </div>
        )}

        <textarea
          rows={5}
          value={config.candidate_resume}
          onChange={(e) => handleResumeTextChange(e.target.value)}
          placeholder="Paste your past experience, notable projects, or upload your resume above..."
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 leading-relaxed"
        />
      </div>

      {/* Connected Projects & Codebase Repositories (Multi-Project) */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-amber-400" />
            <label className="font-semibold text-slate-100">
              Connected Projects & Codebase Context
            </label>
          </div>
          <span className="text-[11px] text-amber-400 font-mono font-semibold">
            {projectDirs.length} Connected
          </span>
        </div>

        {/* Projects List */}
        {projectDirs.length > 0 ? (
          <div className="space-y-2">
            {projectDirs.map((dirPath, idx) => {
              const dirName = dirPath.split(/[/\\]/).filter(Boolean).pop() || dirPath;
              return (
                <div
                  key={dirPath}
                  className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="p-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg shrink-0">
                      <FolderOpen className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-100 truncate">
                          #{idx + 1}: {dirName}
                        </span>
                        <span className="text-[10px] text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono shrink-0">
                          ✓ Indexed
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono truncate block" title={dirPath}>
                        {dirPath}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleScanAllFolders([dirPath])}
                      disabled={isScanningDir}
                      className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-800 focus-visible:ring-1 focus-visible:ring-sky-400"
                      title="Re-scan this project"
                    >
                      <RefreshCw className={`w-3 h-3 ${isScanningDir ? "animate-spin text-sky-400" : ""}`} />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveProjectDirectory(dirPath)}
                      className="p-1.5 bg-slate-900 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition-colors border border-slate-800 focus-visible:ring-1 focus-visible:ring-rose-400"
                      title="Disconnect project"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-3 bg-slate-950 border border-dashed border-slate-800 rounded-lg text-center">
            <p className="text-slate-400 text-xs">No project repositories connected.</p>
          </div>
        )}

        {/* Add Folder Bar */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSelectFolderDialog}
              disabled={isScanningDir}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold rounded-lg border border-slate-700 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>+ Add Folder</span>
            </button>

            {projectDirs.length > 1 && (
              <button
                type="button"
                onClick={() => handleScanAllFolders()}
                disabled={isScanningDir}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-950/60 border border-sky-500/40 hover:bg-sky-900/60 text-sky-300 text-xs font-bold rounded-lg transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isScanningDir ? "animate-spin" : ""}`} />
                <span>Re-scan All ({projectDirs.length})</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 w-full">
            <input
              type="text"
              value={manualFolderInput}
              onChange={(e) => setManualFolderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualFolderInput.trim()) {
                  e.preventDefault();
                  handleAddProjectDirectory(manualFolderInput);
                }
              }}
              placeholder="Or enter path (e.g. g:/Project/my-repo)..."
              className="flex-1 min-w-0 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs font-mono"
            />

            <button
              type="button"
              onClick={() => handleAddProjectDirectory(manualFolderInput)}
              disabled={isScanningDir || !manualFolderInput.trim()}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold rounded-lg transition-colors shrink-0"
            >
              <span>Add</span>
            </button>
          </div>
        </div>

        {scanStatus && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/50 border border-emerald-600/30 text-emerald-300 text-xs rounded-lg">
            <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="leading-snug">{scanStatus}</span>
          </div>
        )}

        {/* Collapsible Combined Context Preview */}
        {config.project_context && config.project_context.trim().length > 0 && (
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowContextPreview((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-medium transition-colors"
            >
              {showContextPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>
                {showContextPreview ? "Hide" : "View / Edit"} Combined Codebase Context ({config.project_context.length.toLocaleString()} characters)
              </span>
            </button>

            {showContextPreview && (
              <textarea
                rows={5}
                value={config.project_context}
                onChange={(e) => onChange("project_context", e.target.value)}
                placeholder="Combined codebase architecture summary..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs leading-relaxed font-mono"
              />
            )}
          </div>
        )}
      </div>

      {/* Custom Prompt Override */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <label className="flex items-center gap-2 font-semibold text-slate-100">
          <Code className="w-4 h-4 text-purple-400" />
          <span>{t.settings.systemPromptOverride}</span>
        </label>
        <p className="text-xs text-slate-400">
          Prioritized custom rule (e.g. &quot;the answer must not be more than 5 sentences&quot;). Your target role, job description, resume, and project context are always preserved.
        </p>
        <textarea
          rows={3}
          value={config.system_prompt_override}
          onChange={(e) => onChange("system_prompt_override", e.target.value)}
          placeholder="e.g. the answer must not be more than 5 sentences, prioritize system design and high-scale trade-offs..."
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 leading-relaxed"
        />
      </div>
    </div>
  );
};
