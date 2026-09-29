// Claude client. The API key comes from Settings (stored locally) or ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { getSettings, audit } from "../db.ts";

export class AiNotConfigured extends Error {
  constructor() {
    super("AI assistance is not configured. Add an Anthropic API key in Settings (or set ANTHROPIC_API_KEY).");
  }
}

let cached: { key: string; client: Anthropic } | null = null;

export function claude(): { client: Anthropic; model: string } {
  const s = getSettings();
  const key = s.anthropicApiKey;
  if (!key) throw new AiNotConfigured();
  if (!cached || cached.key !== key) cached = { key, client: new Anthropic({ apiKey: key, maxRetries: 2 }) };
  return { client: cached.client, model: s.aiModel || "claude-opus-5" };
}

/**
 * Request fields shared by every call: server-side refusal fallback (routes by refusal
 * category, so a declined request is re-run on Anthropic's recommended fallback model).
 */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export function logUsage(feature: string, usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null } | undefined, model: string) {
  audit("ai", null, feature, { model, input: usage?.input_tokens, output: usage?.output_tokens, cacheRead: usage?.cache_read_input_tokens ?? 0 });
}

export function refusalMessage(stopReason: string | null | undefined): string | null {
  return stopReason === "refusal" ? "The model declined this request. Try rephrasing, or complete this step manually." : null;
}
