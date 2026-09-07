import { TranscriptSegment } from "./transcript";

export interface AiLogEntry {
  id: string;
  timestamp: string;
  action: string;
  query?: string;
  answer: string;
  provider?: string;
  model?: string;
}

export interface InterviewSession {
  id: string;
  title: string;
  role: string;
  company?: string;
  jobDescription?: string;
  candidateResume?: string;
  projectDirectory?: string;
  projectContext?: string;
  createdAt: string;
  lastActive: string;
  transcripts: TranscriptSegment[];
  aiLogs?: AiLogEntry[];
  lastSuggestion?: string;
}


