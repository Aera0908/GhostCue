import React from "react";
import { Briefcase, FileText, UserCheck, Code } from "lucide-react";
import { AppConfig } from "../../types/config";

interface ContextSettingsProps {
  config: AppConfig;
  onChange: (key: keyof AppConfig, value: any) => void;
}

export const ContextSettings: React.FC<ContextSettingsProps> = ({ config, onChange }) => {
  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <Briefcase className="w-3.5 h-3.5 text-sky-400" />
          <span>Target Interview Role</span>
        </label>
        <input
          type="text"
          value={config.target_role}
          onChange={(e) => onChange("target_role", e.target.value)}
          placeholder="e.g. Senior Backend / Distributed Systems Engineer"
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
        />
      </div>

      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <FileText className="w-3.5 h-3.5 text-sky-400" />
          <span>Job Description / Key Requirements</span>
        </label>
        <textarea
          rows={4}
          value={config.job_description}
          onChange={(e) => onChange("job_description", e.target.value)}
          placeholder="Paste key responsibilities, tech stack, and evaluation criteria..."
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
        />
        <p className="text-[10px] text-slate-500 mt-0.5">
          GhostCue tailors suggestions to match the technologies and design patterns expected by the interviewer.
        </p>
      </div>

      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Candidate Resume / Background & Key Projects</span>
        </label>
        <textarea
          rows={5}
          value={config.candidate_resume}
          onChange={(e) => onChange("candidate_resume", e.target.value)}
          placeholder="Paste your past experience, notable projects, technical strengths, and metrics..."
          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 font-sans"
        />
        <p className="text-[10px] text-slate-500 mt-0.5">
          GhostCue will reference your actual projects, tech stacks, and experiences during live answers.
        </p>
      </div>

      <div>
        <label className="flex items-center gap-1.5 font-medium text-slate-200 mb-1">
          <Code className="w-3.5 h-3.5 text-purple-400" />
          <span>System Prompt Override (Optional)</span>
        </label>
        <textarea
          rows={3}
          value={config.system_prompt_override}
          onChange={(e) => onChange("system_prompt_override", e.target.value)}
          placeholder="Leave blank to use GhostCue's high-impact concise interview system prompt..."
          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
        />
      </div>
    </div>
  );
};
