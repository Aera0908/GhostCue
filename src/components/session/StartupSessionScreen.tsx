import React, { useEffect, useRef, useState } from "react";
import { Plus, History, Trash2, ArrowRight, Play, Briefcase, FileText, UserCheck, Sparkles, Settings, Upload, FileCheck } from "lucide-react";
import { InterviewSession } from "../../types/session";
import { AppConfig } from "../../types/config";
import { TauriApi } from "../../services/tauriApi";
import { extractTextFromFile } from "../../utils/fileParser";

interface StartupSessionScreenProps {
  sessions: InterviewSession[];
  activeSessionId: string | null;
  config: AppConfig;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (session: Omit<InterviewSession, "id" | "createdAt" | "lastActive" | "transcripts">) => void;
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
  const [title, setTitle] = useState(() => localStorage.getItem("ghostcue_draft_title") || "New Interview");
  const [role, setRole] = useState(() => localStorage.getItem("ghostcue_draft_role") || config.target_role || "Software Engineer");
  const [company, setCompany] = useState(() => localStorage.getItem("ghostcue_draft_company") || "");
  const [jobDescription, setJobDescription] = useState(() => localStorage.getItem("ghostcue_draft_job_desc") || config.job_description || "");
  const [candidateResume, setCandidateResume] = useState(() => localStorage.getItem("ghostcue_resume_text") || config.candidate_resume || "");

  // Resume Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(() => localStorage.getItem("ghostcue_resume_filename"));
  const [isParsingResume, setIsParsingResume] = useState(false);

  // Sync state when config updates from disk
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
  }, [config]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    localStorage.setItem("ghostcue_draft_title", val);
  };

  const handleRoleChange = (val: string) => {
    setRole(val);
    localStorage.setItem("ghostcue_draft_role", val);
    TauriApi.saveConfig({ ...config, target_role: val });
  };

  const handleCompanyChange = (val: string) => {
    setCompany(val);
    localStorage.setItem("ghostcue_draft_company", val);
  };

  const handleJobDescChange = (val: string) => {
    setJobDescription(val);
    localStorage.setItem("ghostcue_draft_job_desc", val);
    TauriApi.saveConfig({ ...config, job_description: val });
  };

  const handleResumeTextChange = (val: string) => {
    setCandidateResume(val);
    localStorage.setItem("ghostcue_resume_text", val);
    TauriApi.saveConfig({ ...config, candidate_resume: val });
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
    <div className="flex flex-col h-screen w-screen bg-[#0d0d0d] text-[#e0e0e0] font-sans select-none overflow-hidden">
      {/* Top Header */}
      <header
        data-tauri-drag-region
        onMouseDown={handleStartDrag}
        className="flex items-center justify-between px-4 py-2.5 bg-[#141414] border-b border-[#222222] cursor-move"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white font-mono tracking-tight">
            GhostCue
          </span>
          <span className="text-xs text-[#777777]">
            • Interview Hub
          </span>
        </div>

        {/* Center Drag Dotted Square */}
        <div
          data-tauri-drag-region
          onMouseDown={() => TauriApi.startDragging()}
          className="flex items-center justify-center p-1 text-[#666666] hover:text-[#bbbbbb] cursor-move select-none"
          title="Drag Window"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.2" />
            <circle cx="8" cy="3" r="1.2" />
            <circle cx="13" cy="3" r="1.2" />
            <circle cx="3" cy="8" r="1.2" />
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="13" cy="8" r="1.2" />
            <circle cx="3" cy="13" r="1.2" />
            <circle cx="8" cy="13" r="1.2" />
            <circle cx="13" cy="13" r="1.2" />
          </svg>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#282828] text-xs text-[#cccccc] hover:text-white transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* Left Column: Past Interviews History */}
        <div className="md:col-span-4 flex flex-col bg-[#111111] border-r border-[#1f1f1f] overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2 bg-[#161616] border-b border-[#222222] text-xs">
            <div className="flex items-center gap-1.5 font-bold text-white">
              <History className="w-3.5 h-3.5 text-[#888888]" />
              <span>Past Interviews</span>
            </div>
            <span className="text-[#666666] font-mono">({sessions.length})</span>
          </div>

          {/* Session List */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 scrollbar-thin scrollbar-thumb-[#282828]">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center text-[#666666] text-xs px-4">
                <p className="font-medium text-[#888888]">No previous sessions yet</p>
                <p className="text-[11px] mt-1 text-[#555555] leading-relaxed">
                  Start an interview on the right to begin live transcription and AI coaching.
                </p>
              </div>
            ) : (
              sessions.map((sess) => {
                const isActive = activeSessionId === sess.id;
                return (
                  <div
                    key={sess.id}
                    className={`group flex flex-col p-3 border transition-colors cursor-pointer ${
                      isActive
                        ? "bg-[#1c1c1c] border-[#383838] text-white"
                        : "bg-[#141414] border-[#1f1f1f] text-[#888888] hover:border-[#333333] hover:text-[#cccccc]"
                    }`}
                    onClick={() => {
                      onSelectSession(sess.id);
                      onStartLiveHud();
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-white truncate max-w-[170px]">
                        {sess.title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSession(sess.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-[#f87171] transition-opacity"
                        title="Delete session"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#777777]">
                      <span className="truncate max-w-[130px]">{sess.role}</span>
                      <span>{sess.transcripts.length} exchanges</span>
                    </div>

                    <span className="text-[10px] text-[#555555] font-mono mt-1">
                      {new Date(sess.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Start New Interview / Context Setup */}
        <div className="md:col-span-8 flex flex-col bg-[#0d0d0d] overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-[#282828]">
          <div className="max-w-xl mx-auto w-full space-y-4">
            {/* Header Title */}
            <div className="space-y-1 pb-2 border-b border-[#202020]">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#38bdf8]" />
                <span>Start a New Interview</span>
              </h2>
              <p className="text-xs text-[#888888] leading-relaxed">
                Add your resume or target job details so GhostCue can generate personalized answers tailored to your real background.
              </p>
            </div>

            {/* Quick Presets Strip */}
            <div className="space-y-1.5 text-xs">
              <label className="text-[#888888] font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-[#facc15]" />
                <span>Quick Templates</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="p-2.5 text-left bg-[#141414] hover:bg-[#1c1c1c] border border-[#222222] hover:border-[#383838] transition-colors"
                  >
                    <span className="block font-bold text-white text-xs">{p.name}</span>
                    <span className="text-[11px] text-[#777777] line-clamp-1 mt-0.5">{p.role}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 text-xs">
              {/* Session Name & Company */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-white font-semibold">Interview Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Stripe Technical Round"
                    className="w-full px-3 py-2 bg-[#141414] border border-[#242424] text-white focus:outline-none focus:border-[#444444]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-white font-semibold">Company (Optional)</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    placeholder="e.g. Google, Apple, Startup"
                    className="w-full px-3 py-2 bg-[#141414] border border-[#242424] text-white focus:outline-none focus:border-[#444444]"
                  />
                </div>
              </div>

              {/* Target Role */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-white font-semibold">
                  <Briefcase className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>Target Role</span>
                </label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  placeholder="e.g. Senior Software Engineer / Full Stack"
                  className="w-full px-3 py-2 bg-[#141414] border border-[#242424] text-white focus:outline-none focus:border-[#444444]"
                />
              </div>

              {/* Job Description */}
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-white font-semibold">
                  <FileText className="w-3.5 h-3.5 text-[#38bdf8]" />
                  <span>Job Requirements / Focus Topics</span>
                </label>
                <textarea
                  rows={3}
                  value={jobDescription}
                  onChange={(e) => handleJobDescChange(e.target.value)}
                  placeholder="Paste key responsibilities or tech stack..."
                  className="w-full px-3 py-2 bg-[#141414] border border-[#242424] text-white focus:outline-none focus:border-[#444444] text-xs leading-relaxed"
                />
              </div>

              {/* Candidate Resume / Experience with Upload Button */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-white font-semibold">
                    <UserCheck className="w-3.5 h-3.5 text-[#4ade80]" />
                    <span>Your Resume / Background & Strengths</span>
                  </label>

                  {/* Upload Resume Button */}
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
                      className="flex items-center gap-1 px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#2a2a2a] text-xs text-[#38bdf8] hover:text-white border border-[#333333] transition-colors"
                    >
                      <Upload className="w-3 h-3" />
                      <span>{isParsingResume ? "Reading..." : "Upload Resume (PDF/DOCX/TXT)"}</span>
                    </button>
                  </div>
                </div>

                {uploadedFileName && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-[#162216] border border-[#1f381f] text-[#4ade80] text-xs">
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Loaded resume from <strong>{uploadedFileName}</strong></span>
                  </div>
                )}

                <textarea
                  rows={4}
                  value={candidateResume}
                  onChange={(e) => handleResumeTextChange(e.target.value)}
                  placeholder="Paste your past experience, notable projects, or upload your resume above..."
                  className="w-full px-3 py-2 bg-[#141414] border border-[#242424] text-white focus:outline-none focus:border-[#444444] text-xs leading-relaxed font-sans"
                />
              </div>
            </div>

            {/* Launch Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateAndLaunch}
                className="w-full flex items-center justify-center gap-2 py-3 bg-[#222222] hover:bg-[#303030] text-white font-bold text-xs uppercase tracking-wider border border-[#383838] transition-colors shadow-lg active:scale-[0.99]"
              >
                <Play className="w-3.5 h-3.5 fill-current text-[#4ade80]" />
                <span>Start Live Interview Assistant</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
