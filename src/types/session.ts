import { TranscriptSegment } from "./transcript";

export interface InterviewSession {
  id: string;
  title: string;
  role: string;
  company?: string;
  jobDescription?: string;
  candidateResume?: string;
  createdAt: string;
  lastActive: string;
  transcripts: TranscriptSegment[];
  lastSuggestion?: string;
}
