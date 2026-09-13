import React, { useEffect, useRef, useState } from "react";
import {
  Plus,
  History,
  Trash2,
  ArrowRight,
  Play,
  Briefcase,
  FileText,
  UserCheck,
  Sparkles,
  Settings,
  Upload,
  FileCheck,
  X,
  Minus,
  FolderGit2,
  Download,
  FolderOpen,
  RefreshCw,
  FolderPlus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { InterviewSession } from "../../types/session";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";
import { extractTextFromFile } from "../../utils/fileParser";
import { exportSessionAsTxt } from "../../utils/exportTxt";
import { useTranslation } from "../../i18n";

interface StartupSessionScreenProps {
  sessions: InterviewSession[];
  activeSessionId: string | null;
  config: AppConfig;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (session: Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts" | "aiLogs">) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onStartLiveHud: () => void;
}

const PRESETS = [
  {
    name: "General Interview",
    role: "General Professional",
    jobDescription: "General problem-solving, situational questions, communication, and experience walkthrough.",
    candidateResume: "Experienced professional with strong communication, structured problem-solving, and adaptability.",
  },
  {
    name: "Software & Tech",
    role: "Software Engineer",
    jobDescription: "Software development, architecture, code quality, APIs, databases, and debugging.",
    candidateResume: "Proficient software engineer with experience building web apps, backends, and full-stack features.",
  },
  {
    name: "System Design",
    role: "Senior / Lead Architect",
    jobDescription: "High-scale distributed systems, microservices, databases, caching, and reliability.",
    candidateResume: "Experienced in designing scalable cloud architectures, handling concurrency, and performance tuning.",
  },
  {
    name: "Behavioral & STAR",
    role: "Team Lead / Senior Role",
    jobDescription: "Conflict management, project leadership, cross-functional collaboration, and overcoming challenges.",
    candidateResume: "Demonstrated track record of delivering complex projects, mentoring peers, and stakeholder management.",
  },
];

export const StartupSessionScreen: React.FC<StartupSessionScreenProps> = ({
  sessions,
  activeSessionId,
  config,
  onSelectSession,
  onCreateSession,
  onDeleteSession,
  onOpenSettings,
  onStartLiveHud,
}) => {
  const { t } = useTranslation();
  const [title, setTitle] = useState(() => localStorage.getItem("ghostcue_draft_title") || "New Interview");
  const [role, setRole] = useState(() => localStorage.getItem("ghostcue_draft_role") || config.target_role || "Software Engineer");
  const [company, setCompany] = useState(() => localStorage.getItem("ghostcue_draft_company") || "");
  const [jobDescription, setJobDescription] = useState(() => localStorage.getItem("ghostcue_draft_job_desc") || config.job_description || "");
  const [candidateResume, setCandidateResume] = useState(() => localStorage.getItem("ghostcue_resume_text") || config.candidate_resume || "");
  const [projectDirectories, setProjectDirectories] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ghostcue_draft_project_dirs");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    if (config.project_directories && config.project_directories.length > 0) {
      return config.project_directories;
    }
    if (config.project_directory && config.project_directory.trim().length > 0) {
      return [config.project_directory.trim()];
    }
    return [];
  });
  const [manualFolderInput, setManualFolderInput] = useState("");
  const [projectContext, setProjectContext] = useState(() => localStorage.getItem("ghostcue_draft_project_ctx") || config.project_context || "");
  const [isScanningDir, setIsScanningDir] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [showContextPreview, setShowContextPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(() => localStorage.getItem("ghostcue_resume_filename"));
  const [isParsingResume, setIsParsingResume] = useState(false);

  useEffect(() => {
    if (config.target_role && !localStorage.getItem("ghostcue_draft_role")) {
      setRole(config.target_role);
    }
    if (config.job_description && !localStorage.getItem("ghostcue_draft_job_desc")) {
      setJobDescription(config.job_description);
    }
    if (config.candidate_resume && !localStorage.getItem("ghostcue_resume_text")) {
      setCandidateResume(config.candidate_resume);
    }
    if (config.company_name && !localStorage.getItem("ghostcue_draft_company")) {
      setCompany(config.company_name);
    }
    if (config.project_directories && config.project_directories.length > 0 && !localStorage.getItem("ghostcue_draft_project_dirs")) {
      setProjectDirectories(config.project_directories);
    } else if (config.project_directory && !localStorage.getItem("ghostcue_draft_project_dirs")) {
      setProjectDirectories([config.project_directory]);
    }
    if (config.project_context && !localStorage.getItem("ghostcue_draft_project_ctx")) {
      setProjectContext(config.project_context);
    }
  }, [config]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    localStorage.setItem("ghostcue_draft_title", val);
  };

  const handleRoleChange = (val: string) => {
    setRole(val);
    localStorage.setItem("ghostcue_draft_role", val);
  };

  const handleCompanyChange = (val: string) => {
    setCompany(val);
    localStorage.setItem("ghostcue_draft_company", val);
  };

  const handleJobDescChange = (val: string) => {
    setJobDescription(val);
    localStorage.setItem("ghostcue_draft_job_desc", val);
  };

  const handleResumeTextChange = (val: string) => {
    setCandidateResume(val);
    localStorage.setItem("ghostcue_resume_text", val);
  };

  const updateProjectDirectories = (dirs: string[]) => {
    setProjectDirectories(dirs);
    try {
      localStorage.setItem("ghostcue_draft_project_dirs", JSON.stringify(dirs));
    } catch {}
    if (dirs.length > 0) {
      localStorage.setItem("ghostcue_draft_project_dir", dirs[0]);
    } else {
      localStorage.removeItem("ghostcue_draft_project_dir");
    }
  };

  const handleProjectContextChange = (val: string) => {
    setProjectContext(val);
    localStorage.setItem("ghostcue_draft_project_ctx", val);
  };

  const handleScanAllFolders = async (dirsToScan?: string[]) => {
    const targetDirs = dirsToScan || projectDirectories;
    if (targetDirs.length === 0) {
      handleProjectContextChange("");
      setScanStatus("No project folders connected.");
      return;
    }

    setIsScanningDir(true);
    setScanStatus(`Scanning ${targetDirs.length} project repository codebase${targetDirs.length > 1 ? "s" : ""}...`);

    try {
      const summary = await TauriApi.scanMultipleProjectDirectories(targetDirs);
      if (summary && summary.trim().length > 10) {
        handleProjectContextChange(summary.trim());
        setScanStatus(`Indexed ${targetDirs.length} project${targetDirs.length > 1 ? "s" : ""} (${summary.length.toLocaleString()} characters of architecture & manifests).`);
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

    if (projectDirectories.includes(cleanPath)) {
      alert("This project folder is already added.");
      return;
    }

    const updated = [...projectDirectories, cleanPath];
    updateProjectDirectories(updated);
    setManualFolderInput("");
    await handleScanAllFolders(updated);
  };

  const handleRemoveProjectDirectory = async (pathToRemove: string) => {
    const updated = projectDirectories.filter((p) => p !== pathToRemove);
    updateProjectDirectories(updated);
    if (updated.length > 0) {
      await handleScanAllFolders(updated);
    } else {
      handleProjectContextChange("");
      setScanStatus("Removed project folder. 0 folders connected.");
    }
  };

  const handleSelectFolderDialog = async () => {
    try {
      const chosen = await TauriApi.selectDirectoryDialog();
      if (chosen && chosen.trim().length > 0) {
        await handleAddProjectDirectory(chosen.trim());
      } else if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    } catch (err) {
      console.error("Folder select error:", err);
      if (folderInputRef.current) {
        folderInputRef.current.click();
      }
    }
  };

  const handleHtmlFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanningDir(true);
    setScanStatus(`Processing ${files.length} project files...`);

    try {
      let folderPath = "Uploaded Folder";
      const firstFile = files[0];
      if ((firstFile as any).webkitRelativePath) {
        const parts = (firstFile as any).webkitRelativePath.split("/");
        if (parts.length > 1) {
          folderPath = parts[0];
        }
      }

      let summary = `### Project Folder: ${folderPath}\n\n#### 1. Uploaded File Tree:\n\`\`\`\n`;
      const fileNames = Array.from(files).map((f) => (f as any).webkitRelativePath || f.name);
      summary += fileNames.slice(0, 45).join("\n");
      if (fileNames.length > 45) summary += `\n... (${fileNames.length - 45} more files)`;
      summary += "\n```\n\n#### 2. Key Manifests & Documentation:\n";

      for (let i = 0; i < Math.min(files.length, 8); i++) {
        const f = files[i];
        const lower = f.name.toLowerCase();
        if (
          lower.endsWith(".md") ||
          lower.endsWith(".json") ||
          lower.endsWith(".toml") ||
          lower.endsWith(".txt") ||
          lower.endsWith(".yml") ||
          lower.endsWith(".yaml")
        ) {
          const text = await f.text();
          summary += `\n--- [${f.name}] ---\n\`\`\`\n${text.slice(0, 3000)}\n\`\`\`\n`;
        }
      }

      const nextDirs = projectDirectories.includes(folderPath) ? projectDirectories : [...projectDirectories, folderPath];
      updateProjectDirectories(nextDirs);
      handleProjectContextChange((projectContext ? projectContext + "\n\n" : "") + summary);
      setScanStatus(`Indexed ${folderPath} (${summary.length.toLocaleString()} characters from ${files.length} files).`);
    } catch (err) {
      console.error("HTML folder upload failed:", err);
    } finally {
      setIsScanningDir(false);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  };

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    handleRoleChange(preset.role);
    handleJobDescChange(preset.jobDescription);
    handleResumeTextChange(preset.candidateResume);
    handleTitleChange(preset.name);
  };

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
        handleResumeTextChange(clean);
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

  const handleCreateAndLaunch = () => {
    onCreateSession({
      title: title.trim() || "Untitled Interview",
      role: role.trim() || "Candidate",
      company: company.trim() || undefined,
      jobDescription: jobDescription.trim(),
      candidateResume: candidateResume.trim(),
      projectDirectory: projectDirectories[0] || undefined,
      projectDirectories: projectDirectories,
      projectContext: projectContext.trim() || undefined,
    });
    onStartLiveHud();
  };

  const handleStartDrag = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, textarea, select, a, [role='button']")) {
      return;
    }
    if (e.button === 0) {
      TauriApi.startDragging();
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans select-none overflow-hidden">
      {/* Header */}
      <header
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-800 cursor-move"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8]" />
          <span className="text-sm font-bold text-slate-100 tracking-tight font-sans">
            GhostCue
          </span>
          <span className="text-xs text-slate-400 font-medium">
            • {t.sessionScreen.title}
          </span>
        </div>

        {/* Center Drag Handle */}
        <div
          data-tauri-drag-region
          onMouseDown={() => TauriApi.startDragging()}
          className="flex items-center justify-center px-4 py-1 text-slate-500 hover:text-slate-300 cursor-move select-none"
          title="Drag Window"
        >
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span>{t.header.settings}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                getCurrentWebviewWindow().minimize();
              } catch (_) {}
            }}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await TauriApi.exitApp();
              } catch {
                try {
                  getCurrentWebviewWindow().close();
                } catch (_) {}
              }
            }}
            className="p-1.5 bg-slate-800 hover:bg-rose-900 border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-rose-400"
            title={t.common.close}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* Left Column: Past Sessions */}
        <div className="md:col-span-4 flex flex-col bg-slate-900/60 border-r border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-100">
              <History className="w-4 h-4 text-sky-400" />
              <span>Past Sessions</span>
            </div>
            <span className="text-slate-400 font-mono font-medium">({sessions.length})</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400 text-xs px-4">
                <p className="font-semibold text-slate-300">No previous sessions yet</p>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {t.sessionScreen.subtitle}
                </p>
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = activeSessionId === sess.id;
                return (
                  <div
                    key={sess.id}
                    className={`group flex flex-col p-3 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? "bg-slate-800 border-sky-500/60 text-slate-100 shadow-sm"
                        : "bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white"
                    }`}
                    onClick={() => {
                      onSelectSession(sess.id);
                      onStartLiveHud();
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-slate-100 truncate max-w-[170px]">
                        {sess.title}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await exportSessionAsTxt(sess, config);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-sky-400 text-slate-400 transition-opacity"
                          title="Export interview session to .txt"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(sess.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-400 transition-opacity"
                          title={t.common.delete}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="truncate max-w-[130px] font-medium">{sess.role}</span>
                      <span>
                        {sess.transcripts.length} exchanges
                        {sess.aiLogs && sess.aiLogs.length > 0 ? ` • ${sess.aiLogs.length} answers` : ""}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono mt-1">
                      {new Date(sess.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Setup & Launch Form */}
        <div className="md:col-span-8 flex flex-col bg-slate-950 overflow-y-auto overflow-x-hidden p-6 scrollbar-thin">
          <div className="max-w-xl mx-auto w-full space-y-5">
            {/* Header */}
            <div className="space-y-1 pb-3 border-b border-slate-800">
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-sky-400" />
                <span>{t.sessionScreen.title}</span>
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t.sessionScreen.subtitle}
              </p>
            </div>

            {/* Quick Role Presets */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.sessionScreen.presetsTitle}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="flex flex-col text-left p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/50 rounded-xl transition-all shadow-sm group"
                  >
                    <span className="text-xs font-bold text-slate-200 group-hover:text-sky-300">
                      {p.name}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate mt-0.5">{p.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="block text-slate-200 font-semibold">
                    {t.settings.interviewTitle}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Google L5 Frontend Interview"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="block text-slate-200 font-semibold">
                    {t.settings.companyName}
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    placeholder="e.g. Stripe / Meta / Startup"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
                  />
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-slate-200 font-semibold">
                  <Briefcase className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.settings.targetRole}</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  placeholder="e.g. Senior Software Engineer / Full Stack"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
                />
              </div>

              {/* Job Requirements */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-slate-200 font-semibold">
                  <FileText className="w-3.5 h-3.5 text-sky-400" />
                  <span>{t.settings.jobDescription}</span>
                </label>
                <textarea
                  rows={3}
                  value={jobDescription}
                  onChange={(e) => handleJobDescChange(e.target.value)}
                  placeholder="Paste responsibilities, key tech stack, or interview expectations..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 text-xs leading-relaxed"
                />
              </div>

              {/* Resume / Background */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-slate-200 font-semibold">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
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
                      className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-sky-400 hover:text-sky-300 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isParsingResume ? "Extracting..." : "Upload Resume (PDF/TXT)"}</span>
                    </button>
                  </div>
                </div>

                {uploadedFileName && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/60 border border-emerald-600/40 text-emerald-300 text-xs rounded-lg">
                    <FileCheck className="w-4 h-4 text-emerald-400" />
                    <span>Loaded resume from <strong>{uploadedFileName}</strong></span>
                  </div>
                )}

                <textarea
                  rows={4}
                  value={candidateResume}
                  onChange={(e) => handleResumeTextChange(e.target.value)}
                  placeholder="Paste your past experience, notable projects, and key achievements..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 text-xs leading-relaxed"
                />
              </div>

              {/* Connected Project & Codebase Repositories (Multi-Project Support) */}
              <div className="space-y-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderGit2 className="w-4 h-4 text-amber-400" />
                    <label className="text-slate-100 font-bold text-xs uppercase tracking-wider">
                      Connected Projects & Repositories
                    </label>
                  </div>
                  <span className="text-[11px] text-amber-400 font-mono font-semibold">
                    {projectDirectories.length} Connected
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Connect one or more codebase repositories. GhostCue scans the directory trees, package manifests, and architecture documentation so AI can answer deep questions about your actual code during interviews.
                </p>

                {/* List of Connected Project Folders */}
                {projectDirectories.length > 0 ? (
                  <div className="space-y-2">
                    {projectDirectories.map((dirPath, idx) => {
                      const dirName = dirPath.split(/[/\\]/).filter(Boolean).pop() || dirPath;
                      return (
                        <div
                          key={dirPath}
                          className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-all gap-2"
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
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors border border-slate-700 focus-visible:ring-1 focus-visible:ring-sky-400"
                              title="Re-scan and index this project"
                            >
                              <RefreshCw className={`w-3 h-3 ${isScanningDir ? "animate-spin text-sky-400" : ""}`} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveProjectDirectory(dirPath)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded-lg transition-colors border border-slate-700 focus-visible:ring-1 focus-visible:ring-rose-400"
                              title="Disconnect this project"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-900/50 border border-dashed border-slate-800 rounded-xl text-center space-y-2">
                    <p className="text-xs text-slate-400">No project repositories connected to this interview session yet.</p>
                  </div>
                )}

                {/* Add Folder Actions */}
                <div className="space-y-2">
                  <input
                    type="file"
                    ref={folderInputRef}
                    onChange={handleHtmlFolderUpload}
                    // @ts-ignore
                    webkitdirectory=""
                    directory=""
                    multiple
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectFolderDialog}
                      disabled={isScanningDir}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold rounded-lg border border-slate-700 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-sky-400"
                    >
                      <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                      <span>+ Add Project Folder</span>
                    </button>

                    {projectDirectories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleScanAllFolders()}
                        disabled={isScanningDir}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-950/60 border border-sky-500/40 hover:bg-sky-900/60 text-sky-300 text-xs font-bold rounded-lg transition-colors"
                      >
                        <RefreshCw className={`w-3 h-3 ${isScanningDir ? "animate-spin" : ""}`} />
                        <span>Re-scan All ({projectDirectories.length})</span>
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
                      className="flex-1 min-w-0 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs font-mono"
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

                {/* Live Scan Status Banner */}
                {scanStatus && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/50 border border-emerald-600/30 text-emerald-300 text-xs rounded-lg">
                    <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="leading-snug">{scanStatus}</span>
                  </div>
                )}

                {/* Collapsible Combined Context Preview */}
                {projectContext && projectContext.trim().length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowContextPreview((prev) => !prev)}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 font-medium transition-colors"
                    >
                      {showContextPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <span>
                        {showContextPreview ? "Hide" : "View / Edit"} Combined Project Context ({projectContext.length.toLocaleString()} characters)
                      </span>
                    </button>

                    {showContextPreview && (
                      <textarea
                        rows={5}
                        value={projectContext}
                        onChange={(e) => handleProjectContextChange(e.target.value)}
                        placeholder="Combined codebase architecture summary..."
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 text-xs leading-relaxed font-mono"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateAndLaunch}
                className="w-full flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg focus-visible:ring-2 focus-visible:ring-sky-400 active:scale-[0.99]"
              >
                <Play className="w-4 h-4 fill-current text-white" />
                <span>{t.sessionScreen.startBtn}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
