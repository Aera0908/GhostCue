export interface AudioDeviceInfo {
  id: string;
  name: string;
  is_default: boolean;
  is_input: boolean;
  channels: number;
  sample_rate: number;
}

export interface AudioDevicesResponse {
  inputs: AudioDeviceInfo[];
  outputs: AudioDeviceInfo[];
}

export interface AudioLevelEvent {
  level: number;
  active: boolean;
  speaker: "Interviewer" | "Candidate";
}
