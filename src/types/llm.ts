export interface LlmStartEvent {
  action: string;
  provider: string;
  model: string;
  has_image?: boolean;
  smart_routed?: boolean;
}

export interface LlmTokenEvent {
  token: string;
}

export interface LlmCompleteEvent {
  text: string;
  action: string;
}

export type LlmErrorKind =
  | "missing_key"
  | "bad_key"
  | "no_credit"
  | "model_not_found"
  | "model_not_chosen"
  | "rate_limited"
  | "unreachable"
  | "timeout"
  | "empty_response"
  | "invalid_endpoint"
  | "unknown_provider"
  | "provider_error"
  | "cancelled";

export interface LlmErrorEvent {
  error: string;
  action: string;
  kind?: LlmErrorKind;
  provider?: string;
}

export interface LlmNoticeEvent {
  message: string;
}
