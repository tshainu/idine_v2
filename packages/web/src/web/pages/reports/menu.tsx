import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId, getUser } from "../../lib/store";
import { ReportLayout, DataTable, ViewToggle, GOLD, SURF, BORD, MUTED, DIM, TEXT } from "./layout";
import type { ColDef } from "./layout";

const TABLE_COLS: ColDef[] = [
  { key: "rank",      label: "#",        align: "right" },
  { key: "name",      label: "Item Name" },
  { key: "category",  label: "Category" },
  { key: "qty",       label: "Qty Sold",  align: "right", render: v => <span style={{ fontWeight: 700, color: TEXT }}>{v}</span> },
  { key: "revenue",   label: "Revenue",   align: "right", render: v => <span style={{ color: GOLD, fontWeight: 700 }}>LKR {Math.round(Number(v)).toLocaleString()}</span> },
  { key: "avgPrice",  label: "Avg Price", align: "right", render: v => `LKR ${Math.round(Number(v)).toLocaleString()}` },
  { key: "quad",      label: "Matrix",    render: v => {
    const c: Record<string, string> = { Star: "var(--color-gold)", Puzzle: "var(--color-info)", "Plow Horse": "var(--color-success)", Dog: "var(--color-danger)" };
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: (c[v] || "#fff") + "33", color: c[v] || "#fff" }}>{v}</span>;
  }},
];

export default function MenuReport() {
  const branchId = getBranchId();
  const user = getUser();
  const [tab, setTab] = useState<"top10" | "least" | "profitable" | "matrix">("top10");
  const [view, setView] = useState<"summary" | "table">("summary");

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ["report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), ...(user?.role === "admin" || !user?.name ? {} : { placedBy: String(user.name) }) } })).json(),
  });
  const { data: menuData } = useQuery({
    queryKey: ["menu-items", branchId],
    queryFn: async () => (await api["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: catsData } = useQuery({
    queryKey: ["categories", branchId],
    queryFn: async () => (await api.categories.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const allOrders: any[] = (ordersData as any)?.orders || [];
  const menuItems: any[] = (menuData as any)?.menuItems || [];
  const categories: any[] = (catsData as any)?.categories || [];

  const catMap = useMemo(() => {
    const m: Record<number, string> = {};
    categories.forEach((c: any) => m[c.id] = c.name);
    return m;
  }, [categories]);

  const itemStats = useMemo(() => {
    const map: Record<string, { id: number; name: string; qty: number; revenue: number; category: string }> = {};
    allOrders.filter(o => o.status === "completed" || o.status === "billed").forEach(o => {
      (o.items || []).forEach((it: any) => {
        const key = String(it.menuItemId || it.name);
        if (!map[key]) {
          const mi = menuItems.find((m: any) => m.id === it.menuItemId);
          map[key] = { id: it.menuItemId, name: it.name || `Item #${key}`, qty: 0, revenue: 0, category: mi ? (catMap[mi.categoryId] || "Uncategorized") : "Uncategorized" };
        }
        map[key].qty += it.quantity || it.qty || 1;
        map[key].revenue += (it.price || 0) * (it.quantity || it.qty || 1);
      });
    });
    return Object.values(map);
  }, [allOrders, menuItems, catMap]);

  const avgRev = itemStats.reduce((s, i) => s + i.revenue, 0) / (itemStats.length || 1);
  const avgQty = itemStats.reduce((s, i) => s + i.qty, 0) / (itemStats.length || 1);

  const enriched = itemStats.map(i => ({
    ...i,
    avgPrice: i.qty > 0 ? i.revenue / i.qty : 0,
    quad: i.revenue >= avgRev && i.qty >= avgQty ? "Star"
      : i.revenue >= avgRev && i.qty < avgQty ? "Puzzle"
      : i.revenue < avgRev && i.qty >= avgQty ? "Plow Horse"
      : "Dog",
  }));

  const top10 = [...enriched].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const least10 = [...enriched].sort((a, b) => a.qty - b.qty).slice(0, 10);
  const profitable = [...enriched].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxRev2 = top10[0]?.revenue || 1;

  const tableRows = enriched
    .sort((a, b) => b.revenue - a.revenue)
    .map((item, i) => ({ rank: i + 1, ...item }));

  const QUAD_COLOR: Record<string, string> = { Star: "var(--color-gold)", Puzzle: "var(--color-info)", "Plow Horse": "var(--color-success)", Dog: "var(--color-danger)" };

  const TABS = [
    { key: "top10", label: "Top 10 Items" },
    { key: "least", label: "Least Selling" },
    { key: "profitable", label: "Most Profitable" },
    { key: "matrix", label: "Menu Matrix" },
  ] as const;

  function ItemTable({ items }: { items: typeof top10 }) {
    if (!items.length) return <div className="text-xs py-8 text-center" style={{ color: DIM }}>No data</div>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ color: DIM }}>
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">Item</th>
              <th className="text-left py-2 pr-3">Category</th>
              <th className="text-right py-2 pr-3">Qty Sold</th>
              <th className="text-right py-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t" style={{ borderColor: BORD }}>
                <td className="py-2 pr-3 font-bold" style={{ color: DIM }}>{i + 1}</td>
                <td className="py-2 pr-3 font-medium" style={{ color: TEXT }}>{item.name}</td>
                <td className="py-2 pr-3" style={{ color: MUTED }}>{item.category}</td>
                <td className="py-2 pr-3 text-right font-bold" style={{ color: TEXT }}>{item.qty}</td>
                <td className="py-2 text-right font-bold" style={{ color: GOLD }}>LKR {Math.round(item.revenue).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <ReportLayout title="Menu Performance">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1">
          {[
            { label: "Total Menu Items", value: menuItems.length },
            { label: "Items Sold", value: enriched.reduce((s, i) => s + i.qty, 0) },
            { label: "Top Item", value: top10[0]?.name || "—" },
            { label: "Top Revenue", value: top10[0] ? `LKR ${Math.round(top10[0].revenue).toLocaleString()}` : "—" },
          ].map(c => (
            <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="text-base font-bold truncate" style={{ color: GOLD }}>{c.value}</div>
              <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
            </div>
          ))}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {/* TABLE VIEW */}
      {view === "table" ? (
        <DataTable
          title={`All Menu Items (${tableRows.length})`}
          columns={TABLE_COLS}
          rows={tableRows}
          exportName="menu-report"
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b" style={{ borderColor: BORD }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="px-4 py-2 text-xs font-semibold border-b-2 transition-all"
                style={{ color: tab === t.key ? GOLD : MUTED, borderBottomColor: tab === t.key ? GOLD : "transparent" }}>
                {t.label}
              </button>
            ))}
          </div>

          {isLoading
            ? <div className="text-xs py-8 text-center" style={{ color: DIM }}>Loading…</div>
            : tab === "matrix"
              ? (
                <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
                  <div className="font-semibold text-sm mb-1" style={{ color: TEXT }}>Menu Engineering Matrix</div>
                  <div className="text-xs mb-4" style={{ color: DIM }}>
                    Star = high rev + high vol · Puzzle = high rev + low vol · Plow Horse = low rev + high vol · Dog = low both
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {["Star", "Puzzle", "Plow Horse", "Dog"].map(q => (
                      <div key={q} className="rounded-xl p-3 border" style={{ background: BORD + "44", borderColor: BORD }}>
                        <div className="text-xs font-bold mb-2" style={{ color: QUAD_COLOR[q] }}>{q}</div>
                        {enriched.filter(i => i.quad === q).slice(0, 8).map((i, idx) => (
                          <div key={idx} className="flex justify-between text-[11px] py-0.5">
                            <span style={{ color: MUTED }}>{i.name}</span>
                            <span style={{ color: TEXT }}>{i.qty}x</span>
                          </div>
                        ))}
                        {enriched.filter(i => i.quad === q).length === 0 && (
                          <div className="text-[11px]" style={{ color: DIM }}>None</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
              : (
                <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
                  {tab === "top10" && <ItemTable items={top10} />}
                  {tab === "least" && <ItemTable items={least10} />}
                  {tab === "profitable" && <ItemTable items={profitable} />}
                </div>
              )
          }

          {tab === "top10" && !isLoading && top10.length > 0 && (
            <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Top Items — Revenue Bar</div>
              <div className="space-y-2">
                {top10.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-24 text-xs truncate text-right" style={{ color: MUTED }}>{item.name}</div>
                    <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: BORD }}>
                      <div className="h-full rounded-full flex items-center pl-2"
                        style={{ width: `${(item.revenue / maxRev2) * 100}%`, background: GOLD }}>
                        <span className="text-[10px] font-bold" style={{ color: "var(--color-surface)" }}>{item.qty}x</span>
                      </div>
                    </div>
                    <div className="w-28 text-xs text-right font-bold" style={{ color: TEXT }}>
                      LKR {Math.round(item.revenue).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </ReportLayout>
  );
}
