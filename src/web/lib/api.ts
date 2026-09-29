// Thin client for the Kanmon API.
import type { Case, Item, Party } from "@/shared/case.ts";
import type { Assessment, Citation } from "@/shared/assessment.ts";
import type { Country, CountryChart, CountryGroups, Eccn, JpAppendix1Row, RegSection, ScreeningEntry, SourceStamp } from "@/shared/regs.ts";

export type { Case, Item, Party, Assessment, Citation, Country, Eccn, ScreeningEntry, SourceStamp, RegSection };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body instanceof FormData ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? res.statusText, res.status, data?.code);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
};

/** POST that streams Server-Sent Events. Calls onEvent for each event; resolves when the stream ends. */
export async function streamPost(url: string, body: unknown, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`/api${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    const t = await res.text();
    let msg = res.statusText;
    let code: string | undefined;
    try {
      const j = JSON.parse(t);
      msg = j.error ?? msg;
      code = j.code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(msg, res.status, code);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      const raw = data.join("\n");
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
      onEvent(event, parsed);
    }
  }
}

// ---- Response shapes

export interface Question {
  id: string;
  jurisdiction: "US" | "JP" | "CN";
  group: "end_use" | "end_user" | "notice" | "red_flag";
  text: string;
  help?: string;
  cite: Citation;
  answer: "yes" | "no" | "unknown";
}

export interface FdpInfo {
  gate: { id: string; text: string };
  rules: { id: string; para: string; name: string; product: string; scope: string }[];
}

export interface CaseView {
  case: Case;
  assessment: Assessment;
  questions: Question[];
  fdp: Record<string, FdpInfo>;
}

export interface CaseSummary {
  id: string;
  ref: string;
  title: string;
  status: Case["status"];
  destination: string;
  outcome: Assessment["overall"] | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  partyCount: number;
  createdBy: string;
}

export interface CountryInfo extends Country {
  groups: string[];
  chart: string[];
  jp: { groupA: boolean; unArmsEmbargo: boolean; concern: boolean; russiaDiversion: boolean };
  unArmsEmbargoUS: boolean;
}

export interface PolicyStatus {
  id: string;
  title: string;
  state: string;
  inactiveUntil?: string;
  effectiveFrom?: string;
  summary: string;
  cites: string[];
  sources: { label: string; url: string }[];
}

export interface Meta {
  manifest: { generatedAt: string; stamps: Record<string, SourceStamp>; counts: Record<string, number> } | null;
  loadedAt: string;
  stamps: { ccl: SourceStamp; chart: SourceStamp; groups: SourceStamp; jp: SourceStamp; jpList: SourceStamp; screening: SourceStamp[] };
  counts: { eccns: number; screening: number; sections: number };
  policyStatus: PolicyStatus[];
  settings: Settings;
}

export interface Settings {
  userName: string;
  company: string;
  fxPerUsd: Record<string, number>;
  fxAsOf: string;
  bulkLicenses: string[];
  screeningThreshold: number;
  aiModel: string;
  aiConfigured: boolean;
  aiKeySource: "env" | "settings" | null;
}

export interface ScreeningMatch {
  entry: ScreeningEntry;
  matchedName: string;
  score: number;
  nameScore: number;
  countryMatch: "match" | "mismatch" | "unknown";
  matchedTokens: string[];
}

export interface ChangeEntry {
  kind: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail?: string;
  refs?: string[];
  detectedAt?: string;
}

export type EccnDetail = Eccn & { meuSupp2: boolean; stamp: SourceStamp };
export type { CountryChart, CountryGroups, JpAppendix1Row };
