// Printer configuration + transports for KOT printing straight from the waiter's phone.
//
// Three transports, tried in this order by `printKot`:
//   1. "lan"     — raw ESC/POS bytes over TCP to a network thermal printer (port 9100).
//                  Needs react-native-tcp-socket, which only exists in a dev/release build
//                  (i.e. the APK) — never in Expo Go or the web preview.
//   2. "bluetooth" — ESC/POS over a paired Bluetooth thermal printer (portable belt printers).
//                  Needs react-native-bluetooth-escpos-printer, APK only.
//   3. "server"  — falls back to the server print-jobs queue, which the existing Windows
//                  print helper drains. Works everywhere, including the web preview.
//
// Every native module is loaded through an optional require inside a try/catch, so a build
// without them degrades to the server queue instead of crashing at import time.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { buildKot, type KotPayload, type PaperWidth } from "./escpos";

export type Transport = "lan" | "bluetooth" | "server";

export type PrinterConfig = {
  transport: Transport;
  /** LAN only */
  host: string;
  port: number;
  /** Bluetooth only — MAC address of the paired printer. */
  btAddress: string;
  btName: string;
  paperWidth: PaperWidth;
  /** Also queue a server-side job so the kitchen station prints its own copy. */
  alsoQueueOnServer: boolean;
};

export const DEFAULT_CONFIG: PrinterConfig = {
  transport: "server",
  host: "",
  port: 9100,
  btAddress: "",
  btName: "",
  paperWidth: 32,
  alsoQueueOnServer: true,
};

const KEY = "waiter_printer_config";

export async function loadPrinterConfig(): Promise<PrinterConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_CONFIG;
    const config = { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<PrinterConfig>) };
    // This build ships without the Bluetooth module, and the settings screen no longer
    // offers it. Any config saved earlier with "bluetooth" is coerced to the server queue
    // so the UI can't show an option that isn't selectable.
    if (config.transport === "bluetooth") config.transport = "server";
    return config;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(config));
}

// ── Native module access (optional at runtime) ──────────────────────────────

type TcpModule = {
  createConnection: (
    opts: { host: string; port: number; timeout?: number },
    cb: () => void,
  ) => {
    write: (data: Buffer | Uint8Array | string, enc?: string, cb?: () => void) => void;
    destroy: () => void;
    end: () => void;
    on: (event: string, cb: (arg?: unknown) => void) => void;
    setTimeout?: (ms: number) => void;
  };
};

function getTcp(): TcpModule | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-tcp-socket");
    return (mod?.default ?? mod) as TcpModule;
  } catch {
    return null;
  }
}

type BluetoothModule = {
  writeRaw?: (base64: string) => Promise<void>;
  write?: (data: string) => Promise<void>;
};

type BluetoothManager = {
  connect: (address: string) => Promise<void>;
  enableBluetooth?: () => Promise<string[]>;
  isBluetoothEnabled?: () => Promise<boolean>;
  scanDevices?: () => Promise<string>;
};

function getBluetooth(): { printer: BluetoothModule; manager: BluetoothManager } | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-bluetooth-escpos-printer");
    const printer = mod?.BluetoothEscposPrinter ?? mod?.default?.BluetoothEscposPrinter;
    const manager = mod?.BluetoothManager ?? mod?.default?.BluetoothManager;
    if (!printer || !manager) return null;
    return { printer, manager };
  } catch {
    return null;
  }
}

/** True when the phone can print without going through the server queue. */
export function directPrintAvailable(transport: Transport): boolean {
  if (transport === "lan") return getTcp() !== null;
  if (transport === "bluetooth") return getBluetooth() !== null;
  return true;
}

function toBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += chars[b0 >> 2];
    out += chars[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : chars[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : chars[b2 & 63];
  }
  return out;
}

// ── Transports ──────────────────────────────────────────────────────────────

function printOverLan(bytes: Uint8Array, host: string, port: number): Promise<void> {
  const tcp = getTcp();
  if (!tcp) return Promise.reject(new Error("LAN printing needs the installed APK build."));
  if (!host) return Promise.reject(new Error("No printer IP configured."));

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };

    const socket = tcp.createConnection({ host, port, timeout: 6000 }, () => {
      socket.write(bytes as never, undefined, () => {
        // Give the printer a beat to drain before tearing the socket down.
        setTimeout(() => {
          try {
            socket.end();
          } catch {
            /* already closed */
          }
          finish();
        }, 400);
      });
    });

    socket.on("error", (e: unknown) => {
      try {
        socket.destroy();
      } catch {
        /* noop */
      }
      finish(new Error(`Printer unreachable at ${host}:${port} — ${String((e as Error)?.message ?? e)}`));
    });
    socket.on("timeout", () => {
      try {
        socket.destroy();
      } catch {
        /* noop */
      }
      finish(new Error(`Printer timed out at ${host}:${port}`));
    });
  });
}

async function printOverBluetooth(bytes: Uint8Array, address: string): Promise<void> {
  const bt = getBluetooth();
  if (!bt) throw new Error("Bluetooth printing needs the installed APK build.");
  if (!address) throw new Error("No Bluetooth printer paired.");

  if (bt.manager.isBluetoothEnabled) {
    const enabled = await bt.manager.isBluetoothEnabled().catch(() => false);
    if (!enabled && bt.manager.enableBluetooth) await bt.manager.enableBluetooth();
  }
  await bt.manager.connect(address);

  const payload = toBase64(bytes);
  if (bt.printer.writeRaw) {
    await bt.printer.writeRaw(payload);
    return;
  }
  throw new Error("Bluetooth printer module has no raw write support.");
}

// ── Public API ──────────────────────────────────────────────────────────────

export type PrintResult = {
  ok: boolean;
  /** Which transport actually produced the ticket. */
  via: Transport | "none";
  message: string;
};

/**
 * Prints a KOT. Attempts the configured direct transport first and falls back to the
 * server print queue so an order is never silently left without a ticket.
 *
 * @param queueOnServer callback that creates the server-side print job (already wired
 *                      to the /api/print-jobs endpoint by the caller).
 */
export async function printKot(
  payload: KotPayload,
  config: PrinterConfig,
  queueOnServer?: () => Promise<void>,
): Promise<PrintResult> {
  const bytes = buildKot(payload, config.paperWidth);
  let directError: string | null = null;

  if (config.transport === "lan" || config.transport === "bluetooth") {
    try {
      if (config.transport === "lan") await printOverLan(bytes, config.host, config.port);
      else await printOverBluetooth(bytes, config.btAddress);

      if (config.alsoQueueOnServer && queueOnServer) {
        await queueOnServer().catch(() => undefined);
      }
      return {
        ok: true,
        via: config.transport,
        message: config.transport === "lan" ? `Printed to ${config.host}` : "Printed to Bluetooth printer",
      };
    } catch (e) {
      directError = (e as Error)?.message ?? "Direct print failed";
    }
  }

  if (queueOnServer) {
    try {
      await queueOnServer();
      return {
        ok: true,
        via: "server",
        message: directError
          ? `Phone printer failed (${directError}). Sent to the kitchen print queue instead.`
          : "Sent to the kitchen print queue.",
      };
    } catch (e) {
      return {
        ok: false,
        via: "none",
        message: directError ?? (e as Error)?.message ?? "Printing failed",
      };
    }
  }

  return { ok: false, via: "none", message: directError ?? "No printer configured" };
}

/** Sends a short self-test ticket so staff can verify a printer without an order. */
export async function printTest(config: PrinterConfig): Promise<PrintResult> {
  return printKot(
    {
      orderNumber: "TEST-0001",
      tableName: "T1",
      waiterName: "Printer test",
      customerName: "iDine v2",
      items: [
        { name: "Chicken Fried Rice", qty: 2, notes: "less spicy" },
        { name: "Lime Juice", qty: 1 },
      ],
    },
    { ...config, alsoQueueOnServer: false },
    undefined,
  );
}
