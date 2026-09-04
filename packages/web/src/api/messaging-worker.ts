/**
 * Messaging Worker — automated occasion wishes + scheduled campaigns.
 *
 * Runs as a background loop inside the Bun server, ticking every minute.
 *
 * Each tick, per branch:
 *   1. Fires any campaign whose scheduledAt has arrived.
 *   2. Once a day, at the branch's configured send time, sends birthday,
 *      wedding-anniversary and children's-birthday wishes to every customer
 *      whose date matches today.
 *
 * Safety rails:
 *   - A customer with autoWishes = false or smsOptOut = true is never sent to.
 *   - Before every send it checks message_log for an identical (customer, kind)
 *     entry today, so a server restart mid-run can't double-message anyone.
 *   - Credit checks live in sendMessage(); a shortfall stops the daily run
 *     instead of hammering the gateway with rejects.
 */

import { db } from "./database";
import * as schema from "./database/schema";
import { eq, and, gte, lte, isNotNull } from "drizzle-orm";
import {
  sendMessage,
  renderTemplate,
  resolveAudience,
  monthDay,
  type Channel,
  type MessageKind,
} from "./messaging-core";
import { AUTOMATION_KEYS, getAutomation, withSignature } from "./routes/messaging";

const INTERVAL_MS = 60_000; // 1 minute
const LAST_RUN_KEY = "msgAutoLastRunDate"; // YYYY-MM-DD of the last completed daily run

/** Built-in wording used when the branch has no active template for an occasion. */
const FALLBACK_TEMPLATES: Record<string, string> = {
  birthday: "Happy Birthday {first_name}! Wishing you a wonderful year ahead. Celebrate with us and enjoy a special treat on your visit.",
  anniversary: "Happy Wedding Anniversary {first_name}! Wishing you both many more happy years together. Celebrate with us!",
  child_birthday: "Happy Birthday to {child}! Wishing {first_name} and family a joyful celebration. Bring the little one over for a treat!",
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function parseTime(hhmm: string): number {
  const m = String(hhmm || "09:00").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 9 * 60;
  return Math.min(23, parseInt(m[1])) * 60 + Math.min(59, parseInt(m[2]));
}

async function readSetting(branchId: number, key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.branchSettings)
    .where(and(eq(schema.branchSettings.branchId, branchId), eq(schema.branchSettings.key, key)));
  return row?.value ?? "";
}

async function writeSetting(branchId: number, key: string, value: string): Promise<void> {
  const [row] = await db
    .select()
    .from(schema.branchSettings)
    .where(and(eq(schema.branchSettings.branchId, branchId), eq(schema.branchSettings.key, key)));
  if (row) {
    await db.update(schema.branchSettings).set({ value }).where(eq(schema.branchSettings.id, row.id));
  } else {
    await db.insert(schema.branchSettings).values({ branchId, key, value });
  }
}

/** Template body for an occasion, preferring the branch's own active template. */
async function templateFor(branchId: number, kind: string, channel: Channel): Promise<string> {
  const rows = await db
    .select()
    .from(schema.messageTemplates)
    .where(and(eq(schema.messageTemplates.branchId, branchId), eq(schema.messageTemplates.kind, kind)));

  const active = rows.filter((t) => t.isActive);
  const match = active.find((t) => t.channel === channel) ?? active[0];
  return match?.body ?? FALLBACK_TEMPLATES[kind] ?? "";
}

/** Has this customer already had this kind of message today? */
async function alreadySentToday(customerId: number, kind: string): Promise<boolean> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rows = await db
    .select()
    .from(schema.messageLog)
    .where(
      and(
        eq(schema.messageLog.customerId, customerId),
        eq(schema.messageLog.kind, kind),
        gte(schema.messageLog.createdAt, start),
      ),
    );

  return rows.some((r) => r.status === "sent");
}

// ── Daily occasion wishes ───────────────────────────────────────────────────

async function runDailyWishes(branchId: number, auto: Record<string, string>) {
  const channel = (auto[AUTOMATION_KEYS.channel] || "sms") as Channel;
  const senderId = auto[AUTOMATION_KEYS.senderId] || undefined;
  const signature = auto[AUTOMATION_KEYS.signature] || "";
  const today = monthDay(todayStr());

  const customers = await db.select().from(schema.customers).where(eq(schema.customers.branchId, branchId));

  type Job = { customer: any; kind: MessageKind; childName?: string };
  const jobs: Job[] = [];

  for (const cust of customers) {
    if (cust.smsOptOut || !cust.autoWishes) continue;

    if (auto[AUTOMATION_KEYS.birthday] === "1" && monthDay(cust.dob) === today) {
      jobs.push({ customer: cust, kind: "birthday" });
    }
    if (auto[AUTOMATION_KEYS.anniversary] === "1" && monthDay(cust.weddingAnniversary) === today) {
      jobs.push({ customer: cust, kind: "anniversary" });
    }
    if (auto[AUTOMATION_KEYS.childBirthday] === "1") {
      const children = [
        { name: cust.child1Name, dob: cust.child1Dob },
        { name: cust.child2Name, dob: cust.child2Dob },
        { name: cust.child3Name, dob: cust.child3Dob },
      ];
      for (const child of children) {
        if (monthDay(child.dob) === today) {
          jobs.push({ customer: cust, kind: "child_birthday", childName: child.name || "your little one" });
        }
      }
    }
  }

  if (jobs.length === 0) {
    console.log(`[messaging] branch ${branchId}: no occasions today`);
    return;
  }

  console.log(`[messaging] branch ${branchId}: ${jobs.length} occasion message(s) to send`);

  let sent = 0;
  for (const job of jobs) {
    if (await alreadySentToday(job.customer.id, job.kind)) continue;

    const template = await templateFor(branchId, job.kind, channel);
    if (!template) continue;

    const body = withSignature(
      renderTemplate(template, job.customer, job.childName ? { child: job.childName } : {}),
      signature,
    );

    const result = await sendMessage({
      branchId,
      body,
      channel,
      kind: job.kind,
      customer: job.customer,
      senderId,
    });

    if (result.status === "sent") sent++;

    // Out of credits — stop the run, the balance won't recover mid-loop.
    if (result.reason?.startsWith("Insufficient SMS credits")) {
      console.warn(`[messaging] branch ${branchId}: stopped — ${result.reason}`);
      break;
    }
  }

  console.log(`[messaging] branch ${branchId}: sent ${sent}/${jobs.length} occasion message(s)`);
}

// ── Scheduled campaigns ─────────────────────────────────────────────────────

async function runDueCampaigns(branchId: number) {
  const due = await db
    .select()
    .from(schema.messageCampaigns)
    .where(
      and(
        eq(schema.messageCampaigns.branchId, branchId),
        eq(schema.messageCampaigns.status, "scheduled"),
        isNotNull(schema.messageCampaigns.scheduledAt),
        lte(schema.messageCampaigns.scheduledAt, new Date()),
      ),
    );

  for (const campaign of due) {
    const auto = await getAutomation(branchId);
    const list = await resolveAudience(branchId, campaign.audience, campaign.audienceValue);

    await db
      .update(schema.messageCampaigns)
      .set({ status: "sending", totalCount: list.length, sentCount: 0, failedCount: 0 })
      .where(eq(schema.messageCampaigns.id, campaign.id));

    console.log(`[messaging] campaign "${campaign.name}" firing to ${list.length} customer(s)`);

    let sent = 0;
    let failed = 0;
    let stopped = false;

    for (const cust of list) {
      const body = withSignature(renderTemplate(campaign.body, cust), auto[AUTOMATION_KEYS.signature]);
      const result = await sendMessage({
        branchId,
        body,
        channel: campaign.channel as Channel,
        kind: "campaign",
        customer: cust,
        senderId: campaign.senderId ?? undefined,
        campaignId: campaign.id,
      });

      if (result.status === "sent") sent++;
      else failed++;

      if (result.reason?.startsWith("Insufficient SMS credits")) {
        stopped = true;
        console.warn(`[messaging] campaign ${campaign.id} stopped — ${result.reason}`);
        break;
      }
    }

    await db
      .update(schema.messageCampaigns)
      .set({
        status: stopped ? "failed" : "sent",
        sentCount: sent,
        failedCount: failed,
        completedAt: new Date(),
      })
      .where(eq(schema.messageCampaigns.id, campaign.id));
  }
}

// ── Worker loop ─────────────────────────────────────────────────────────────

async function tick() {
  const branches = await db.select().from(schema.branches);

  for (const branch of branches) {
    try {
      await runDueCampaigns(branch.id);

      const auto = await getAutomation(branch.id);
      if (auto[AUTOMATION_KEYS.enabled] !== "1") continue;

      // One daily run, at or after the configured time.
      if (nowMinutes() < parseTime(auto[AUTOMATION_KEYS.sendTime])) continue;
      if ((await readSetting(branch.id, LAST_RUN_KEY)) === todayStr()) continue;

      await writeSetting(branch.id, LAST_RUN_KEY, todayStr());
      await runDailyWishes(branch.id, auto);
    } catch (e: any) {
      console.error(`[messaging] branch ${branch.id} tick failed:`, e?.message ?? e);
    }
  }
}

export function runMessagingWorker() {
  console.log("[messaging] worker started (occasion wishes + scheduled campaigns)");
  tick().catch((e) => console.error("[messaging] first tick failed:", e?.message ?? e));
  setInterval(() => {
    tick().catch((e) => console.error("[messaging] tick failed:", e?.message ?? e));
  }, INTERVAL_MS);
}
