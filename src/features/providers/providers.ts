import type { AppConfig } from "../../types/config";
import type { KeyId } from "../../services/tauriApi";

type StringField = {
  [K in keyof AppConfig]-?: NonNullable<AppConfig[K]> extends string ? K : never;
}[keyof AppConfig];

export interface ProviderMeta {
  /** Matches the backend provider table. */
  slug: string;
  name: string;
  /** One plain sentence. No claims the app cannot back up. */
  blurb: string;
  keyId: KeyId | null;
  /** A key may be saved but the provider also works without one. */
  keyOptional?: boolean;
  keyPlaceholder: string;
  /** Where a key is created, shown as a link next to the key field. */
  keyPage?: string;
  modelField: StringField;
  /** Set for providers whose address the user supplies. */
  endpointField?: StringField;
  endpointPlaceholder?: string;
}

export const PROVIDERS: ProviderMeta[] = [
  {
    slug: "openrouter",
    name: "OpenRouter",
    blurb: "One key for models from many companies.",
    keyId: "openrouter",
    keyPlaceholder: "sk-or-v1-...",
    keyPage: "https://openrouter.ai/keys",
    modelField: "openrouter_model",
  },
  {
    slug: "gemini",
    name: "Google Gemini",
    blurb: "Google's models. Keys come from Google AI Studio.",
    keyId: "gemini",
    keyPlaceholder: "AIza...",
    keyPage: "https://aistudio.google.com/apikey",
    modelField: "gemini_model",
  },
  {
    slug: "openai",
    name: "OpenAI",
    blurb: "OpenAI's models.",
    keyId: "openai",
    keyPlaceholder: "sk-...",
    keyPage: "https://platform.openai.com/api-keys",
    modelField: "openai_model",
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    blurb: "Claude models.",
    keyId: "anthropic",
    keyPlaceholder: "sk-ant-...",
    keyPage: "https://console.anthropic.com/settings/keys",
    modelField: "anthropic_model",
  },
  {
    slug: "deepseek",
    name: "DeepSeek",
    blurb: "DeepSeek's models, paid from prepaid credit.",
    keyId: "deepseek",
    keyPlaceholder: "sk-...",
    keyPage: "https://platform.deepseek.com/api_keys",
    modelField: "deepseek_model",
  },
  {
    slug: "groq",
    name: "Groq",
    blurb: "Open models on Groq's servers.",
    keyId: "groq",
    keyPlaceholder: "gsk_...",
    keyPage: "https://console.groq.com/keys",
    modelField: "groq_model",
  },
  {
    slug: "ollama",
    name: "Ollama",
    blurb: "Models that run on this computer. No key, and nothing leaves the machine.",
    keyId: null,
    keyPlaceholder: "",
    modelField: "ollama_model",
    endpointField: "ollama_endpoint",
    endpointPlaceholder: "http://localhost:11434",
  },
  {
    slug: "custom",
    name: "Custom endpoint",
    blurb: "Any server that speaks the OpenAI chat format, such as LM Studio.",
    keyId: "custom",
    keyOptional: true,
    keyPlaceholder: "Leave empty if the server needs no key",
    modelField: "custom_model",
    endpointField: "custom_endpoint",
    endpointPlaceholder: "http://localhost:1234/v1",
  },
];

export function providerBySlug(slug: string | undefined): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}

/** True when nothing more is needed before a request can be sent, as far as the key goes. */
export function keyIsReady(meta: ProviderMeta, keys: Partial<Record<KeyId, boolean>> | null): boolean {
  if (!meta.keyId || meta.keyOptional) return true;
  return keys?.[meta.keyId] === true;
}
