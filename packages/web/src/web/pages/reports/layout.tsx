import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "../../components/layout/sidebar";
import {
  TrendingUp, UtensilsCrossed, Package, DollarSign, Users, Heart,
  LayoutGrid, Table, ChevronLeft, ChevronRight, Download, SlidersHorizontal,
} from "lucide-react";

export const GOLD = "var(--color-gold)";
export const BG   = "var(--color-bg)";
export const SURF = "var(--color-surface)";
export const BORD = "var(--color-border)";
export const MUTED = "var(--color-text-muted)";
export const DIM  = "var(--color-text-dim)";
export const TEXT = "var(--color-text)";

const SUB_REPORTS = [
  { path: "/reports/sales",     label: "Sales Performance",  icon: TrendingUp },
  { path: "/reports/menu",      label: "Menu Performance",   icon: UtensilsCrossed },
  { path: "/reports/inventory", label: "Inventory & Stock",  icon: Package },
  { path: "/reports/pl",        label: "Profit & Loss",      icon: DollarSign },
  { path: "/reports/staff",     label: "Staff Performance",  icon: Users },
  { path: "/reports/customers", label: "Customer Analytics", icon: Heart },
];

/* ── Shared types ─────────────────────────────────────── */
export type ColDef = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (val: any, row: any) => React.ReactNode;
};

/* ── DataTable ────────────────────────────────────────── */
export function DataTable({
  columns, rows, pageSize = 50, title, exportName,
}: {
  columns: ColDef[];
  rows: Record<string, any>[];
  pageSize?: number;
  title?: string;
  exportName?: string;
}) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({});

  const filtered = rows.filter(r =>
    columns.some(c => String(r[c.key] ?? "").toLowerCase().includes(search.toLowerCase())) &&
    columns.every(c => !filters[c.key] || String(r[c.key] ?? "") === filters[c.key])
  );
  const uniqueValues = useMemo(() => Object.fromEntries(columns.map(c => [c.key, [...new Set(rows.map(r => String(r[c.key] ?? "")).filter(Boolean))].sort()])), [rows, columns]);

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = a[sortKey]; const bv = b[sortKey];
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  const effectivePageSize = rowsPerPage === -1 ? Math.max(sorted.length, 1) : rowsPerPage;
  const totalPages = Math.max(1, Math.ceil(sorted.length / effectivePageSize));
  const slice = sorted.slice(page * effectivePageSize, page * effectivePageSize + effectivePageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  }

  function exportCSV() {
    const header = columns.map(c => c.label).join(",");
    const body = sorted.map(r =>
      columns.map(c => {
        const v = r[c.key];
        return typeof v === "string" && v.includes(",") ? `"${v}"` : (v ?? "");
      }).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (exportName || "report") + ".csv";
    a.click();
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: SURF, borderColor: BORD }}>
      {/* Table header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b gap-3" style={{ borderColor: BORD }}>
        <div className="font-semibold text-sm" style={{ color: TEXT }}>{title || "Data Table"}</div>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <select
            value={rowsPerPage}
            onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
            className="px-2 py-1.5 rounded-lg text-xs border outline-none"
            style={{ background: BG, borderColor: BORD, color: TEXT }}
            aria-label="Entries per page"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={-1}>All</option>
          </select>
          <button onClick={() => { setDraftFilters(filters); setFilterOpen(true); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{ borderColor: Object.keys(filters).length ? GOLD : BORD, color: Object.keys(filters).length ? GOLD : MUTED, background: "transparent" }}>
            <SlidersHorizontal size={12} /> Filter{Object.keys(filters).length ? ` (${Object.keys(filters).length})` : ""}
          </button>
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search…"
            className="px-3 py-1.5 rounded-lg text-xs border outline-none w-44"
            style={{ background: BG, borderColor: BORD, color: TEXT }}
          />
          <button onClick={exportCSV}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
            style={{ borderColor: BORD, color: MUTED, background: "transparent" }}
            title="Export CSV">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: BG }}>
              {columns.map(c => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="py-2 px-3 font-semibold cursor-pointer select-none whitespace-nowrap"
                  style={{
                    color: sortKey === c.key ? GOLD : DIM,
                    textAlign: c.align || "left",
                  }}
                >
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center" style={{ color: DIM }}>
                  No data
                </td>
              </tr>
            ) : slice.map((row, i) => (
              <tr
                key={i}
                className="border-t transition-colors"
                style={{ borderColor: BORD }}
                onMouseEnter={e => (e.currentTarget.style.background = BORD + "44")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {columns.map(c => (
                  <td key={c.key} className="py-2 px-3 whitespace-nowrap"
                    style={{ color: TEXT, textAlign: c.align || "left" }}>
                    {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length > 0 && (totalPages > 1 || rowsPerPage !== -1) && (
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: BORD }}>
          <span className="text-xs" style={{ color: DIM }}>
            {page * effectivePageSize + 1}–{Math.min((page + 1) * effectivePageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-1">
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              className="p-1 rounded disabled:opacity-30" style={{ color: MUTED }}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const pg = totalPages <= 7 ? i : (page < 4 ? i : page - 3 + i);
              if (pg >= totalPages) return null;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  className="w-6 h-6 rounded text-xs font-semibold transition-all"
                  style={{
                    background: pg === page ? GOLD : "transparent",
                    color: pg === page ? "var(--color-surface)" : MUTED,
                  }}>{pg + 1}</button>
              );
            })}
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              className="p-1 rounded disabled:opacity-30" style={{ color: MUTED }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── View Toggle ─────────────────────────────────────── */
export function ViewToggle({
  view, onChange,
}: { view: "summary" | "table"; onChange: (v: "summary" | "table") => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: BORD }}>
      {([["summary", LayoutGrid, "Summary"], ["table", Table, "Table"]] as const).map(([v, Icon, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-all"
          style={{
            background: view === v ? GOLD : "transparent",
            color: view === v ? "var(--color-surface)" : MUTED,
          }}>
          <Icon size={12} />
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── Report Layout ───────────────────────────────────── */
export function ReportLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const [location, navigate] = useLocation();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-14 flex items-center px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Reports</div>
          <span className="mx-2 text-xs" style={{ color: DIM }}>/</span>
          <div className="text-sm font-semibold" style={{ color: GOLD }}>{title}</div>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-0 shrink-0 overflow-x-auto" style={{ background: BG }}>
          {SUB_REPORTS.map(r => {
            const active = location === r.path || location.startsWith(r.path);
            return (
              <button key={r.path} onClick={() => navigate(r.path)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 whitespace-nowrap transition-all"
                style={{
                  color: active ? GOLD : MUTED,
                  borderBottomColor: active ? GOLD : "transparent",
                  background: active ? GOLD + "11" : "transparent",
                }}>
                <r.icon size={12} />
                {r.label}
              </button>
            );
          })}
        </div>
        <div className="h-px shrink-0" style={{ background: BORD }} />

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {children}
        </div>
      </div>
      </div>
  );
}
