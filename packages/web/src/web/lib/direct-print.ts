/**
 * Direct printing for the POS.
 *
 * A printer configured as "network" is driven by the server: it builds the ESC/POS
 * bytes and opens a TCP socket to the printer itself, so nothing pops up in the
 * browser — no Windows print wizard. A printer configured as "windows" is attached
 * to a PC the server cannot reach, so the browser print dialog is the only route
 * and the caller falls back to `window.print()`.
 */

export type PrinterRow = {
  id: number;
  branchId?: number | null;
  name: string;
  type: string;
  connection: string;
  ipAddress?: string | null;
  port?: number | null;
  isActive?: boolean;
};

/** Legacy rows were saved as "lan"/"usb" before the Windows-vs-Network choice existed. */
export function isNetworkPrinter(connection?: string | null): boolean {
  return connection === "network" || connection === "lan";
}

export type PrinterSetupConfig = {
  invoice?: { printerId?: string; paper?: string };
  bill?: { printerId?: string; paper?: string };
  kot?: { printerId?: string; paper?: string };
  kot2?: { printerId?: string; paper?: string };
  kot3?: { printerId?: string; paper?: string };
  kot4?: { printerId?: string; paper?: string };
  /** { [printerId]: categoryId[] } — which menu categories each printer prints. */
  printerCategories?: Record<string, number[]>;
};

/** Read the saved Printer Setup blob out of the branch settings map. */
export function parsePrinterSetup(settings: Record<string, string> | undefined): PrinterSetupConfig {
  if (!settings?.printerSetup) return {};
  try {
    return JSON.parse(settings.printerSetup) as PrinterSetupConfig;
  } catch {
    return {};
  }
}

/** The four KOT slots, in order. "kot" is slot 1 (legacy key). */
export const KOT_SLOTS = ["kot", "kot2", "kot3", "kot4"] as const;

export type DirectPrintResult = { ok: boolean; message: string; fallback?: boolean };

/**
 * Send one document straight to a network printer.
 * `fallback: true` means the caller should open the browser print dialog instead.
 */
export async function directPrint(args: {
  branchId?: number | null;
  orderId?: number | null;
  printerId: number;
  type: "kot" | "bill" | "invoice" | "reprint";
  payload: unknown;
  idempotencyKey?: string;
}): Promise<DirectPrintResult> {
  try {
    const res = await fetch("/api/print-jobs/direct", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const data: any = await res.json().catch(() => ({}));

    if (res.status === 409 || data?.fallback === "windows") {
      return { ok: false, fallback: true, message: data?.error || "Windows printer — using browser dialog." };
    }
    if (data?.ok) return { ok: true, message: `Sent to ${data.printer || "printer"}.` };
    return { ok: false, message: data?.error || "Print failed." };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Could not reach the print service." };
  }
}

/**
 * Resolve which printer a document should go to.
 * Returns null when nothing is configured, so the caller can fall back to the dialog.
 */
export function resolvePrinter(
  setup: PrinterSetupConfig,
  printers: PrinterRow[],
  slot: "invoice" | "bill" | (typeof KOT_SLOTS)[number],
): PrinterRow | null {
  const id = Number(setup?.[slot]?.printerId || 0);
  if (!id) return null;
  return printers.find(p => p.id === id) || null;
}

/**
 * Split KOT items across the KOT printers using the category mapping from
 * Printer Setup. Items whose category is not claimed by any printer fall back to
 * KOT slot 1, so nothing is silently dropped.
 */
export function routeKotItems<T extends { categoryId?: number | null; printerId?: number | null }>(
  items: T[],
  setup: PrinterSetupConfig,
  printers: PrinterRow[],
): { printer: PrinterRow; items: T[] }[] {
  const byId = new Map<number, PrinterRow>(printers.map(p => [p.id, p]));
  const categoryToPrinter = new Map<number, number>();
  Object.entries(setup.printerCategories || {}).forEach(([pid, cats]) => {
    (cats || []).forEach(cid => categoryToPrinter.set(cid, Number(pid)));
  });

  // Printers actually selected in the four KOT tabs.
  const kotPrinters = KOT_SLOTS
    .map(slot => resolvePrinter(setup, printers, slot))
    .filter((p): p is PrinterRow => !!p);
  const defaultPrinter = kotPrinters[0] || null;

  const groups = new Map<number, { printer: PrinterRow; items: T[] }>();

  for (const item of items) {
    // An item's own printerId wins; then its category mapping; then KOT slot 1.
    const explicit = item.printerId ? byId.get(Number(item.printerId)) : undefined;
    const mappedId = item.categoryId != null ? categoryToPrinter.get(Number(item.categoryId)) : undefined;
    const mapped = mappedId ? byId.get(mappedId) : undefined;
    const target = explicit || mapped || defaultPrinter;
    if (!target) continue;

    const g = groups.get(target.id);
    if (g) g.items.push(item);
    else groups.set(target.id, { printer: target, items: [item] });
  }

  return [...groups.values()];
}
