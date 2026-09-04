/**
 * Messaging Core — SMS + WhatsApp sending, credit accounting, template rendering.
 *
 * Every outbound message in iDine goes through `sendMessage()`. It is the single
 * place that:
 *   1. resolves the business that owns the branch (SMS link, sender IDs, credits)
 *   2. refuses to send when the customer opted out or the credit balance is short
 *   3. hits the gateway (urbanpos.lk for SMS, Meta Cloud API for WhatsApp)
 *   4. writes a `message_log` row (the delivery report) and debits credits
 *
 * Pricing: SMS_RATE_LKR per 160-character SMS segment. A 300-char message is
 * 2 segments and therefore costs 2 x rate — that is how the gateway bills it.
 * WhatsApp sends are logged with cost 0 (Meta bills the account separately).
 */

import { db } from "./database";
import * as schema from "./database/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

// ── Config ──────────────────────────────────────────────────────────────────

/** Fallback gateway used when a business has no smsExecutionLink of its own. */
export const DEFAULT_SMS_LINK =
  process.env.SMS_EXECUTION_LINK ?? "https://urbanpos.lk/demo/notification/users/sms_bk.php";

/** LKR charged per 160-char SMS segment. */
export const SMS_RATE_LKR = Number(process.env.SMS_RATE_LKR ?? 1);

const SMS_SEGMENT_CHARS = 160;
const WA_API_VERSION = "v21.0";

export type Channel = "sms" | "whatsapp";

export type MessageKind =
  | "manual"
  | "campaign"
  | "birthday"
  | "anniversary"
  | "child_birthday"
  | "festival"
  | "event";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** 160-char SMS segments — what the gateway actually bills. */
export function countSegments(body: string): number {
  return Math.max(1, Math.ceil((body?.length || 0) / SMS_SEGMENT_CHARS));
}

export function costOf(body: string, channel: Channel): number {
  if (channel === "whatsapp") return 0;
  return countSegments(body) * SMS_RATE_LKR;
}

/**
 * Normalise a Sri Lankan number to the 94XXXXXXXXX form the gateway expects.
 * Leaves anything already international alone. Returns "" when unusable.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let p = String(raw).replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "94" + p.slice(1);      // 0771234567 -> 94771234567
  else if (p.length === 9) p = "94" + p;             // 771234567  -> 94771234567
  if (p.length < 11 || p.length > 15) return "";
  return p;
}

/** First name, for friendlier greetings. */
function firstName(name: string | null | undefined): string {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/**
 * Fill template tokens. Unknown tokens are stripped so a half-filled template
 * never sends raw "{token}" text to a customer.
 *
 * Supported: {name} {first_name} {phone} {points} {child} {shop} {date}
 */
export function renderTemplate(
  body: string,
  customer?: Partial<typeof schema.customers.$inferSelect> | null,
  extras: Record<string, string> = {},
): string {
  const values: Record<string, string> = {
    name: String(customer?.name ?? ""),
    first_name: firstName(customer?.name),
    phone: String(customer?.phone ?? ""),
    points: String(Math.round(Number(customer?.loyaltyPoints ?? 0))),
    child: "",
    shop: "",
    date: new Date().toLocaleDateString("en-GB"),
    ...extras,
  };
  return (body || "")
    .replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * MM-DD of a date string, or "" — used for birthday/anniversary matching.
 * Accepts both "MM-DD" (what the customer form now stores — day and month only,
 * no year) and legacy "YYYY-MM-DD" rows.
 */
export function monthDay(date: string | null | undefined): string {
  if (!date) return "";
  const s = String(date).trim();
  const full = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (full) return `${full[2]}-${full[3]}`;
  const short = s.match(/^(\d{2})-(\d{2})$/);
  return short ? `${short[1]}-${short[2]}` : "";
}

// ── Business / credit resolution ────────────────────────────────────────────

export type BusinessConfig = {
  business: typeof schema.businesses.$inferSelect | null;
  smsLink: string;
  senderIds: string[];
  defaultSenderId: string;
  credits: number;
};

/** The business that owns a branch, with its messaging config resolved. */
export async function getBusinessConfig(branchId: number): Promise<BusinessConfig> {
  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.branchId, branchId));

  const senderIds = String(business?.senderIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    business: business ?? null,
    smsLink: business?.smsExecutionLink?.trim() || DEFAULT_SMS_LINK,
    senderIds,
    defaultSenderId: senderIds[0] ?? "",
    credits: Number(business?.smsCredits ?? 0),
  };
}

/**
 * Move the credit balance and record the ledger entry.
 * `delta` is negative for a debit. Returns the new balance.
 */
export async function applyCredit(
  businessId: number,
  delta: number,
  type: "recharge" | "debit" | "adjustment",
  note: string,
  createdBy = "system",
  branchId?: number,
): Promise<number> {
  const [biz] = await db.select().from(schema.businesses).where(eq(schema.businesses.id, businessId));
  if (!biz) throw new Error("Business not found");

  const balanceAfter = Math.round((Number(biz.smsCredits ?? 0) + delta) * 100) / 100;

  await db
    .update(schema.businesses)
    .set({ smsCredits: balanceAfter })
    .where(eq(schema.businesses.id, businessId));

  await db.insert(schema.creditTransactions).values({
    businessId,
    branchId: branchId ?? biz.branchId ?? null,
    type,
    amount: delta,
    balanceAfter,
    note,
    createdBy,
  });

  return balanceAfter;
}

// ── Gateway transports ──────────────────────────────────────────────────────

/**
 * SMS gateway. The endpoint takes exactly three params — message, phone_no,
 * sender_id — so both a form POST and a query-string GET are attempted before
 * giving up, because some deployments of this script only read $_GET.
 */
async function postSms(
  link: string,
  params: { message: string; phone_no: string; sender_id: string },
): Promise<{ ok: boolean; response: string }> {
  const form = new URLSearchParams(params);

  try {
    const res = await fetch(link, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const text = (await res.text()).trim();
    if (res.ok) return { ok: true, response: text.slice(0, 500) };

    // Retry as GET — some builds of sms_bk.php only look at $_GET.
    const url = `${link}${link.includes("?") ? "&" : "?"}${form.toString()}`;
    const res2 = await fetch(url, { method: "GET", signal: AbortSignal.timeout(20_000) });
    const text2 = (await res2.text()).trim();
    return { ok: res2.ok, response: `${res.status}:${text.slice(0, 200)} | GET ${res2.status}:${text2.slice(0, 200)}` };
  } catch (e: any) {
    return { ok: false, response: String(e?.message ?? e).slice(0, 500) };
  }
}

/** Meta WhatsApp Cloud API — plain text message. */
async function postWhatsapp(
  phoneId: string,
  token: string,
  to: string,
  body: string,
): Promise<{ ok: boolean; response: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = (await res.text()).trim();
    return { ok: res.ok, response: text.slice(0, 500) };
  } catch (e: any) {
    return { ok: false, response: String(e?.message ?? e).slice(0, 500) };
  }
}

// ── The single send entry point ─────────────────────────────────────────────

export type SendArgs = {
  branchId: number;
  body: string;
  channel?: Channel;
  kind?: MessageKind;
  /** Provide either a customer row/id or a bare phone number. */
  customer?: Partial<typeof schema.customers.$inferSelect> | null;
  phone?: string;
  senderId?: string;
  campaignId?: number | null;
  /** Skip the opt-out check — only for transactional messages the customer asked for. */
  ignoreOptOut?: boolean;
};

export type SendResult = {
  ok: boolean;
  status: "sent" | "failed" | "skipped";
  reason?: string;
  logId?: number;
  cost: number;
  balance?: number;
};

export async function sendMessage(args: SendArgs): Promise<SendResult> {
  const channel: Channel = args.channel ?? "sms";
  const kind: MessageKind = args.kind ?? "manual";
  const body = (args.body ?? "").trim();

  const cfg = await getBusinessConfig(args.branchId);
  const phone = normalizePhone(args.phone ?? args.customer?.phone ?? "");
  const senderId = (args.senderId || cfg.defaultSenderId || "").trim();
  const cost = costOf(body, channel);

  // Log the attempt up front so nothing is ever sent without a record.
  const logBase = {
    branchId: args.branchId,
    customerId: (args.customer?.id as number | undefined) ?? null,
    campaignId: args.campaignId ?? null,
    channel,
    kind,
    phone: phone || String(args.phone ?? args.customer?.phone ?? ""),
    senderId: senderId || null,
    body,
    segments: countSegments(body),
    cost: 0,
  };

  const skip = async (reason: string): Promise<SendResult> => {
    const [row] = await db
      .insert(schema.messageLog)
      .values({ ...logBase, status: "skipped", error: reason })
      .returning();
    return { ok: false, status: "skipped", reason, logId: row?.id, cost: 0, balance: cfg.credits };
  };

  // ── Guards ──
  if (!body) return skip("Empty message body");
  if (!phone) return skip("Invalid or missing phone number");
  if (!args.ignoreOptOut && args.customer?.smsOptOut) return skip("Customer opted out of messages");

  if (channel === "sms") {
    if (!cfg.business) return skip("No business is linked to this branch — set it up in the iDSA panel");
    if (!senderId) return skip("No Sender ID configured for this business (iDSA panel)");
    if (cfg.credits < cost) {
      return skip(`Insufficient SMS credits: balance LKR ${cfg.credits.toFixed(2)}, this message costs LKR ${cost.toFixed(2)}`);
    }
  } else {
    if (!cfg.business?.whatsappPhoneId || !cfg.business?.whatsappToken) {
      return skip("WhatsApp is not configured for this business (iDSA panel)");
    }
  }

  // ── Send ──
  const result =
    channel === "sms"
      ? await postSms(cfg.smsLink, { message: body, phone_no: phone, sender_id: senderId })
      : await postWhatsapp(cfg.business!.whatsappPhoneId!, cfg.business!.whatsappToken!, phone, body);

  const charged = result.ok ? cost : 0;

  const [row] = await db
    .insert(schema.messageLog)
    .values({
      ...logBase,
      cost: charged,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.response,
      gatewayResponse: result.response,
      sentAt: result.ok ? new Date() : null,
    })
    .returning();

  let balance = cfg.credits;
  if (result.ok && charged > 0 && cfg.business) {
    balance = await applyCredit(
      cfg.business.id,
      -charged,
      "debit",
      `${channel.toUpperCase()} ${kind} to ${phone}`,
      "system",
      args.branchId,
    );
  }

  return {
    ok: result.ok,
    status: result.ok ? "sent" : "failed",
    reason: result.ok ? undefined : result.response,
    logId: row?.id,
    cost: charged,
    balance,
  };
}

// ── Audience resolution (shared by campaigns and the UI preview) ────────────

/** Customers a campaign will actually reach, opt-outs already removed. */
export async function resolveAudience(
  branchId: number,
  audience: string,
  audienceValue?: string | null,
): Promise<(typeof schema.customers.$inferSelect)[]> {
  const all = await db.select().from(schema.customers).where(eq(schema.customers.branchId, branchId));

  let list = all;
  if (audience === "tag" && audienceValue) {
    const want = audienceValue.toLowerCase().trim();
    list = all.filter((c) =>
      String(c.tags ?? "")
        .split(",")
        .map((t) => t.toLowerCase().trim())
        .includes(want),
    );
  } else if (audience === "selection" && audienceValue) {
    let ids: number[] = [];
    try {
      ids = JSON.parse(audienceValue);
    } catch {
      ids = String(audienceValue)
        .split(",")
        .map((n) => parseInt(n.trim()))
        .filter((n) => !Number.isNaN(n));
    }
    list = all.filter((c) => ids.includes(c.id));
  }

  return list.filter((c) => !c.smsOptOut && normalizePhone(c.phone));
}
