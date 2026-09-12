import { and, desc, eq } from "drizzle-orm";
import { db } from "./database";
import * as schema from "./database/schema";
import { getAutomation } from "./routes/messaging";
import { renderTemplate, sendMessage } from "./messaging-core";

type SalesKind = "new_customer" | "first_bill" | "thank_you_visit";

async function activeTemplate(branchId: number, kind: SalesKind) {
  const [template] = await db.select().from(schema.messageTemplates)
    .where(and(eq(schema.messageTemplates.branchId, branchId), eq(schema.messageTemplates.kind, kind), eq(schema.messageTemplates.isActive, true)))
    .orderBy(desc(schema.messageTemplates.id)).limit(1);
  return template;
}

/** Fire-and-forget sales automation. No SMS is sent unless an active template exists. */
export async function sendSalesTemplate(input: {
  branchId: number | null;
  customer: any | null;
  kind: SalesKind;
  order?: any;
  firstBill?: boolean;
}) {
  if (!input.branchId || !input.customer?.phone || input.customer.smsOptOut) return;
  const template = await activeTemplate(input.branchId, input.kind);
  if (!template) return;

  // A first-bill template is strictly one-time per customer.
  if (input.kind === "first_bill") {
    const [previous] = await db.select({ id: schema.messageLog.id }).from(schema.messageLog)
      .where(and(eq(schema.messageLog.branchId, input.branchId), eq(schema.messageLog.customerId, input.customer.id), eq(schema.messageLog.kind, input.kind))).limit(1);
    if (previous) return;
  }

  const order = input.order ?? {};
  const recipient = {
    ...input.customer,
    order_number: order.orderNumber ?? "",
    total: order.total ?? "",
  };
  const automation = await getAutomation(input.branchId);
  const body = renderTemplate(template.body, recipient);
  await sendMessage({
    branchId: input.branchId,
    body: `${body}${automation.msgSignature && !body.includes(automation.msgSignature) ? `\n${automation.msgSignature}` : ""}`,
    channel: template.channel as "sms" | "whatsapp",
    kind: input.kind as any,
    customer: input.customer,
    senderId: automation.msgAutoSenderId || undefined,
  });
}

export function triggerSalesTemplate(input: Parameters<typeof sendSalesTemplate>[0]) {
  void sendSalesTemplate(input).catch((error) => console.error("[sales-messaging]", error));
}
