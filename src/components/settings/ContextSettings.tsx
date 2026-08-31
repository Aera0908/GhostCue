import React, { useRef, useState } from "react";
import { Briefcase, FileText, UserCheck, Code, Upload, FileCheck } from "lucide-react";
import { AppConfig } from "../../types/config";
import { extractTextFromFile } from "../../utils/fileParser";

interface ContextSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const ContextSettings: React.FC<ContextSettingsProps> = ({ config, onChange }) => {
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
      <div className="p-3 bg-[#141414] border border-[#222222] space-y-1.5">
        <label className="flex items-center gap-2 font-semibold text-white">
          <Briefcase className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Target Interview Role</span>
        </label>
        <input
          type="text"
          value={config.target_role}
          onChange={(e) => handleRoleChange(e.target.value)}
          placeholder="e.g. Senior Software Engineer / Distributed Systems"
          className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#262626] text-[#eeeeee] placeholder-[#555555] focus:outline-none focus:border-[#444444]"
        />
      </div>

      {/* Job Description Card */}
      <div className="p-3 bg-[#141414] border border-[#222222] space-y-1.5">
        <label className="flex items-center gap-2 font-semibold text-white">
          <FileText className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Job Description / Key Requirements</span>
        </label>
        <textarea
          rows={4}
          value={config.job_description}
          onChange={(e) => handleJobDescChange(e.target.value)}
          placeholder="Paste key responsibilities, tech stack, or focus areas..."
          className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#262626] text-[#eeeeee] placeholder-[#555555] focus:outline-none focus:border-[#444444] leading-relaxed"
        />
      </div>

      {/* Candidate Resume Card with Upload Button */}
      <div className="p-3 bg-[#141414] border border-[#222222] space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 font-semibold text-white">
            <UserCheck className="w-3.5 h-3.5 text-[#4ade80]" />
            <span>Your Resume & Background Experience</span>
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
              className="flex items-center gap-1 px-2.5 py-1 bg-[#1e1e1e] hover:bg-[#282828] text-[#38bdf8] hover:text-white border border-[#333333] transition-colors"
            >
              <Upload className="w-3 h-3" />
              <span>{isParsingResume ? "Reading..." : "Upload Resume (PDF/DOCX/TXT)"}</span>
            </button>
          </div>
        </div>

        {uploadedFileName && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#162216] border border-[#1f381f] text-[#4ade80]">
            <FileCheck className="w-3.5 h-3.5" />
            <span>Loaded resume from <strong>{uploadedFileName}</strong></span>
          </div>
        )}

        <textarea
          rows={5}
          value={config.candidate_resume}
          onChange={(e) => handleResumeTextChange(e.target.value)}
          placeholder="Paste your past experience, notable projects, or upload your resume above..."
          className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#262626] text-[#eeeeee] placeholder-[#555555] focus:outline-none focus:border-[#444444] leading-relaxed"
        />
      </div>

      {/* Custom Prompt Override */}
      <div className="p-3 bg-[#141414] border border-[#222222] space-y-1.5">
        <label className="flex items-center gap-2 font-semibold text-white">
          <Code className="w-3.5 h-3.5 text-[#c084fc]" />
          <span>Custom AI Instructions (Optional)</span>
        </label>
        <textarea
          rows={3}
          value={config.system_prompt_override}
          onChange={(e) => onChange("system_prompt_override", e.target.value)}
          placeholder="Leave blank to use GhostCue's standard concise coaching guidelines..."
          className="w-full px-3 py-2 bg-[#0c0c0c] border border-[#262626] text-[#eeeeee] placeholder-[#555555] focus:outline-none focus:border-[#444444] leading-relaxed"
        />
      </div>
    </div>
  );
};
