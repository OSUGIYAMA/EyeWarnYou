// trade.gov Consolidated Screening List (CSL) — 11 US Government export screening lists in one file.
// https://www.trade.gov/consolidated-screening-list (downloadable file, no API key required)
import type { ScreeningEntry, ScreeningListId, SourceStamp } from "../shared/regs.ts";

export const CSL_URL = "https://data.trade.gov/downloadable_consolidated_screening_list/v1/consolidated.json";

const SOURCE_MAP: [RegExp, ScreeningListId][] = [
  [/^Entity List/i, "EL"],
  [/^Military End User/i, "MEU"],
  [/^Unverified List/i, "UVL"],
  [/^Denied Persons/i, "DPL"],
  [/^Specially Designated Nationals/i, "SDN"],
  [/^Sectoral Sanctions/i, "SSI"],
  [/^Nonproliferation Sanctions/i, "ISN"],
  [/^ITAR Debarred/i, "DTC"],
  [/Chinese Military-Industrial Complex/i, "CMIC"],
  [/Menu-Based Sanctions/i, "NS-MBS"],
  [/Palestinian Legislative Council/i, "PLC"],
  [/^Capta List/i, "CAP"],
];

interface RawCsl {
  id: string;
  source: string;
  name: string;
  alt_names?: string[] | null;
  type?: string | null;
  addresses?: { address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null }[] | null;
  programs?: string[] | null;
  license_requirement?: string | null;
  license_policy?: string | null;
  federal_register_notice?: string | null;
  start_date?: string | null;
  remarks?: string | null;
  source_list_url?: string | null;
  nationalities?: string[] | null;
  citizenships?: string[] | null;
  country?: string | null;
}

export async function fetchCsl(): Promise<{ results: RawCsl[]; search_performed_at?: string }> {
  const res = await fetch(CSL_URL, { headers: { "accept-encoding": "gzip" } });
  if (!res.ok) throw new Error(`CSL download failed: HTTP ${res.status}`);
  return (await res.json()) as { results: RawCsl[]; search_performed_at?: string };
}

export function normalizeCsl(raw: { results: RawCsl[] }): ScreeningEntry[] {
  const out: ScreeningEntry[] = [];
  for (const r of raw.results) {
    const list = SOURCE_MAP.find(([re]) => re.test(r.source))?.[1];
    if (!list || !r.name) continue;
    const countries = new Set<string>();
    const addresses: string[] = [];
    for (const a of r.addresses ?? []) {
      if (a.country && /^[A-Z]{2}$/.test(a.country)) countries.add(a.country);
      const line = [a.address, a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", ");
      if (line) addresses.push(line);
    }
    for (const c of [...(r.nationalities ?? []), ...(r.citizenships ?? []), r.country ?? ""]) {
      if (c && /^[A-Z]{2}$/.test(c)) countries.add(c);
    }
    const entry: ScreeningEntry = {
      id: `${list}:${r.id}`,
      list,
      name: r.name.trim(),
      altNames: (r.alt_names ?? []).map((n) => n.trim()).filter(Boolean),
      type: r.type ?? undefined,
      countries: [...countries],
      addresses,
      programs: r.programs ?? [],
    };
    if (r.license_requirement) entry.licenseRequirement = r.license_requirement;
    if (r.license_policy) entry.licensePolicy = r.license_policy;
    if (r.federal_register_notice) entry.frNotice = r.federal_register_notice;
    if (r.start_date) entry.startDate = r.start_date;
    if (r.remarks) entry.remarks = r.remarks;
    if (r.source_list_url) entry.sourceUrl = r.source_list_url;
    out.push(entry);
  }
  if (out.length < 10000) throw new Error(`CSL: only ${out.length} entries normalized`);
  return out;
}

export function cslStamp(fetchedAt: string, performedAt?: string): SourceStamp {
  return {
    source: "Consolidated Screening List (trade.gov)",
    url: "https://www.trade.gov/consolidated-screening-list",
    asOf: (performedAt ?? fetchedAt).slice(0, 10),
    fetchedAt,
  };
}
