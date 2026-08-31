export interface TranscriptSegment {
  id: string;
  speaker: "Interviewer" | "Candidate" | string;
  text: string;
  timestamp: string;
  is_final: boolean;
  confidence: number;
  duration_secs: number;
}
