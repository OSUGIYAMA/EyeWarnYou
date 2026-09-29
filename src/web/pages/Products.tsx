// Product master: classified items saved for reuse across cases.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Page } from "../components/AppShell.tsx";
import { Button, Card, Dialog, Empty, IconButton, Input, PageHeader, Skeleton, toast } from "../components/ui/index.tsx";
import { api, type Item } from "../lib/api.ts";
import { fmtDate, relTime } from "../lib/format.ts";

type Product = Item & { updatedAt: string };

const US_STATE: Record<string, string> = {
  confirmed: "Confirmed",
  provisional: "Provisional",
  unclassified: "Not yet classified",
};

const GRID = "grid grid-cols-[minmax(0,1fr)_150px_150px_110px_76px_28px] items-center gap-4";

function UsClass({ p }: { p: Product }) {
  const eccn = p.us?.eccn?.trim() ?? "";
  const para = p.us?.paragraph?.replace(/^\./, "").trim() ?? "";
  if (!eccn) return <span className="text-[13px] text-fg-3">Not classified</span>;
  const isEccn = /^\d[A-E]\d{3}$/i.test(eccn);
  const code = (
    <>
      {eccn.toUpperCase()}
      {para && <span className="text-fg-2">.{para}</span>}
    </>
  );
  return (
    <div className="min-w-0">
      {isEccn ? (
        <Link to={`/regulations/ccl/${eccn.toUpperCase()}${para ? `?p=${encodeURIComponent(para)}` : ""}`} className="block truncate font-mono text-[13px] font-medium text-fg hover:text-accent-text hover:underline">
          {code}
        </Link>
      ) : (
        <span className="block truncate font-mono text-[13px] font-medium text-fg">{code}</span>
      )}
      <div className="text-[12px] text-fg-3">{US_STATE[p.us?.classification ?? "unclassified"] ?? US_STATE.unclassified}</div>
    </div>
  );
}

function JpClass({ p }: { p: Product }) {
  const status = p.jp?.listStatus ?? "unclassified";
  if (status === "listed")
    return (
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">{p.jp?.kou || "項番未記入"}</div>
        <div className="text-[12px] text-fg-3">該当</div>
      </div>
    );
  if (status === "not_listed")
    return (
      <div className="min-w-0">
        <div className="text-[13px] font-medium">非該当</div>
        <div className="text-[12px] text-fg-3">Not listed</div>
      </div>
    );
  return <span className="text-[13px] text-fg-3">Not classified</span>;
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
        description="Classified products, ready to reuse. A new case for the same product starts with its classification."
        actions={
          <Link to="/classify">
            <Button variant="primary">Classify a product</Button>
          </Link>
        }
      />

      {list.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="px-1 text-[13px] tabular text-fg-3">{rows.length === list.length ? `${list.length} product${list.length === 1 ? "" : "s"}` : `${rows.length} of ${list.length}`}</span>
          <div className="relative ml-auto w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setQ("")} placeholder="Name, model, ECCN, 項番 or HS code" className="pl-9" aria-label="Filter products" />
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        {products.isLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : products.isError ? (
          <Empty icon={<Package />} title="Products could not be loaded">
            {(products.error as Error).message}
          </Empty>
        ) : list.length === 0 ? (
          <Empty icon={<Package />} title="No products yet">
            Save a classification from Classify a product, and it appears here, ready for the next case.
          </Empty>
        ) : rows.length === 0 ? (
          <Empty icon={<Search />} title="No products match">
            Try a model number, an ECCN such as 3A001, or an HS heading.
          </Empty>
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <div className="min-w-[760px]">
              <div className={`${GRID} border-b border-line px-5 py-2 text-[12px] font-medium text-fg-3`}>
                <span>Product</span>
                <span>ECCN</span>
                <span>Japan 項番</span>
                <span>HS code</span>
                <span className="text-right">Updated</span>
                <span />
              </div>
              <div className="k-list" style={{ ["--inset" as string]: "20px" }}>
                {rows.map((p) => (
                  <div key={p.id} className={`${GRID} group px-5 py-3`}>
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                      <div className="mt-0.5 truncate text-[12.5px] text-fg-3">{[p.manufacturer, p.model].filter(Boolean).join(" · ") || p.description || "—"}</div>
                    </div>
                    <UsClass p={p} />
                    <JpClass p={p} />
                    <span className="truncate font-mono text-[13px] text-fg-2">{p.hsCode || <span className="font-sans text-fg-3">—</span>}</span>
                    <span className="text-right text-[12.5px] text-fg-3" title={fmtDate(p.updatedAt)}>
                      {relTime(p.updatedAt)}
                    </span>
                    <IconButton label="Delete product" onClick={() => setPending(p)} className="opacity-0 hover:text-red-text focus-visible:opacity-100 group-hover:opacity-100">
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!pending}
        onOpenChange={(o) => !o && !remove.isPending && setPending(null)}
        title={pending ? `Delete “${pending.name}”?` : "Delete this product?"}
        description="Cases that already use it keep their own copy. The deletion is recorded in the audit trail."
        footer={
          <>
            <Button onClick={() => setPending(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => pending && remove.mutate(pending.id)}>
              Delete
            </Button>
          </>
        }
      >
        {pending && (pending.manufacturer || pending.model || pending.us?.eccn) ? (
          <div className="pb-1 text-[13px] text-fg-2">{[pending.manufacturer, pending.model, pending.us?.eccn && `ECCN ${pending.us.eccn}`].filter(Boolean).join(" · ")}</div>
        ) : null}
      </Dialog>
    </Page>
  );
}
