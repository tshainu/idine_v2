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
};

export type KotPayload = {
  orderNumber: string;
  tableName?: string | null;
  waiterName?: string | null;
  customerName?: string | null;
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
  const isUpdate = payload.mode === "update";
  const qtyCol = 4; // "12x "
  const nameWidth = width - qtyCol;

  b.init().align("center");

  b.bold(true).size(2, 2);
  b.line(isUpdate ? "*UPDATED KOT*" : "KOT");
  b.size(1, 1).bold(false);

  if (payload.tableName) {
    b.bold(true).size(2, 2).line(`TABLE ${payload.tableName}`).size(1, 1).bold(false);
  } else if (payload.type) {
    b.bold(true).size(2, 1).line(payload.type.toUpperCase()).size(1, 1).bold(false);
  }

  b.align("left").line(rule(width));
  b.line(`Order : ${payload.orderNumber}`);
  if (payload.waiterName) b.line(`Waiter: ${payload.waiterName}`);
  if (payload.customerName) {
    for (const l of wrap(`Cust  : ${payload.customerName}`, width)) b.line(l);
  }
  b.line(`Time  : ${stamp(printedAt)}`);
  b.line(rule(width));

  for (const item of payload.items) {
    const label = item.variationName ? `${item.name} (${item.variationName})` : item.name;
    const qty = `${item.qty}x`.padEnd(qtyCol, " ");
    const wrapped = wrap(label, nameWidth);

    b.bold(true).size(1, 2);
    b.line(`${qty}${wrapped[0]}`);
    for (const extra of wrapped.slice(1)) {
      b.line(`${" ".repeat(qtyCol)}${extra}`);
    }
    b.size(1, 1).bold(false);

    if (item.notes) {
      for (const l of wrap(`>> ${item.notes}`, nameWidth)) {
        b.line(`${" ".repeat(qtyCol)}${l}`);
      }
    }
  }

  b.line(rule(width));
  const totalQty = payload.items.reduce((sum, i) => sum + i.qty, 0);
  b.bold(true).line(`TOTAL ITEMS: ${totalQty}`).bold(false);
  b.feed(3).cut();

  return b.bytes();
}

/** Plain-text mirror of the ticket — used for the on-screen preview. */
export function kotPreviewText(payload: KotPayload, width: PaperWidth = 32): string {
  const printedAt = payload.printedAt ?? new Date();
  const lines: string[] = [];
  const center = (v: string) => {
    const pad = Math.max(0, Math.floor((width - v.length) / 2));
    return " ".repeat(pad) + v;
  };

  lines.push(center(payload.mode === "update" ? "*UPDATED KOT*" : "KOT"));
  if (payload.tableName) lines.push(center(`TABLE ${payload.tableName}`));
  else if (payload.type) lines.push(center(payload.type.toUpperCase()));
  lines.push(rule(width));
  lines.push(`Order : ${payload.orderNumber}`);
  if (payload.waiterName) lines.push(`Waiter: ${payload.waiterName}`);
  if (payload.customerName) lines.push(...wrap(`Cust  : ${payload.customerName}`, width));
  lines.push(`Time  : ${stamp(printedAt)}`);
  lines.push(rule(width));
  for (const item of payload.items) {
    const label = item.variationName ? `${item.name} (${item.variationName})` : item.name;
    const wrapped = wrap(label, width - 4);
    lines.push(`${`${item.qty}x`.padEnd(4, " ")}${wrapped[0]}`);
    for (const extra of wrapped.slice(1)) lines.push(`    ${extra}`);
    if (item.notes) for (const l of wrap(`>> ${item.notes}`, width - 4)) lines.push(`    ${l}`);
  }
  lines.push(rule(width));
  lines.push(`TOTAL ITEMS: ${payload.items.reduce((s, i) => s + i.qty, 0)}`);
  return lines.join("\n");
}
