import { Hono } from "hono";
import { db } from "../database";
import * as schema from "../database/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  sendMessage,
  resolveAudience,
  getBusinessConfig,
  renderTemplate,
  countSegments,
  costOf,
  normalizePhone,
  monthDay,
  SMS_RATE_LKR,
  type Channel,
  type MessageKind,
} from "../messaging-core";

// ── Automation settings live in branch_settings so they share the existing
//    key/value plumbing. These are the keys this feature owns. ──────────────
export const AUTOMATION_KEYS = {
  enabled: "msgAutoEnabled",       // "1" | "0"
  sendTime: "msgAutoSendTime",     // "09:00" — 24h local time
  channel: "msgAutoChannel",       // "sms" | "whatsapp"
  birthday: "msgAutoBirthday",     // "1" | "0"
  anniversary: "msgAutoAnniversary",
  childBirthday: "msgAutoChildBirthday",
  senderId: "msgAutoSenderId",
  signature: "msgSignature",       // branding appended to every message
} as const;

const AUTOMATION_DEFAULTS: Record<string, string> = {
  [AUTOMATION_KEYS.enabled]: "0",
  [AUTOMATION_KEYS.sendTime]: "09:00",
  [AUTOMATION_KEYS.channel]: "sms",
  [AUTOMATION_KEYS.birthday]: "1",
  [AUTOMATION_KEYS.anniversary]: "1",
  [AUTOMATION_KEYS.childBirthday]: "1",
  [AUTOMATION_KEYS.senderId]: "",
  [AUTOMATION_KEYS.signature]: "",
};

/** Read this branch's automation config, defaults filled in. */
export async function getAutomation(branchId: number): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(schema.branchSettings)
    .where(eq(schema.branchSettings.branchId, branchId));
  const out = { ...AUTOMATION_DEFAULTS };
  for (const r of rows) if (r.key in out) out[r.key] = r.value ?? "";
  return out;
}

async function setAutomation(branchId: number, kv: Record<string, string>) {
  for (const [key, value] of Object.entries(kv)) {
    if (!(key in AUTOMATION_DEFAULTS)) continue;
    const [existing] = await db
      .select()
      .from(schema.branchSettings)
      .where(and(eq(schema.branchSettings.branchId, branchId), eq(schema.branchSettings.key, key)));
    if (existing) {
      await db
        .update(schema.branchSettings)
        .set({ value: String(value) })
        .where(eq(schema.branchSettings.id, existing.id));
    } else {
      await db.insert(schema.branchSettings).values({ branchId, key, value: String(value) });
    }
  }
}

/** Append the branding signature, keeping the message inside sane SMS length. */
export function withSignature(body: string, signature: string): string {
  const sig = (signature ?? "").trim();
  if (!sig || body.includes(sig)) return body;
  return `${body.trim()}\n${sig}`;
}

const bid = (c: any) => parseInt(c.req.query("branchId") || "1");

export const messaging = new Hono()
  // ── Balance + gateway readiness ───────────────────────────────────────────
  .get("/balance", async (c) => {
    const branchId = bid(c);
    const cfg = await getBusinessConfig(branchId);
    return c.json(
      {
        credits: cfg.credits,
        rate: SMS_RATE_LKR,
        senderIds: cfg.senderIds,
        defaultSenderId: cfg.defaultSenderId,
        smsReady: Boolean(cfg.business && cfg.senderIds.length > 0),
        whatsappReady: Boolean(cfg.business?.whatsappPhoneId && cfg.business?.whatsappToken),
        businessName: cfg.business?.businessName ?? null,
      },
      200,
    );
  })

  // ── Send one message (used by the Customers page "Send SMS" action) ───────
  .post("/send", async (c) => {
    const body = await c.req.json<{
      branchId: number;
      customerId?: number;
      phone?: string;
      body: string;
      channel?: Channel;
      senderId?: string;
      kind?: MessageKind;
    }>();

    const branchId = Number(body.branchId || 1);
    const auto = await getAutomation(branchId);

    let customer: any = null;
    if (body.customerId) {
      [customer] = await db.select().from(schema.customers).where(eq(schema.customers.id, body.customerId));
    }

    const text = withSignature(renderTemplate(body.body, customer), auto[AUTOMATION_KEYS.signature]);

    const result = await sendMessage({
      branchId,
      body: text,
      channel: body.channel ?? "sms",
      kind: body.kind ?? "manual",
      customer,
      phone: body.phone,
      senderId: body.senderId,
    });

    return c.json(result, result.status === "sent" ? 200 : 400);
  })

  // ── Delivery report / message history ─────────────────────────────────────
  .get("/log", async (c) => {
    const branchId = bid(c);
    const customerId = c.req.query("customerId");
    const limit = Math.min(500, parseInt(c.req.query("limit") || "100"));

    const where = customerId
      ? and(eq(schema.messageLog.branchId, branchId), eq(schema.messageLog.customerId, parseInt(customerId)))
      : eq(schema.messageLog.branchId, branchId);

    const rows = await db
      .select()
      .from(schema.messageLog)
      .where(where)
      .orderBy(desc(schema.messageLog.id))
      .limit(limit);

    return c.json({ log: rows }, 200);
  })

  // ── Headline counters for the messaging dashboard ─────────────────────────
  .get("/stats", async (c) => {
    const branchId = bid(c);
    const rows = await db.select().from(schema.messageLog).where(eq(schema.messageLog.branchId, branchId));

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const ts = (d: any) => (d ? new Date(d).getTime() : 0);

    const sent = rows.filter((r) => r.status === "sent");
    return c.json(
      {
        totalSent: sent.length,
        totalFailed: rows.filter((r) => r.status === "failed").length,
        totalSkipped: rows.filter((r) => r.status === "skipped").length,
        sentToday: sent.filter((r) => ts(r.sentAt ?? r.createdAt) >= startOfDay).length,
        sentThisMonth: sent.filter((r) => ts(r.sentAt ?? r.createdAt) >= startOfMonth).length,
        spentThisMonth: sent
          .filter((r) => ts(r.sentAt ?? r.createdAt) >= startOfMonth)
          .reduce((s, r) => s + Number(r.cost || 0), 0),
        spentTotal: sent.reduce((s, r) => s + Number(r.cost || 0), 0),
      },
      200,
    );
  })

  // ── Templates ─────────────────────────────────────────────────────────────
  .get("/templates", async (c) => {
    const branchId = bid(c);
    const rows = await db
      .select()
      .from(schema.messageTemplates)
      .where(eq(schema.messageTemplates.branchId, branchId))
      .orderBy(desc(schema.messageTemplates.id));
    return c.json({ templates: rows }, 200);
  })
  .post("/templates", async (c) => {
    const body = await c.req.json();
    const [template] = await db.insert(schema.messageTemplates).values(body).returning();
    return c.json({ template }, 201);
  })
  .patch("/templates/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const body = await c.req.json();
    const [template] = await db
      .update(schema.messageTemplates)
      .set(body)
      .where(eq(schema.messageTemplates.id, id))
      .returning();
    return c.json({ template }, 200);
  })
  .delete("/templates/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.delete(schema.messageTemplates).where(eq(schema.messageTemplates.id, id));
    return c.json({ ok: true }, 200);
  })

  // ── Customer groups (tags) with counts ────────────────────────────────────
  .get("/tags", async (c) => {
    const branchId = bid(c);
    const rows = await db.select().from(schema.customers).where(eq(schema.customers.branchId, branchId));
    const counts: Record<string, number> = {};
    for (const cust of rows) {
      for (const t of String(cust.tags ?? "").split(",")) {
        const tag = t.trim();
        if (tag) counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return c.json(
      { tags: Object.entries(counts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) },
      200,
    );
  })

  // ── Audience preview: who a campaign would reach, and what it would cost ──
  .get("/audience", async (c) => {
    const branchId = bid(c);
    const audience = c.req.query("audience") || "all";
    const value = c.req.query("value") || null;
    const body = c.req.query("body") || "";
    const channel = (c.req.query("channel") || "sms") as Channel;

    const list = await resolveAudience(branchId, audience, value);
    const perMessage = costOf(body, channel);

    return c.json(
      {
        count: list.length,
        segments: countSegments(body),
        estimatedCost: Math.round(perMessage * list.length * 100) / 100,
        preview: list.slice(0, 20).map((cust) => ({
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          rendered: renderTemplate(body, cust),
        })),
      },
      200,
    );
  })

  // ── Upcoming occasions (birthdays, anniversaries, children's birthdays) ───
  .get("/occasions", async (c) => {
    const branchId = bid(c);
    const days = Math.min(90, parseInt(c.req.query("days") || "30"));
    const rows = await db.select().from(schema.customers).where(eq(schema.customers.branchId, branchId));

    // Build the MM-DD window starting today so it wraps across year end.
    const window: string[] = [];
    const cursor = new Date();
    for (let i = 0; i < days; i++) {
      window.push(
        `${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
      );
      cursor.setDate(cursor.getDate() + 1);
    }
    const dayIndex = (md: string) => window.indexOf(md);

    type Occasion = {
      customerId: number;
      name: string;
      phone: string | null;
      kind: MessageKind;
      label: string;
      date: string;
      inDays: number;
      optedOut: boolean;
      autoWishes: boolean;
    };
    const occasions: Occasion[] = [];

    const push = (cust: any, date: string | null, kind: MessageKind, label: string) => {
      const idx = dayIndex(monthDay(date));
      if (!date || idx < 0) return;
      occasions.push({
        customerId: cust.id,
        name: cust.name,
        phone: cust.phone,
        kind,
        label,
        date,
        inDays: idx,
        optedOut: Boolean(cust.smsOptOut),
        autoWishes: Boolean(cust.autoWishes),
      });
    };

    for (const cust of rows) {
      push(cust, cust.dob, "birthday", "Birthday");
      push(cust, cust.weddingAnniversary, "anniversary", "Wedding anniversary");
      push(cust, cust.child1Dob, "child_birthday", `${cust.child1Name || "Child 1"}'s birthday`);
      push(cust, cust.child2Dob, "child_birthday", `${cust.child2Name || "Child 2"}'s birthday`);
      push(cust, cust.child3Dob, "child_birthday", `${cust.child3Name || "Child 3"}'s birthday`);
    }

    occasions.sort((a, b) => a.inDays - b.inDays);
    return c.json({ occasions }, 200);
  })

  // ── Automation settings ───────────────────────────────────────────────────
  .get("/automation", async (c) => {
    const branchId = bid(c);
    return c.json({ automation: await getAutomation(branchId) }, 200);
  })
  .post("/automation", async (c) => {
    const body = await c.req.json<{ branchId: number; automation: Record<string, string> }>();
    await setAutomation(Number(body.branchId || 1), body.automation || {});
    return c.json({ automation: await getAutomation(Number(body.branchId || 1)) }, 200);
  })

  // ── Campaigns ─────────────────────────────────────────────────────────────
  .get("/campaigns", async (c) => {
    const branchId = bid(c);
    const rows = await db
      .select()
      .from(schema.messageCampaigns)
      .where(eq(schema.messageCampaigns.branchId, branchId))
      .orderBy(desc(schema.messageCampaigns.id));
    return c.json({ campaigns: rows }, 200);
  })
  .post("/campaigns", async (c) => {
    const body = await c.req.json<any>();
    const branchId = Number(body.branchId || 1);
    const audienceValue =
      typeof body.audienceValue === "string" ? body.audienceValue : JSON.stringify(body.audienceValue ?? null);

    const list = await resolveAudience(branchId, body.audience || "all", audienceValue);
    const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;

    const [campaign] = await db
      .insert(schema.messageCampaigns)
      .values({
        branchId,
        name: body.name,
        channel: body.channel ?? "sms",
        kind: body.kind ?? "promo",
        body: body.body,
        senderId: body.senderId ?? null,
        audience: body.audience ?? "all",
        audienceValue,
        scheduledAt,
        status: scheduledAt ? "scheduled" : "draft",
        totalCount: list.length,
      })
      .returning();

    return c.json({ campaign }, 201);
  })
  .delete("/campaigns/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    await db.delete(schema.messageCampaigns).where(eq(schema.messageCampaigns.id, id));
    return c.json({ ok: true }, 200);
  })

  // Fire a campaign now. Sends sequentially so the credit balance is checked
  // before every single message and a mid-run shortfall stops cleanly.
  .post("/campaigns/:id/send", async (c) => {
    const id = parseInt(c.req.param("id"));
    const [campaign] = await db
      .select()
      .from(schema.messageCampaigns)
      .where(eq(schema.messageCampaigns.id, id));
    if (!campaign) return c.json({ error: "Campaign not found" }, 404);
    if (campaign.status === "sending") return c.json({ error: "Campaign is already sending" }, 409);

    const auto = await getAutomation(campaign.branchId);
    const list = await resolveAudience(campaign.branchId, campaign.audience, campaign.audienceValue);

    await db
      .update(schema.messageCampaigns)
      .set({ status: "sending", totalCount: list.length, sentCount: 0, failedCount: 0 })
      .where(eq(schema.messageCampaigns.id, id));

    let sent = 0;
    let failed = 0;
    let stoppedReason: string | null = null;

    for (const cust of list) {
      const text = withSignature(renderTemplate(campaign.body, cust), auto[AUTOMATION_KEYS.signature]);
      const result = await sendMessage({
        branchId: campaign.branchId,
        body: text,
        channel: campaign.channel as Channel,
        kind: "campaign",
        customer: cust,
        senderId: campaign.senderId ?? undefined,
        campaignId: campaign.id,
      });

      if (result.status === "sent") sent++;
      else failed++;

      if (result.reason?.startsWith("Insufficient SMS credits")) {
        stoppedReason = result.reason;
        break;
      }
    }

    const [updated] = await db
      .update(schema.messageCampaigns)
      .set({
        status: stoppedReason ? "failed" : "sent",
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      })
      .where(eq(schema.messageCampaigns.id, id))
      .returning();

    return c.json({ campaign: updated, sent, failed, stoppedReason }, 200);
  });
