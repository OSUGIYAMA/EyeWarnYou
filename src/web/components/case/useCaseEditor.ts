// Local-first editing of a case: edits apply instantly to a draft, are saved with a short
// debounce, and every server response brings back a fresh assessment.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Case, type CaseView } from "../../lib/api.ts";
import { toast } from "../ui/index.tsx";

export type SaveState = "idle" | "saving" | "saved" | "error";

export function useCaseEditor(id: string) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["case", id], queryFn: () => api.get<CaseView>(`/cases/${id}`) });
  const [draft, setDraft] = useState<Case | null>(null);
  const [view, setView] = useState<CaseView | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Case | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (query.data && !draft) {
      setDraft(query.data.case);
      setView(query.data);
      latest.current = query.data.case;
    }
  }, [query.data, draft]);

  /** Adopt server-managed fields (screenings, review, status) from a response without clobbering typing. */
  const absorb = useCallback(
    (v: CaseView) => {
      setView(v);
      setDraft((d) => {
        const next = d ? { ...d, screenings: v.case.screenings, review: v.case.review, status: v.case.status, ref: v.case.ref } : v.case;
        latest.current = next;
        return next;
      });
      qc.setQueryData(["case", id], v);
      qc.invalidateQueries({ queryKey: ["cases"] });
    },
    [id, qc],
  );

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const c = latest.current;
    if (!c) return;
    const mine = ++seq.current;
    setSave("saving");
    try {
      const { screenings: _s, review: _r, ...payload } = c;
      const v = await api.put<CaseView>(`/cases/${id}`, payload);
      if (mine === seq.current) {
        absorb(v);
        setSave("saved");
      }
    } catch (e) {
      setSave("error");
      toast("Could not save", { detail: (e as Error).message, tone: "error" });
    }
  }, [id, absorb]);

  const update = useCallback(
    (fn: (c: Case) => Case, immediate = false) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(structuredClone(d));
        latest.current = next;
        return next;
      });
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, immediate ? 0 : 550);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    [flush],
  );

  const action = useCallback(
    async (path: string, body?: unknown) => {
      if (timer.current) await flush();
      const v = await api.post<CaseView>(`/cases/${id}${path}`, body);
      absorb(v);
      return v;
    },
    [id, flush, absorb],
  );

  return { draft, view, loading: query.isLoading, error: query.error, save, update, action, flush };
}
