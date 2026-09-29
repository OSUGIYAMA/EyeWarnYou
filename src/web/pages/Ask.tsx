import { ArrowUp, ChevronRight, MessagesSquare, Square } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Page, useMeta } from "../components/AppShell.tsx";
import { useRegSheet } from "../components/RegSheet.tsx";
import { Button, Card, Spinner, StatusDot } from "../components/ui/index.tsx";
import { ApiError, streamPost } from "../lib/api.ts";
import { cx } from "../lib/format.ts";

interface Source {
  n: number;
  kind: "eccn" | "section";
  ref: string;
  cite: string;
  sectionId: string | null;
  preview: string;
}
interface Msg {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
  streaming?: boolean;
}

const EXAMPLES = [
  "When does US de minimis use a 10% threshold instead of 25%?",
  "Which license exceptions can be used for items controlled only for NS reasons to Country Group B?",
  "一般国向けの16の項（1）の貨物について、通常兵器キャッチオールの需要者要件はどう定められていますか？",
  "What does §744.21 require for military end users in China?",
];

export function AskPage() {
  const meta = useMeta();
  const open = useRegSheet();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const busy = msgs.some((m) => m.streaming);

  // Grow the composer with its content, up to a limit.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }, { role: "assistant", content: "", streaming: true }]);
    setInput("");
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patch = (fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m, i) => (i === all.length - 1 ? fn(m) : m)));
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: "end" }));
    try {
      await streamPost(
        "/ai/ask",
        { question: q, history: history.slice(-10) },
        (ev, data) => {
          if (ev === "sources") patch((m) => ({ ...m, sources: data as Source[] }));
          if (ev === "delta") {
            patch((m) => ({ ...m, content: m.content + (data as string) }));
            bottom.current?.scrollIntoView({ block: "end" });
          }
          if (ev === "error") patch((m) => ({ ...m, error: (data as { message: string }).message }));
        },
        ctrl.signal,
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") patch((m) => ({ ...m, error: e instanceof ApiError ? e.message : String(e) }));
    } finally {
      patch((m) => ({ ...m, streaming: false }));
    }
  };

  const openSource = (s: Source) => (s.kind === "eccn" ? open({ kind: "eccn", id: s.ref }) : s.sectionId && open({ kind: "section", id: s.sectionId, label: s.cite }));

  if (meta.data && !meta.data.settings.aiConfigured)
    return (
      <Page>
        <div className="mx-auto max-w-[720px]">
          <h1 className="mb-8 text-[30px] font-bold leading-tight tracking-[-0.022em]">Ask the regulations</h1>
          <Card className="flex flex-col items-center px-6 py-12 text-center">
            <MessagesSquare className="size-8 stroke-[1.5] text-fg-3" />
            <div className="mt-3 text-[17px] font-semibold tracking-tight">Ask in plain words, get an answer with its sources</div>
            <p className="mt-1 max-w-md text-[14px] leading-relaxed text-fg-2">
              EyeWarnYou finds the passages in the EAR, the Commerce Control List and Japanese law, and Claude answers only from them, citing each one. This needs an Anthropic API key. The{" "}
              <Link to="/regulations/library" className="text-accent-text hover:underline">
                regulation library
              </Link>{" "}
              works without one.
            </p>
            <Link to="/settings#ai" className="mt-5">
              <Button variant="primary">Add an API key</Button>
            </Link>
          </Card>
        </div>
      </Page>
    );

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col lg:h-dvh">
      <div className="scroll-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[720px] px-5 pb-10 pt-10 sm:px-8">
          {msgs.length === 0 ? (
            <div className="pt-[6vh]">
              <h1 className="text-[30px] font-bold leading-tight tracking-[-0.022em]">Ask the regulations</h1>
              <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-fg-2">Answers come only from the current EAR, the Control List and Japan’s export control law, with a numbered source for every statement.</p>
              <div className="mb-2.5 mt-10 px-1 text-[17px] font-semibold tracking-tight">Try asking</div>
              <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "20px" }}>
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => ask(e)} className="flex w-full items-center gap-4 px-5 py-3 text-left text-[14px] transition-colors hover:bg-fill-2">
                    <span className="min-w-0 flex-1">{e}</span>
                    <ChevronRight className="size-4 shrink-0 text-fg-3" />
                  </button>
                ))}
              </Card>
            </div>
          ) : (
            <div>
              {msgs.map((m, i) =>
                m.role === "user" ? (
                  <h2 key={i} className={cx("whitespace-pre-wrap pb-3 text-[20px] font-semibold leading-snug tracking-[-0.015em]", i > 0 && "mt-10 border-t border-line pt-10")}>
                    {m.content}
                  </h2>
                ) : (
                  <div key={i}>
                    <div className="text-[15px] leading-[1.7]">
                      {m.content ? (
                        <Answer text={m.content} sources={m.sources ?? []} onCite={openSource} />
                      ) : m.streaming ? (
                        <span className="inline-flex items-center gap-2 text-fg-3">
                          <Spinner />
                          Reading the regulations…
                        </span>
                      ) : null}
                      {m.streaming && m.content && <span className="ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-full bg-fg-3 align-middle" />}
                    </div>
                    {m.error && (
                      <div className="mt-3 flex gap-2.5 text-[14px]">
                        <StatusDot status="block" />
                        <span className="text-fg-2">{m.error}</span>
                      </div>
                    )}
                    {m.sources && m.sources.length > 0 && !m.streaming && <Sources sources={m.sources} onOpen={openSource} />}
                  </div>
                ),
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>
      </div>
      <div className="material border-t border-line">
        <form
          className="mx-auto max-w-[720px] px-5 pb-3 pt-3 sm:px-8"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-[20px] border border-transparent bg-fill-2 py-1.5 pl-4 pr-1.5 transition-[background-color,border-color,box-shadow] hover:bg-fill focus-within:border-accent focus-within:bg-panel focus-within:ring-4 focus-within:ring-accent/15">
            <textarea
              ref={field}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={1}
              aria-label="Your question"
              placeholder="Ask about the EAR, the CCL or Japan’s export controls"
              className="max-h-40 min-h-[32px] flex-1 resize-none bg-transparent py-[5px] text-[15px] leading-[22px] outline-none placeholder:text-fg-3"
            />
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fill text-fg transition-colors hover:bg-panel-3" aria-label="Stop">
                <Square className="size-3" fill="currentColor" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-opacity disabled:opacity-30" aria-label="Send">
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
          <div className="mt-2 text-center text-[11.5px] text-fg-3">
            Research support drawn from the regulation text, not legal advice{meta.data?.settings.aiModel ? ` · ${meta.data.settings.aiModel}` : ""}
          </div>
        </form>
      </div>
    </div>
  );
}

function Sources({ sources, onOpen }: { sources: Source[]; onOpen: (s: Source) => void }) {
  return (
    <div className="mt-6">
      <div className="mb-2 px-1 text-[13px] font-semibold text-fg-2">Sources</div>
      <Card className="k-list overflow-hidden" style={{ ["--inset" as string]: "52px" }}>
        {sources.map((s) => (
          <button key={s.n} id={`src-${s.n}`} onClick={() => onOpen(s)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-fill-2">
            <Num n={s.n} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{s.cite}</span>
              <span className="block truncate text-[12.5px] text-fg-2">{s.preview}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-fg-3" />
          </button>
        ))}
      </Card>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-fill text-[12px] font-semibold tabular text-fg-2">{n}</span>;
}

/** Minimal markdown: paragraphs, bullets, bold, and [S#] citations drawn as numbered buttons. */
function Answer({ text, sources, onCite }: { text: string; sources: Source[]; onCite: (s: Source) => void }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (s: string) =>
    s.split(/(\[S\d+(?:,\s*S\d+)*\]|\*\*[^*]+\*\*)/g).map((part, i) => {
      const cite = part.match(/^\[(S\d+(?:,\s*S\d+)*)\]$/);
      if (cite)
        return cite[1].split(/,\s*/).map((id) => {
          const src = sources.find((x) => `S${x.n}` === id);
          return (
            <button
              key={`${i}-${id}`}
              onClick={() => src && onCite(src)}
              title={src?.cite}
              aria-label={src ? `Source ${id.slice(1)}: ${src.cite}` : `Source ${id.slice(1)}`}
              className="mx-[2px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-soft px-1 align-[2px] text-[11px] font-semibold tabular leading-none text-accent-text transition-colors hover:bg-accent hover:text-accent-fg"
            >
              {id.slice(1)}
            </button>
          );
        });
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      return <Fragment key={i}>{part}</Fragment>;
    });
  return (
    <div className="space-y-3.5">
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*([-*•]|\d+\.)\s/.test(l)))
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2.5">
                  <span className="mt-[11px] size-[5px] shrink-0 rounded-full bg-fg-3" />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s/, ""))}</span>
                </li>
              ))}
            </ul>
          );
        if (/^#{1,4}\s/.test(b)) return <div key={i} className="pt-1 text-[16px] font-semibold tracking-tight">{inline(b.replace(/^#{1,4}\s/, ""))}</div>;
        return <p key={i}>{inline(b)}</p>;
      })}
    </div>
  );
}
