// AI-assisted steps. Each one is retrieval-grounded (the model only sees regulation text that
// EyeWarnYou retrieved from its own snapshots) and returns a *draft* for a human reviewer.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { store } from "../store.ts";
import { AiNotConfigured, claude, FALLBACK, logUsage, refusalMessage } from "./client.ts";
import { Classification, ContractExtraction, QueryPlan, Romanization } from "./schemas.ts";
import type { Eccn } from "../../shared/regs.ts";

export const aiRoutes = new Hono();

aiRoutes.onError((err, c) => {
  if (err instanceof AiNotConfigured) return c.json({ error: err.message, code: "ai_not_configured" }, 400);
  if (err instanceof z.ZodError) return c.json({ error: "Invalid request", issues: err.issues }, 400);
  console.error(err);
  return c.json({ error: (err as Error).message }, 502);
});

aiRoutes.get("/status", (c) => {
  try {
    const { model } = claude();
    return c.json({ configured: true, model });
  } catch {
    return c.json({ configured: false });
  }
});

// ---------------------------------------------------------------------------
// Classification assistant

const CLASSIFY_SYSTEM = `You assist an export-control specialist at a Japanese company in classifying a product under two regimes at once: the US Commerce Control List (Supplement No. 1 to 15 CFR Part 774) and Japan's list controls (輸出貿易管理令 別表第一 and the 貨物等省令).

You receive the product information and the text of candidate CCL entries and Japanese provisions that were retrieved by search. Work from that text:
- Follow the CCL Order of Review (Supplement No. 4 to Part 774): 600-series and 9x515 entries first, then the rest of the CCL; EAR99 only when no entry describes the item.
- Classify to the most specific paragraph. A paragraph applies only when every parameter it states is met, so compare each threshold with the product's stated values and record whether it is met, not met, or unknown. Read Notes, Technical Notes, "specially designed" and Related Controls.
- For Japan, identify the 項 and the 貨物等省令 provision whose specification the product meets, or explain why it is 非該当. Both lists derive largely from the Wassenaar Arrangement, but check the Japanese text itself rather than assuming a mirror.
- If the correct entry is probably not among the candidates, say so in caveats rather than forcing a match.
- When facts needed for a decision are missing, give your best provisional answer, lower the confidence, and list precisely what the reviewer must confirm.

Your output is a draft that a qualified reviewer will verify; state uncertainty plainly.`;

function eccnText(e: Eccn, max = 14000): string {
  const lines: string[] = [`=== ECCN ${e.id} — ${e.heading}`];
  if (e.reasonForControl.length) lines.push(`Reason for Control: ${e.reasonForControl.join(", ")}`);
  for (const c of e.controls) lines.push(`Control: ${c.scope} → ${c.chart}`);
  for (const b of e.blocks) {
    if (b.kind === "field" && !/^(LVS|GBS|TSR|STA|IEC|AIA|ACM|NAC\/ACA|LPP|ACE|APP|ENC|HBM|Reason for Control|Control\(s\))$/.test(b.label)) lines.push(`${b.label}: ${b.text}`);
    else if (b.kind === "para") lines.push(`${b.ref ? `${b.ref}. ` : ""}${b.text}`);
    else if (b.kind === "note") lines.push(`[${b.title ?? "Note"}] ${b.text}`);
  }
  const s = lines.join("\n");
  return s.length > max ? `${s.slice(0, max)}\n[… entry truncated]` : s;
}

const ClassifyBody = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  specs: z.string().default(""),
  manufacturer: z.string().default(""),
  model: z.string().default(""),
  hsCode: z.string().default(""),
});

aiRoutes.post("/classify", async (c) => {
  const body = ClassifyBody.parse(await c.req.json());
  const { client, model } = claude();
  return streamSSE(c, async (stream) => {
    const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
    const product = [
      `Product: ${body.name}`,
      body.manufacturer && `Manufacturer: ${body.manufacturer}`,
      body.model && `Model: ${body.model}`,
      body.hsCode && `HS code: ${body.hsCode}`,
      body.description && `Description: ${body.description}`,
      body.specs && `Specifications:\n${body.specs}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      // 1. Plan the search
      await send("progress", { step: "plan", message: "Identifying technical terms and likely entries" });
      const plan = await client.beta.messages.parse({
        model,
        max_tokens: 2000,
        ...FALLBACK,
        output_config: { effort: "low", format: betaZodOutputFormat(QueryPlan) },
        messages: [{ role: "user", content: `Plan a search of the US Commerce Control List and Japan's 輸出令別表第一 / 貨物等省令 for classifying this product.\n\n${product}` }],
      });
      logUsage("classify.plan", plan.usage, model);
      const q = plan.parsed_output ?? { terms_en: [], terms_ja: [], likely_eccns: [], likely_kou: [] };

      // 2. Retrieve candidate entries
      await send("progress", { step: "retrieve", message: "Retrieving candidate CCL entries and Japanese provisions" });
      const scores = new Map<string, number>();
      for (const id of q.likely_eccns) {
        const e = store.eccn(id);
        if (e) scores.set(e.id, (scores.get(e.id) ?? 0) + 50);
      }
      for (const query of [`${body.name} ${body.description}`, q.terms_en.join(" "), ...q.terms_en.slice(0, 6)]) {
        if (!query.trim()) continue;
        store.eccnIndex.search(query).slice(0, 15).forEach((h, i) => scores.set(h.id as string, (scores.get(h.id as string) ?? 0) + h.score / (i + 1)));
      }
      const candidates = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => store.eccn(id)!)
        .filter((e) => e && !e.reserved)
        .slice(0, 12);
      const jpHits = new Map<string, { label: string; text: string }>();
      for (const query of [q.terms_ja.join(" "), ...q.terms_ja.slice(0, 6), ...q.likely_kou.map((k) => `${k}の項`)]) {
        if (!query.trim()) continue;
        for (const h of store.jpIndex.search(query).slice(0, 12)) jpHits.set(h.id as string, { label: h.label as string, text: h.text as string });
      }
      await send("candidates", { eccns: candidates.map((e) => ({ id: e.id, heading: e.heading })), jp: [...jpHits.values()].slice(0, 30).map((h) => h.label) });

      // 3. Classify
      await send("progress", { step: "classify", message: `Comparing specifications against ${candidates.length} CCL entries and ${Math.min(jpHits.size, 40)} Japanese provisions` });
      const context = [
        "## Candidate CCL entries (15 CFR 774 Supp. No. 1, current eCFR text)",
        ...candidates.map((e) => eccnText(e)),
        "## Candidate Japanese provisions (輸出令別表第一 / 貨物等省令, current e-Gov text)",
        ...[...jpHits.values()].slice(0, 40).map((h) => `【${h.label}】${h.text}`),
      ].join("\n\n");
      const stream2 = client.beta.messages.stream({
        model,
        max_tokens: 16000,
        ...FALLBACK,
        thinking: { type: "adaptive" },
        output_config: { effort: "high", format: betaZodOutputFormat(Classification) },
        system: [{ type: "text", text: CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `${context}\n\n## Product to classify\n${product}` }],
      });
      const final = await stream2.finalMessage();
      logUsage("classify", final.usage, model);
      const refused = refusalMessage(final.stop_reason);
      if (refused) return void (await send("error", { message: refused }));
      const text = final.content.find((b) => b.type === "text")?.text ?? "";
      const result = Classification.parse(JSON.parse(text));

      // 4. Verify the model's references against the dataset
      const checks: string[] = [];
      const eccn = result.us.eccn.toUpperCase();
      if (eccn !== "EAR99") {
        const e = store.eccn(eccn);
        if (!e) checks.push(`ECCN ${eccn} does not exist in the current CCL`);
        else if (result.us.paragraph && !e.paragraphs.some((p) => p.ref === result.us.paragraph || p.ref.startsWith(`${result.us.paragraph}.`)))
          checks.push(`Paragraph ${eccn}.${result.us.paragraph} was not found in the current text of ${eccn}`);
      }
      if (result.jp.listStatus === "listed" && result.jp.kou && !store.data.jpList.appendix1.some((r) => result.jp.kou.startsWith(r.label) || r.label.startsWith(result.jp.kou.replace(/（.*$/, ""))))
        checks.push(`項番 ${result.jp.kou} could not be matched to 輸出令別表第一`);
      await send("result", { result, checks, candidates: candidates.map((e) => e.id) });
    } catch (e) {
      await send("error", { message: e instanceof AiNotConfigured ? e.message : (e as Error).message });
    }
  });
});

// ---------------------------------------------------------------------------
// Contract / order intake

const EXTRACT_SYSTEM = `You read export contracts, purchase orders and similar documents for an export-control team and extract the facts needed to screen the transaction. Extract only what the document states; leave a field empty ('' / null) when it is not stated. Normalize countries to ISO 3166-1 alpha-2 codes and currencies to ISO 4217. For every party and item, include a short verbatim quote as evidence. Under 'concerns', note anything a compliance officer would want to question (vague or military end use, a freight forwarder as final destination, unusual routing or payment terms, reluctance to state end use, onward transfer language).`;

aiRoutes.post("/extract", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file instanceof File ? form.file : null;
  const pasted = typeof form.text === "string" ? form.text : "";
  if (!file && !pasted.trim()) return c.json({ error: "Upload a PDF, DOCX or text file, or paste the text" }, 400);
  const { client, model } = claude();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let sourceText = pasted;
  if (file) {
    const buf = Buffer.from(await file.arrayBuffer());
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") }, title: file.name });
      try {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        sourceText = (await extractText(pdf, { mergePages: true })).text;
      } catch {
        sourceText = "";
      }
    } else if (/\.docx$/i.test(file.name)) {
      sourceText = (await mammoth.extractRawText({ buffer: buf })).value;
      content.push({ type: "text", text: `Document "${file.name}":\n\n${sourceText}` });
    } else {
      sourceText = buf.toString("utf8");
      content.push({ type: "text", text: `Document "${file.name}":\n\n${sourceText}` });
    }
  } else content.push({ type: "text", text: `Document:\n\n${pasted}` });
  content.push({ type: "text", text: "Extract the transaction for export-control screening." });

  const msg = await client.beta.messages
    .stream({
      model,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium", format: betaZodOutputFormat(ContractExtraction) },
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content }],
    })
    .finalMessage();
  logUsage("extract", msg.usage, model);
  const refused = refusalMessage(msg.stop_reason);
  if (refused) return c.json({ error: refused }, 422);
  const text = msg.content.find((b) => b.type === "text")?.text ?? "{}";
  const result = ContractExtraction.parse(JSON.parse(text));
  return c.json({ result, fileName: file?.name ?? null, textPreview: sourceText.slice(0, 20000) });
});

// ---------------------------------------------------------------------------
// Ask the regulations

const ASK_SYSTEM = `You answer questions about export controls for a compliance team, using only the numbered sources provided (current text of the US EAR, Japan's FEFTA regime, and the Commerce Control List). Cite every statement with the source numbers in square brackets, e.g. [S2]. If the sources do not settle the question, say so and name the provision the team should read. Quote short phrases where precision matters. Answer in the language of the question. This is research support, not legal advice.`;

aiRoutes.post("/ask", async (c) => {
  const body = z.object({ question: z.string().min(3), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20).default([]) }).parse(await c.req.json());
  const { client, model } = claude();
  const hits = store.libIndex.search(body.question).slice(0, 12);
  const eccnIds = [...new Set([...body.question.toUpperCase().matchAll(/\b\d[A-E]\d{3}\b/g)].map((m) => m[0]))].slice(0, 3);
  const sources = [
    ...eccnIds.map((id) => store.eccn(id)).filter((e): e is Eccn => !!e).map((e) => ({ kind: "eccn" as const, ref: e.id, cite: `15 CFR 774 Supp. No. 1 — ECCN ${e.id}`, sectionId: null as string | null, text: eccnText(e, 9000) })),
    ...hits.map((h) => {
      const ch = store.chunks.get(h.id as string)!;
      return { kind: "section" as const, ref: ch.id, cite: ch.cite, sectionId: ch.sectionId, text: ch.text };
    }),
  ].map((s, i) => ({ ...s, n: i + 1 }));
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "sources", data: JSON.stringify(sources.map(({ text, ...rest }) => ({ ...rest, preview: text.slice(0, 400) }))) });
    try {
      const context = sources.map((s) => `[S${s.n}] ${s.cite}\n${s.text}`).join("\n\n---\n\n");
      const s = client.beta.messages.stream({
        model,
        max_tokens: 8000,
        ...FALLBACK,
        output_config: { effort: "medium" },
        system: ASK_SYSTEM,
        messages: [
          ...body.history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: `Sources:\n\n${context}\n\nQuestion: ${body.question}` },
        ],
      });
      for await (const ev of s) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") await stream.writeSSE({ event: "delta", data: JSON.stringify(ev.delta.text) });
      }
      const final = await s.finalMessage();
      logUsage("ask", final.usage, model);
      const refused = refusalMessage(final.stop_reason);
      if (refused) await stream.writeSSE({ event: "error", data: JSON.stringify({ message: refused }) });
      await stream.writeSSE({ event: "done", data: "{}" });
    } catch (e) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: (e as Error).message }) });
    }
  });
});

// ---------------------------------------------------------------------------
// Name romanization for screening (CJK names → candidate English names)

aiRoutes.post("/romanize", async (c) => {
  const body = z.object({ name: z.string().min(1), country: z.string().optional() }).parse(await c.req.json());
  const { client, model } = claude();
  const msg = await client.beta.messages.parse({
    model,
    max_tokens: 2000,
    ...FALLBACK,
    output_config: { effort: "low", format: betaZodOutputFormat(Romanization) },
    messages: [
      {
        role: "user",
        content: `Give the English names under which this organization may appear on sanctions and export-control lists: its official English name if you know it, and standard romanizations (pinyin / Hepburn / Revised Romanization). Do not invent names; return fewer candidates if unsure.\n\nName: ${body.name}${body.country ? `\nCountry: ${body.country}` : ""}`,
      },
    ],
  });
  logUsage("romanize", msg.usage, model);
  return c.json(msg.parsed_output ?? { candidates: [] });
});
