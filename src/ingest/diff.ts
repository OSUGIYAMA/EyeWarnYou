// Structural diffs between consecutive snapshots → human-readable "regulatory update" entries.
import type { Ccl, CountryChart, CountryGroups, JpCountryLists, ScreeningDataset } from "../shared/regs.ts";

export interface ChangeEntry {
  kind: "ccl" | "chart" | "groups" | "jp-countries" | "screening";
  severity: "high" | "medium" | "low";
  title: string;
  detail?: string;
  refs?: string[];
  detectedAt?: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const diffSnapshots = {
  chart(prev: CountryChart | null, next: CountryChart): ChangeEntry[] {
    if (!prev) return [];
    const out: ChangeEntry[] = [];
    const before = new Map(prev.rows.map((r) => [r.iso2, r]));
    for (const r of next.rows) {
      const p = before.get(r.iso2);
      if (!p) {
        out.push({ kind: "chart", severity: "medium", title: `Country Chart: ${r.earName} added`, refs: [r.iso2] });
        continue;
      }
      const added = r.x.filter((c) => !p.x.includes(c));
      const removed = p.x.filter((c) => !r.x.includes(c));
      if (added.length || removed.length)
        out.push({
          kind: "chart",
          severity: added.length ? "high" : "medium",
          title: `Country Chart: ${r.earName}`,
          detail: [added.length && `now requires a license for ${added.join(", ")}`, removed.length && `no longer marked for ${removed.join(", ")}`]
            .filter(Boolean)
            .join("; "),
          refs: [r.iso2],
        });
    }
    return out;
  },

  groups(prev: CountryGroups | null, next: CountryGroups): ChangeEntry[] {
    if (!prev) return [];
    const out: ChangeEntry[] = [];
    const isos = new Set([...Object.keys(prev.membership), ...Object.keys(next.membership)]);
    for (const iso2 of isos) {
      const a = prev.membership[iso2] ?? [];
      const b = next.membership[iso2] ?? [];
      const added = b.filter((g) => !a.includes(g));
      const removed = a.filter((g) => !b.includes(g));
      if (added.length || removed.length)
        out.push({
          kind: "groups",
          severity: added.some((g) => g.startsWith("D") || g.startsWith("E")) ? "high" : "medium",
          title: `Country Groups: ${iso2}`,
          detail: [added.length && `added to ${added.join(", ")}`, removed.length && `removed from ${removed.join(", ")}`].filter(Boolean).join("; "),
          refs: [iso2],
        });
    }
    return out;
  },

  ccl(prev: Ccl | null, next: Ccl): ChangeEntry[] {
    if (!prev) return [];
    const out: ChangeEntry[] = [];
    const before = new Map(prev.eccns.map((e) => [e.id, e]));
    const after = new Map(next.eccns.map((e) => [e.id, e]));
    for (const [id, e] of after) {
      const p = before.get(id);
      if (!p) {
        out.push({ kind: "ccl", severity: "high", title: `New ECCN ${id}`, detail: e.heading, refs: [id] });
        continue;
      }
      const parts: string[] = [];
      if (p.heading !== e.heading) parts.push("heading revised");
      const ctl = (x: typeof e) => x.controls.map((c) => [c.reason, c.columns, c.mode, c.paragraphs, c.chart]);
      if (!same(ctl(p), ctl(e))) parts.push("license requirements changed");
      if (!same(p.licenseExceptions, e.licenseExceptions)) parts.push("license exceptions changed");
      if (!same(p.paragraphs, e.paragraphs)) parts.push("items paragraphs changed");
      if (parts.length)
        out.push({
          kind: "ccl",
          severity: parts.includes("license requirements changed") ? "high" : "medium",
          title: `ECCN ${id} amended`,
          detail: parts.join(", "),
          refs: [id],
        });
    }
    for (const id of before.keys())
      if (!after.has(id)) out.push({ kind: "ccl", severity: "high", title: `ECCN ${id} removed`, refs: [id] });
    return out;
  },

  jpCountries(prev: JpCountryLists | null, next: JpCountryLists): ChangeEntry[] {
    if (!prev) return [];
    const out: ChangeEntry[] = [];
    const cmp = (key: "groupA" | "unArmsEmbargo" | "concern", label: string) => {
      const added = next[key].filter((c) => !prev[key].includes(c));
      const removed = prev[key].filter((c) => !next[key].includes(c));
      if (added.length || removed.length)
        out.push({
          kind: "jp-countries",
          severity: "high",
          title: `輸出令 ${label} 改正`,
          detail: [added.length && `追加: ${added.join(", ")}`, removed.length && `削除: ${removed.join(", ")}`].filter(Boolean).join(" / "),
          refs: [...added, ...removed],
        });
    };
    cmp("groupA", "別表第三（グループA）");
    cmp("unArmsEmbargo", "別表第三の二（国連武器禁輸国）");
    cmp("concern", "別表第四（懸念国）");
    if (prev.appendix3_3 !== next.appendix3_3)
      out.push({ kind: "jp-countries", severity: "high", title: "輸出令 別表第三の三 改正", detail: next.appendix3_3.slice(0, 300) });
    return out;
  },

  screening(prev: ScreeningDataset | null, next: ScreeningDataset): ChangeEntry[] {
    if (!prev) return [];
    const out: ChangeEntry[] = [];
    const watched = ["EL", "MEU", "UVL", "DPL", "METI-EUL", "SDN", "CN-ECL", "CN-WL", "CN-UEL", "CN-AFSL"] as const;
    const labels: Record<string, string> = {
      EL: "Entity List",
      MEU: "Military End User List",
      UVL: "Unverified List",
      DPL: "Denied Persons List",
      "METI-EUL": "外国ユーザーリスト",
      SDN: "OFAC SDN List",
      "CN-ECL": "China Export Control Control List (出口管制管控名单)",
      "CN-WL": "China Watch List (关注名单)",
      "CN-UEL": "China Unreliable Entity List",
      "CN-AFSL": "China countermeasure list (反制清单)",
    };
    for (const list of watched) {
      const a = new Map(prev.entries.filter((e) => e.list === list).map((e) => [e.id, e]));
      const b = new Map(next.entries.filter((e) => e.list === list).map((e) => [e.id, e]));
      if (!a.size) continue; // first load for this list
      const added = [...b.values()].filter((e) => !a.has(e.id));
      const removed = [...a.values()].filter((e) => !b.has(e.id));
      if (added.length)
        out.push({
          kind: "screening",
          severity: list === "SDN" ? "medium" : "high",
          title: `${labels[list]}: ${added.length} addition${added.length > 1 ? "s" : ""}`,
          detail: added
            .slice(0, 25)
            .map((e) => `${e.name}${e.countries.length ? ` (${e.countries.join(", ")})` : ""}`)
            .join("; ") + (added.length > 25 ? ` … +${added.length - 25} more` : ""),
          refs: added.slice(0, 200).map((e) => e.id),
        });
      if (removed.length)
        out.push({
          kind: "screening",
          severity: "low",
          title: `${labels[list]}: ${removed.length} removal${removed.length > 1 ? "s" : ""}`,
          detail: removed.slice(0, 25).map((e) => e.name).join("; "),
          refs: removed.slice(0, 200).map((e) => e.id),
        });
    }
    return out;
  },
};
