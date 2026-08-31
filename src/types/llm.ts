export interface LlmStartEvent {
  action: string;
  provider: string;
  model: string;
}

export interface LlmTokenEvent {
  token: string;
}

export interface LlmCompleteEvent {
  text: string;
  action: string;
}

export interface LlmErrorEvent {
  error: string;
  action: string;
}
