import React, { useRef, useState } from "react";
import { Briefcase, FileText, UserCheck, Code, Upload, FileCheck } from "lucide-react";
import { AppConfig } from "../../types/config";
import { extractTextFromFile } from "../../utils/fileParser";
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

      {/* Custom Prompt Override */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
        <label className="flex items-center gap-2 font-semibold text-slate-100">
          <Code className="w-4 h-4 text-purple-400" />
          <span>{t.settings.systemPromptOverride}</span>
        </label>
        <textarea
          rows={3}
          value={config.system_prompt_override}
          onChange={(e) => onChange("system_prompt_override", e.target.value)}
          placeholder="Leave blank to use GhostCue's standard concise coaching guidelines..."
          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400 leading-relaxed"
        />
      </div>
    </div>
  );
};
