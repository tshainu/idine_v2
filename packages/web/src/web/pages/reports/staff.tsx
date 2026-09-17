import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId, getUser } from "../../lib/store";
import { ReportLayout, GOLD, SURF, BORD, MUTED, DIM, TEXT, DataTable, ViewToggle, ColDef } from "./layout";
import { Trophy } from "lucide-react";

type Period = "week" | "month" | "all";
type View = "summary" | "table";

const ROLE_COLOR: Record<string, string> = {
  waiter: "var(--color-info)", cashier: "var(--color-purple-light)", admin: GOLD, manager: "var(--color-success)",
};

const TABLE_COLS: ColDef[] = [
  { key: "name",    label: "Name" },
  { key: "role",    label: "Role",
    render: (v) => (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
        style={{ background: (ROLE_COLOR[v as string] || DIM) + "33", color: ROLE_COLOR[v as string] || DIM }}>
        {v as string}
      </span>
    ),
  },
  { key: "orders",  label: "Orders",        align: "right" },
  { key: "tables",  label: "Tables Served", align: "right" },
  { key: "avgBill", label: "Avg Bill",      align: "right",
    render: (v) => `LKR ${Math.round(v as number).toLocaleString()}` },
  { key: "sales",   label: "Total Sales",   align: "right",
    render: (v) => `LKR ${Math.round(v as number).toLocaleString()}` },
];

export default function StaffReport() {
  const branchId = getBranchId();
  const user = getUser();
  const [period, setPeriod] = useState<Period>("month");
  const [view, setView] = useState<View>("summary");

  const { data: ordersData } = useQuery({
    queryKey: ["report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), ...(user?.role === "admin" || !user?.id ? {} : { cashierId: String(user.id), placedBy: String(user.name || "") }) } })).json(),
  });
  const { data: usersData } = useQuery({
    queryKey: ["users", branchId],
    queryFn: async () => (await api.users.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const allOrders: any[] = (ordersData as any)?.orders || [];
  const allUsers: any[] = (usersData as any)?.users || [];

  function cutoff(p: Period) {
    if (p === "all") return new Date(0);
    const d = new Date();
    if (p === "week") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    return d;
  }

  const cut = cutoff(period);
  const orders = allOrders.filter(o =>
    new Date(o.createdAt) >= cut && (o.status === "completed" || o.status === "billed")
  );

  const staffStats = useMemo(() => {
    const waiters = allUsers.filter(u => u.role === "waiter" || u.role === "cashier" || u.role === "admin");
    return waiters.map(u => {
      const myOrders = orders.filter(o => o.waiterId === u.id);
      const totalSales = myOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const avgBill = myOrders.length ? totalSales / myOrders.length : 0;
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        orders: myOrders.length,
        sales: totalSales,
        avgBill,
        tables: new Set(myOrders.filter(o => o.tableId).map(o => o.tableId)).size,
      };
    }).sort((a, b) => b.sales - a.sales);
  }, [orders, allUsers]);

  const topStaff = staffStats[0];
  const totalOrders = staffStats.reduce((s, u) => s + u.orders, 0);
  const totalSales = staffStats.reduce((s, u) => s + u.sales, 0);
  const maxSales = staffStats[0]?.sales || 1;

  const PERIODS: { key: Period; label: string }[] = [
    { key: "week", label: "Last 7 Days" },
    { key: "month", label: "Last 30 Days" },
    { key: "all", label: "All Time" },
  ];

  return (
    <ReportLayout title="Staff Performance">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
              style={{
                background: period === p.key ? GOLD : "transparent",
                color: period === p.key ? "var(--color-surface)" : MUTED,
                borderColor: period === p.key ? GOLD : BORD,
              }}>{p.label}</button>
          ))}
        </div>
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" ? (
        <DataTable
          columns={TABLE_COLS}
          rows={staffStats}
          title="Staff Performance"
          exportName="staff-performance"
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Staff Members", value: staffStats.length },
              { label: "Total Orders Served", value: totalOrders },
              { label: "Total Sales", value: `LKR ${Math.round(totalSales).toLocaleString()}` },
              { label: "Best Performer", value: topStaff?.name || "—" },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-base font-bold truncate" style={{ color: GOLD }}>{c.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Best employee highlight */}
          {topStaff && (
            <div className="rounded-2xl p-4 border flex items-center gap-4"
              style={{ background: GOLD + "11", borderColor: GOLD + "44" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
                style={{ background: GOLD, color: "var(--color-surface)" }}>
                {topStaff.name[0]}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Trophy size={14} style={{ color: GOLD }} />
                  <span className="font-bold text-sm" style={{ color: GOLD }}>Best Performer — {topStaff.name}</span>
                </div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {topStaff.orders} orders · LKR {Math.round(topStaff.sales).toLocaleString()} sales · Avg bill LKR {Math.round(topStaff.avgBill).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Bar chart + table */}
          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Individual Performance</div>
            {staffStats.length === 0
              ? <div className="text-xs py-8 text-center" style={{ color: DIM }}>No staff orders in this period.</div>
              : (
                <>
                  {/* Bar chart */}
                  <div className="space-y-3 mb-5">
                    {staffStats.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <div className="w-24 text-xs font-medium truncate" style={{ color: TEXT }}>{s.name}</div>
                        <div className="flex-1 h-6 rounded-full overflow-hidden" style={{ background: BORD }}>
                          <div className="h-full rounded-full flex items-center pl-2"
                            style={{ width: `${Math.max((s.sales / maxSales) * 100, 4)}%`, background: i === 0 ? GOLD : "var(--color-info)" }}>
                            <span className="text-[10px] font-bold" style={{ color: "var(--color-surface)" }}>{s.orders} orders</span>
                          </div>
                        </div>
                        <div className="w-32 text-xs text-right font-bold" style={{ color: TEXT }}>
                          LKR {Math.round(s.sales).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inline table */}
                  <div className="overflow-x-auto border-t" style={{ borderColor: BORD }}>
                    <table className="w-full text-xs mt-3">
                      <thead>
                        <tr style={{ color: DIM }}>
                          <th className="text-left py-2 pr-4">Name</th>
                          <th className="text-left py-2 pr-4">Role</th>
                          <th className="text-right py-2 pr-4">Orders</th>
                          <th className="text-right py-2 pr-4">Tables Served</th>
                          <th className="text-right py-2 pr-4">Avg Bill</th>
                          <th className="text-right py-2">Total Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffStats.map((s, i) => (
                          <tr key={s.id} className="border-t" style={{ borderColor: BORD }}>
                            <td className="py-2 pr-4 font-semibold" style={{ color: i === 0 ? GOLD : TEXT }}>
                              {i === 0 && "🏆 "}{s.name}
                            </td>
                            <td className="py-2 pr-4">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold capitalize"
                                style={{ background: (ROLE_COLOR[s.role] || DIM) + "33", color: ROLE_COLOR[s.role] || DIM }}>
                                {s.role}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right font-bold" style={{ color: TEXT }}>{s.orders}</td>
                            <td className="py-2 pr-4 text-right" style={{ color: MUTED }}>{s.tables}</td>
                            <td className="py-2 pr-4 text-right" style={{ color: MUTED }}>LKR {Math.round(s.avgBill).toLocaleString()}</td>
                            <td className="py-2 text-right font-bold" style={{ color: GOLD }}>LKR {Math.round(s.sales).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            }
          </div>

          {/* Incentive hint */}
          {staffStats.length > 0 && (
            <div className="rounded-xl p-4 border text-xs" style={{ background: SURF, borderColor: BORD, color: MUTED }}>
              <span className="font-bold" style={{ color: TEXT }}>Incentive Guide — </span>
              Top performer ({topStaff?.name}) handled{" "}
              {totalOrders > 0 ? Math.round((topStaff.orders / totalOrders) * 100) : 0}% of total orders.
              Consider performance bonuses for staff exceeding LKR {Math.round(totalSales / staffStats.length).toLocaleString()} in sales.
            </div>
          )}
        </>
      )}
    </ReportLayout>
  );
}
