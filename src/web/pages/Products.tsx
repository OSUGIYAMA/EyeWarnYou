// Product master: classified items saved for reuse across cases.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, FileSearch, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { Button, Card, Dialog, Empty, IconButton, Input, PageHeader, Skeleton, toast } from "../components/ui/index.tsx";
import { api, type Item } from "../lib/api.ts";
import { cx, fmtDate, relTime } from "../lib/format.ts";

type Product = Item & { updatedAt: string };

const US_STATE: Record<string, { dot: string; label: string }> = {
  confirmed: { dot: "bg-green", label: "Confirmed classification" },
  provisional: { dot: "bg-amber", label: "Provisional classification" },
  unclassified: { dot: "bg-line-strong", label: "Not yet classified" },
};

function UsClass({ p }: { p: Product }) {
  const eccn = p.us?.eccn?.trim() ?? "";
  const para = p.us?.paragraph?.replace(/^\./, "").trim() ?? "";
  const state = US_STATE[p.us?.classification ?? "unclassified"] ?? US_STATE.unclassified;
  if (!eccn) return <span className="text-[12.5px] text-fg-3">Unclassified</span>;
  const isEccn = /^\d[A-E]\d{3}$/i.test(eccn);
  return (
    <span className="inline-flex items-center gap-2" title={state.label}>
      <span className={cx("size-1.5 shrink-0 rounded-full", state.dot)} />
      {isEccn ? (
        <Link to={`/regulations/ccl/${eccn.toUpperCase()}${para ? `?p=${encodeURIComponent(para)}` : ""}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12.5px] text-fg hover:underline">
          {eccn.toUpperCase()}
          {para && <span className="text-fg-3">.{para}</span>}
        </Link>
      ) : (
        <span className="font-mono text-[12.5px] text-fg">{eccn}</span>
      )}
    </span>
  );
}

function JpClass({ p }: { p: Product }) {
  const status = p.jp?.listStatus ?? "unclassified";
  if (status === "listed")
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px]">
        <span className="font-medium text-orange-text">該当</span>
        <span className="text-fg-2">{p.jp?.kou || "項番未記入"}</span>
      </span>
    );
  if (status === "not_listed") return <span className="text-[12.5px] text-fg-2">非該当</span>;
  return <span className="text-[12.5px] text-fg-3">Unclassified</span>;
}

export function ProductsPage() {
  const qc = useQueryClient();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/products") });
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<Product | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/products/${id}`),
    onSuccess: (_, id) => {
      qc.setQueryData<Product[]>(["products"], (cur) => cur?.filter((p) => p.id !== id));
      qc.invalidateQueries({ queryKey: ["products"] });
      toast("Product deleted", { detail: pending?.name, tone: "success" });
      setPending(null);
    },
    onError: (e) => toast("Could not delete the product", { detail: (e as Error).message, tone: "error" }),
  });

  const list = products.data ?? [];
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((p) => [p.name, p.model, p.manufacturer, p.hsCode, p.us?.eccn, p.jp?.kou, p.description].filter(Boolean).join(" ").toLowerCase().includes(s));
  }, [list, q]);

  return (
    <Page wide>
      <PageHeader
        title="Product master"
        description="Classified items saved for reuse. Each record keeps the US ECCN, the Japanese 該非判定 and the HS code, so the next case for the same product starts classified."
        actions={
          <Link to="/classify">
            <Button variant="primary" icon={<FileSearch className="size-3.5" />}>
              Classify a product
            </Button>
          </Link>
        }
      />

      {list.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative w-80">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Filter by name, model, ECCN, 項番 or HS code" className="pl-8" aria-label="Filter products" />
          </div>
          <span className="ml-auto text-[12.5px] tabular text-fg-3">
            {rows.length === list.length ? `${list.length} product${list.length === 1 ? "" : "s"}` : `${rows.length} of ${list.length}`}
          </span>
        </div>
      )}

      <Card className="overflow-hidden">
        {products.isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : products.isError ? (
          <Empty icon={<Boxes className="size-5" />} title="Products could not be loaded">
            {(products.error as Error).message}
          </Empty>
        ) : list.length === 0 ? (
          <Empty
            icon={<Boxes className="size-5" />}
            title="No products yet"
            action={
              <Link to="/classify">
                <Button icon={<FileSearch className="size-3.5" />}>Classify a product</Button>
              </Link>
            }
          >
            Products are saved from the Classify page, or from an item on a case once it has been classified. Saved products can be added to new cases with their classification intact.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty icon={<Search className="size-5" />} title="No products match">
            Try a model number, an ECCN such as 3A001 or an HS heading.
          </Empty>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-panel-2/60 text-left text-[11.5px] font-medium text-fg-3">
                  <th className="px-4 py-2 font-medium">Product</th>
                  <th className="px-4 py-2 font-medium">Manufacturer / model</th>
                  <th className="px-4 py-2 font-medium">ECCN</th>
                  <th className="px-4 py-2 font-medium">Japan 該非</th>
                  <th className="px-4 py-2 font-medium">HS code</th>
                  <th className="px-4 py-2 text-right font-medium">Updated</th>
                  <th className="w-12 px-2 py-2" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="group transition-colors hover:bg-panel-2/50">
                    <td className="max-w-[320px] px-4 py-2.5">
                      <div className="truncate font-medium">{p.name}</div>
                      {p.description && <div className="truncate text-[12px] text-fg-3">{p.description}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.manufacturer || p.model ? (
                        <div className="min-w-0">
                          <div className="truncate text-fg-2">{p.manufacturer || "—"}</div>
                          {p.model && <div className="truncate font-mono text-[12px] text-fg-3">{p.model}</div>}
                        </div>
                      ) : (
                        <span className="text-fg-3">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <UsClass p={p} />
                    </td>
                    <td className="px-4 py-2.5">
                      <JpClass p={p} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12.5px] text-fg-2">{p.hsCode || <span className="font-sans text-fg-3">—</span>}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-fg-3" title={fmtDate(p.updatedAt)}>
                      {relTime(p.updatedAt)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <IconButton label="Delete product" onClick={() => setPending(p)} className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100 hover:text-red-text">
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && !remove.isPending && setPending(null)}
        title="Delete this product?"
        description="Cases that already use it keep their own copy of the item."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => pending && remove.mutate(pending.id)} icon={<Trash2 className="size-3.5" />}>
              Delete product
            </Button>
          </>
        }
      >
        {pending && (
          <div className="rounded-lg border border-line bg-panel-2/50 px-3 py-2.5 text-[13px]">
            <div className="font-medium">{pending.name}</div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-[12px] text-fg-3">
              {pending.manufacturer && <span>{pending.manufacturer}</span>}
              {pending.model && <span className="font-mono">{pending.model}</span>}
              {pending.us?.eccn && <span className="font-mono">{pending.us.eccn}</span>}
            </div>
            <div className="mt-2 text-[12px] text-fg-3">The deletion is recorded in the audit trail.</div>
          </div>
        )}
      </Dialog>
    </Page>
  );
}
