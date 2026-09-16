// Printer configuration + transports for KOT printing straight from the waiter's phone.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { buildKot, type KotPayload, type PaperWidth } from "./escpos";
import { http } from "./http";

export type Transport = "lan" | "bluetooth" | "server";
export type PrinterConfig = {
  transport: Transport; host: string; port: number; btAddress: string; btName: string;
  paperWidth: PaperWidth; alsoQueueOnServer: boolean; kotPrinters: KotPrinter[];
};
export type KotPrinter = {
  id: string; printerId?: number | null; name: string; host: string; port: number;
  categoryIds?: number[]; enabled: boolean;
};
export const DEFAULT_CONFIG: PrinterConfig = {
  transport: "server", host: "", port: 9100, btAddress: "", btName: "",
  paperWidth: 32, alsoQueueOnServer: true, kotPrinters: [],
};
const KEY = "waiter_printer_config";

export async function loadPrinterConfig(): Promise<PrinterConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    const config = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<PrinterConfig>) };
    if (!Array.isArray(config.kotPrinters)) config.kotPrinters = [];
    config.kotPrinters = config.kotPrinters.filter(Boolean).map((p, index) => ({
      id: String(p.id || `kot-${index + 1}`), printerId: p.printerId == null ? null : Number(p.printerId),
      name: String(p.name || `KOT Printer ${index + 1}`), host: String(p.host || ""),
      port: Number(p.port) || 9100, categoryIds: Array.isArray(p.categoryIds) ? p.categoryIds.map(Number) : [],
      enabled: p.enabled !== false,
    }));
    if (!config.kotPrinters.length && config.host) config.kotPrinters = [{ id: "legacy", name: "KOT Printer 1", host: config.host, port: config.port || 9100, categoryIds: [], enabled: true }];
    if (config.transport === "bluetooth") config.transport = "server";
    return config;
  } catch { return DEFAULT_CONFIG; }
}
export async function savePrinterConfig(config: PrinterConfig): Promise<void> { await AsyncStorage.setItem(KEY, JSON.stringify(config)); }

/** Pull the active KOT printer IPs and category routing from Web POS. */
export async function syncPrinterConfigFromPos(branchId: number): Promise<PrinterConfig> {
  const current = await loadPrinterConfig();
  const [printerRes, settingsRes] = await Promise.all([
    http.get<{ printers: { id: number; name: string; type: string; ipAddress: string | null; port: number | null; isActive: boolean }[] }>("/printers", { branchId }),
    http.get<{ settings: Record<string, string> }>("/settings", { branchId }),
  ]);
  let setup: any = {};
  try { setup = JSON.parse(settingsRes.settings?.printerSetup || "{}"); } catch { setup = {}; }
  const selectedIds = ["kot", "kot2", "kot3", "kot4"].map((slot) => Number(setup?.[slot]?.printerId || 0)).filter(Boolean);
  const categoryMap = setup?.printerCategories || {};
  const synced = (printerRes.printers || [])
    .filter((p) => p.isActive !== false && p.type === "kot" && selectedIds.includes(p.id) && p.ipAddress)
    .map((p) => ({ id: `pos-${p.id}`, printerId: p.id, name: p.name, host: p.ipAddress || "", port: p.port || 9100, categoryIds: Array.isArray(categoryMap[String(p.id)]) ? categoryMap[String(p.id)] : [], enabled: true }));
  if (!synced.length) return current;
  const next = { ...current, transport: "lan" as const, kotPrinters: synced };
  await savePrinterConfig(next);
  return next;
}

type TcpModule = { createConnection: (opts: { host: string; port: number; timeout?: number }, cb: () => void) => { write: (data: Buffer | Uint8Array | string, enc?: string, cb?: () => void) => void; destroy: () => void; end: () => void; on: (event: string, cb: (arg?: unknown) => void) => void; setTimeout?: (ms: number) => void } };
function getTcp(): TcpModule | null { if (Platform.OS === "web") return null; try { const mod = require("react-native-tcp-socket"); return (mod?.default ?? mod) as TcpModule; } catch { return null; } }
type BluetoothModule = { writeRaw?: (base64: string) => Promise<void>; write?: (data: string) => Promise<void> };
type BluetoothManager = { connect: (address: string) => Promise<void>; enableBluetooth?: () => Promise<string[]>; isBluetoothEnabled?: () => Promise<boolean>; scanDevices?: () => Promise<string> };
function getBluetooth(): { printer: BluetoothModule; manager: BluetoothManager } | null { if (Platform.OS !== "android") return null; try { const mod = require("react-native-bluetooth-escpos-printer"); const printer = mod?.BluetoothEscposPrinter ?? mod?.default?.BluetoothEscposPrinter; const manager = mod?.BluetoothManager ?? mod?.default?.BluetoothManager; return printer && manager ? { printer, manager } : null; } catch { return null; } }
export function directPrintAvailable(transport: Transport): boolean { if (transport === "lan") return getTcp() !== null; if (transport === "bluetooth") return getBluetooth() !== null; return true; }
function toBase64(bytes: Uint8Array): string { const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; let out = ""; for (let i = 0; i < bytes.length; i += 3) { const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]; out += chars[b0 >> 2]; out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]; out += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]; out += b2 === undefined ? "=" : chars[b2 & 63]; } return out; }
function printOverLan(bytes: Uint8Array, host: string, port: number): Promise<void> { const tcp = getTcp(); if (!tcp) return Promise.reject(new Error("LAN printing needs the installed APK build.")); if (!host) return Promise.reject(new Error("No printer IP configured.")); return new Promise((resolve, reject) => { let settled = false; const finish = (err?: Error) => { if (settled) return; settled = true; err ? reject(err) : resolve(); }; const socket = tcp.createConnection({ host, port, timeout: 6000 }, () => socket.write(bytes as never, undefined, () => setTimeout(() => { try { socket.end(); } catch {} finish(); }, 400))); socket.on("error", (e: unknown) => { try { socket.destroy(); } catch {} finish(new Error(`Printer unreachable at ${host}:${port} — ${String((e as Error)?.message ?? e)}`)); }); socket.on("timeout", () => { try { socket.destroy(); } catch {} finish(new Error(`Printer timed out at ${host}:${port}`)); }); }); }
async function printOverBluetooth(bytes: Uint8Array, address: string): Promise<void> { const bt = getBluetooth(); if (!bt) throw new Error("Bluetooth printing needs the installed APK build."); if (!address) throw new Error("No Bluetooth printer paired."); if (bt.manager.isBluetoothEnabled && !(await bt.manager.isBluetoothEnabled().catch(() => false)) && bt.manager.enableBluetooth) await bt.manager.enableBluetooth(); await bt.manager.connect(address); if (bt.printer.writeRaw) { await bt.printer.writeRaw(toBase64(bytes)); return; } throw new Error("Bluetooth printer module has no raw write support."); }
export type PrintResult = { ok: boolean; via: Transport | "none"; message: string };
export async function printKot(payload: KotPayload, config: PrinterConfig, queueOnServer?: () => Promise<void>): Promise<PrintResult> { const bytes = buildKot(payload, config.paperWidth); let directError: string | null = null; if (config.transport === "lan" || config.transport === "bluetooth") { try { if (config.transport === "lan") await printOverLan(bytes, config.host, config.port); else await printOverBluetooth(bytes, config.btAddress); if (config.alsoQueueOnServer && queueOnServer) await queueOnServer().catch(() => undefined); return { ok: true, via: config.transport, message: config.transport === "lan" ? `Printed to ${config.host}` : "Printed to Bluetooth printer" }; } catch (e) { directError = (e as Error)?.message ?? "Direct print failed"; } } if (queueOnServer) { try { await queueOnServer(); return { ok: true, via: "server", message: directError ? `Phone printer failed (${directError}). Sent to the kitchen print queue instead.` : "Sent to the kitchen print queue." }; } catch (e) { return { ok: false, via: "none", message: directError ?? (e as Error)?.message ?? "Printing failed" }; } } return { ok: false, via: "none", message: directError ?? "No printer configured" }; }
export async function printKotToConfiguredPrinters(payload: KotPayload, config: PrinterConfig, printerIdByItem: (item: KotPayload["items"][number]) => number | null | undefined, queueOnServer?: () => Promise<void>): Promise<PrintResult> { const printers = config.kotPrinters.filter((p) => p.enabled && p.host); if (!printers.length) return printKot(payload, config, queueOnServer); const defaultPrinter = printers[0]; const byPrinter = new Map<string, { printer: KotPrinter; items: KotPayload["items"] }>(); for (const item of payload.items) { const requestedId = printerIdByItem(item); const printer = printers.find((p) => p.printerId === requestedId) || defaultPrinter; const current = byPrinter.get(printer.id); if (current) current.items.push(item); else byPrinter.set(printer.id, { printer, items: [item] }); } const results = await Promise.all([...byPrinter.values()].map(({ printer, items }) => printKot({ ...payload, items }, { ...config, transport: "lan", host: printer.host, port: printer.port, alsoQueueOnServer: false }))); const failed = results.find((r) => !r.ok); if (failed) { if (queueOnServer) await queueOnServer(); return { ...failed, message: `${failed.message} Sent to the kitchen queue instead.` }; } if (config.alsoQueueOnServer && queueOnServer) await queueOnServer().catch(() => undefined); return { ok: true, via: "lan", message: `Printed to ${results.length} KOT printer${results.length === 1 ? "" : "s"}.` }; }
export async function printTest(config: PrinterConfig): Promise<PrintResult> { const payload: KotPayload = { orderNumber: "TEST-0001", tableName: "T1", waiterName: "Printer test", customerName: "iDine v2", items: [{ name: "Chicken Fried Rice", qty: 2, notes: "less spicy" }, { name: "Lime Juice", qty: 1 }] }; if (config.kotPrinters.some((p) => p.enabled && p.host)) return printKotToConfiguredPrinters(payload, { ...config, alsoQueueOnServer: false }, () => null, undefined); return printKot(payload, { ...config, alsoQueueOnServer: false }, undefined); }
