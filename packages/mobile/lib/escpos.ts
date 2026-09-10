// ESC/POS command builder for thermal receipt printers (58mm / 80mm).
// Pure TypeScript — no native modules — so it runs in the web preview, in Expo Go
// and in the release APK identically. Transports live in ./printer.ts.

const ESC = 0x1b;
const GS = 0x1d;

export type KotItem = {
  name: string;
  qty: number;
  notes?: string | null;
  variationName?: string | null;
  printerId?: number | null;
};

export type KotPayload = {
  orderNumber: string;
  tableName?: string | null;
  /** Stable fallback when the table catalog name is unavailable at print time. */
  tableId?: number | null;
  placedBy?: string | null;
  waiterName?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  type?: string | null;
  items: KotItem[];
  /** "new" prints a fresh KOT, "update" marks it as an amended ticket. */
  mode?: "new" | "update";
  printedAt?: Date;
};

/** Characters per line: 32 for 58mm paper, 48 for 80mm. */
export type PaperWidth = 32 | 48;

class Builder {
  private parts: number[] = [];

  raw(...bytes: number[]) {
    this.parts.push(...bytes);
    return this;
  }

  /** Latin-1 keeps £/€-free ASCII safe; unknown glyphs degrade to '?'. */
  text(value: string) {
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      this.parts.push(code > 0xff ? 0x3f : code);
    }
    return this;
  }

  line(value = "") {
    return this.text(value).raw(0x0a);
  }

  init() {
    return this.raw(ESC, 0x40);
  }

  align(mode: "left" | "center" | "right") {
    const map = { left: 0, center: 1, right: 2 } as const;
    return this.raw(ESC, 0x61, map[mode]);
  }

  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  underline(on: boolean) {
    return this.raw(ESC, 0x2d, on ? 1 : 0);
  }

  /** width/height are 1-8 multipliers. */
  size(width: number, height: number) {
    const w = Math.min(Math.max(width, 1), 8) - 1;
    const h = Math.min(Math.max(height, 1), 8) - 1;
    return this.raw(GS, 0x21, (w << 4) | h);
  }

  feed(lines = 1) {
    return this.raw(ESC, 0x64, lines);
  }

  cut() {
    // Full cut, with a feed so the tear line clears the print head.
    return this.raw(GS, 0x56, 0x00);
  }

  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

function rule(width: PaperWidth, char = "-") {
  return char.repeat(width);
}

/** Wraps long item names instead of letting the printer truncate them. */
function wrap(value: string, width: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current === "") {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function two(n: number) {
  return String(n).padStart(2, "0");
}

function stamp(date: Date) {
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/**
 * Builds a kitchen order ticket. Layout is qty-first and double-height for the
 * item lines, because kitchen staff read these at arm's length across a hot line.
 */
export function buildKot(payload: KotPayload, width: PaperWidth = 32): Uint8Array {
  const b = new Builder();
  const printedAt = payload.printedAt ?? new Date();
  const qtyCol = 4; // "12x "
  const nameWidth = width - qtyCol;
  const tableLabel = payload.tableName?.trim() || (payload.tableId ? String(payload.tableId) : null);
  const typeLabel = (payload.type || "DINE IN").replace(/[-_]/g, " ").toUpperCase();
  const boxWidth = Math.min(width - 4, typeLabel.length + 4);

  b.init().align("center");
  b.bold(true).size(2, 1).line("***KOT***").size(1, 1).bold(false);
  b.bold(true).line(`+${"-".repeat(boxWidth)}+`);
  b.line(`| ${typeLabel.padEnd(boxWidth - 2, " ")} |`);
  b.line(`+${"-".repeat(boxWidth)}+`).bold(false);

  b.align("left").line(rule(width));
  b.line(`Order #: ${payload.orderNumber}`);
  if (tableLabel) b.bold(true).line(`Table: ${tableLabel}`).bold(false);
  b.line(`Time: ${two(printedAt.getHours())}:${two(printedAt.getMinutes())}:${two(printedAt.getSeconds())}`);
  b.line(`Placed By: ${payload.placedBy || payload.waiterName || "—"}`);
  b.line(`Waiter: ${payload.waiterName || "—"}`);
  b.line(rule(width));

  for (const item of payload.items) {
    const label = item.variationName ? `${item.name} (${item.variationName})` : item.name;
    const wrapped = wrap(label, nameWidth);
    // Keep normal character width so 58mm tickets still wrap correctly, while
    // doubling height makes item details readable from the kitchen pass.
    b.bold(true).size(1, 2);
    b.line(`${`${item.qty}x`.padEnd(qtyCol, " ")}${wrapped[0]}`);
    for (const extra of wrapped.slice(1)) b.line(`${" ".repeat(qtyCol)}${extra}`);
    b.bold(false).size(1, 1);
    if (item.notes) {
      b.size(1, 2);
      for (const l of wrap(`** ${item.notes} **`, nameWidth)) b.line(`${" ".repeat(qtyCol)}${l}`);
      b.size(1, 1);
    }
    b.line(rule(width));
  }

  // Leave a little extra blank paper below the last item so the tear line clears
  // the print head and staff can tear the KOT without cutting into the footer.
  b.feed(5).cut();

  return b.bytes();
}

/** Plain-text mirror of the ticket — used for the on-screen preview. */
export function kotPreviewText(payload: KotPayload, width: PaperWidth = 32): string {
  const printedAt = payload.printedAt ?? new Date();
  const tableLabel = payload.tableName?.trim() || (payload.tableId ? String(payload.tableId) : null);
  const lines: string[] = [];
  const center = (v: string) => {
    const pad = Math.max(0, Math.floor((width - v.length) / 2));
    return " ".repeat(pad) + v;
  };

  const typeLabel = (payload.type || "DINE IN").replace(/[-_]/g, " ").toUpperCase();
  const boxWidth = Math.min(width - 4, typeLabel.length + 4);
  lines.push(center("***KOT***"));
  lines.push(center(`+${"-".repeat(boxWidth)}+`));
  lines.push(center(`| ${typeLabel.padEnd(boxWidth - 2, " ")} |`));
  lines.push(center(`+${"-".repeat(boxWidth)}+`));
  lines.push(rule(width));
  lines.push(`Order #: ${payload.orderNumber}`);
  if (tableLabel) lines.push(`Table: ${tableLabel}`);
  lines.push(`Time: ${two(printedAt.getHours())}:${two(printedAt.getMinutes())}:${two(printedAt.getSeconds())}`);
  lines.push(`Placed By: ${payload.placedBy || payload.waiterName || "—"}`);
  lines.push(`Waiter: ${payload.waiterName || "—"}`);
  lines.push(rule(width));
  for (const item of payload.items) {
    const label = item.variationName ? `${item.name} (${item.variationName})` : item.name;
    const wrapped = wrap(label, width - 4);
    lines.push(`${`${item.qty}x`.padEnd(4, " ")}${wrapped[0]}`);
    for (const extra of wrapped.slice(1)) lines.push(`    ${extra}`);
    if (item.notes) for (const l of wrap(`** ${item.notes} **`, width - 4)) lines.push(`    ${l}`);
    lines.push(rule(width));
  }
  return lines.join("\n");
}
