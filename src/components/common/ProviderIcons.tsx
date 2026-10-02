import React from "react";

export const OpenRouterIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M12 2L2 7v10l10 5 10-5V7L12 2z"
      stroke="#14B8A6"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12 22V12" stroke="#14B8A6" strokeWidth="2" />
    <path d="M22 7l-10 5-10-5" stroke="#14B8A6" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.5" fill="#2DD4BF" />
  </svg>
);

export const GeminiIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <defs>
      <linearGradient id="gemini-grad-icon" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1BA1E3" />
        <stop offset="50%" stopColor="#5B7BF5" />
        <stop offset="100%" stopColor="#9B51E0" />
      </linearGradient>
    </defs>
    <path
      d="M12 1.5C12 7.299 7.299 12 1.5 12C7.299 12 12 16.701 12 22.5C12 16.701 16.701 12 22.5 12C16.701 12 12 7.299 12 1.5Z"
      fill="url(#gemini-grad-icon)"
    />
  </svg>
);

export const OpenAiIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="#10A37F" className={className}>
    <path d="M22.28 9.9a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.2 6.05 6.05 0 0 0 2.16 9.6a5.98 5.98 0 0 0 .52 4.9 6.05 6.05 0 0 0 6.51 2.9A6.05 6.05 0 0 0 19.02 19.8a6.05 6.05 0 0 0 2.82-5.4 6 6 0 0 0 .44-4.5zM12.9 20.3a4.57 4.57 0 0 1-2.92-1.05l.15-.08 4.86-2.8a.77.77 0 0 0 .39-.67v-6.86l2.06 1.19v6.32a4.59 4.59 0 0 1-4.54 3.95zm-8.8-4.22a4.57 4.57 0 0 1-.58-3.04l.15.1 4.86 2.8a.77.77 0 0 0 .78 0l5.94-3.43v2.38l-5.48 3.16a4.58 4.58 0 0 1-5.67-1.97zm-1.12-8.9a4.56 4.56 0 0 1 2.34-2l-.01.17v5.6a.78.78 0 0 0 .39.68l5.94 3.43-2.06 1.19-5.48-3.16a4.59 4.59 0 0 1-1.12-5.91zm15.15 4.3l-5.94-3.43 2.06-1.19 5.48 3.16a4.58 4.58 0 0 1-1.22 8.95v-5.77a.78.78 0 0 0-.38-.72zm2.08-3.4a4.57 4.57 0 0 1 .58 3.04l-.15-.09-4.86-2.8a.77.77 0 0 0-.78 0l-5.94 3.43V9.24l5.48-3.16a4.58 4.58 0 0 1 5.67 1.97zm-8.1 4.6l-2.43-1.4 2.43-1.4 2.43 1.4-2.43 1.4z" />
  </svg>
);

export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="#D97757" className={className}>
    <path d="M13.8 2.5a1.2 1.2 0 0 0-1.8 0L9.4 6.3a1.2 1.2 0 0 0 0 1.7l3.8 3.8a1.2 1.2 0 0 0 1.7 0l2.6-2.6a1.2 1.2 0 0 0 0-1.7l-3.7-5zm-3.6 19a1.2 1.2 0 0 0 1.8 0l2.6-3.8a1.2 1.2 0 0 0 0-1.7l-3.8-3.8a1.2 1.2 0 0 0-1.7 0l-2.6 2.6a1.2 1.2 0 0 0 0 1.7l3.7 5zm11.3-9.1a1.2 1.2 0 0 0 0-1.8l-3.8-2.6a1.2 1.2 0 0 0-1.7 0l-3.8 3.8a1.2 1.2 0 0 0 0 1.7l2.6 2.6a1.2 1.2 0 0 0 1.7 0l5-3.7zM2.5 12.4a1.2 1.2 0 0 0 0 1.8l3.8 2.6a1.2 1.2 0 0 0 1.7 0l3.8-3.8a1.2 1.2 0 0 0 0-1.7L9.2 8.7a1.2 1.2 0 0 0-1.7 0l-5 3.7z" />
  </svg>
);

export const DeepSeekIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="#0066FF" className={className}>
    <path d="M12 2C6.477 2 2 6.477 2 12c0 2.217.72 4.267 1.938 5.926L2.5 21.5l3.82-1.378A9.957 9.957 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm-1.5 6.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6 7.5c-.83 1.25-2.5 2-4.5 2s-3.67-.75-4.5-2h9z" />
  </svg>
);

export const GroqIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="#F55036" className={className}>
    <path d="M3 4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H7v6h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm11 0a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3V8h-3a1 1 0 0 1-1-1V4z" />
  </svg>
);

export const OllamaIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg viewBox="0 0 24 24" fill="#A855F7" className={className}>
    <path d="M12 2.5a2.5 2.5 0 0 0-2.5 2.5v1.2H8.2A2.2 2.2 0 0 0 6 8.4v1.8a1.2 1.2 0 0 0 1.2 1.2h.8v7.6a1 1 0 0 0 1 1h2.5v-3.5h3V20h2.5a1 1 0 0 0 1-1v-9.6a2.5 2.5 0 0 0-2.5-2.5H13V5a1 1 0 0 1 1-1h1V2.5h-3z" />
  </svg>
);

export const CustomApiIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="#818CF8"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3" />
    <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3" />
  </svg>
);
