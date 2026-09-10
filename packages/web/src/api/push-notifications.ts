import * as schema from "./database/schema";
import { db } from "./database";
import { eq } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ReadyOrderNotification = {
  id: number;
  branchId: number | null;
  orderNumber: string;
  tableId: number | null;
  type: string;
};

/**
 * Sends a high-priority Expo push notification to every waiter device registered
 * for the order's branch. The in-app polling alert remains the foreground fallback.
 */
export async function sendKitchenReadyPush(order: ReadyOrderNotification) {
  if (!order.branchId) return;

  const rows = await db
    .select({ token: schema.waiterPushTokens.token })
    .from(schema.waiterPushTokens)
    .where(eq(schema.waiterPushTokens.branchId, order.branchId));
  const tokens = [...new Set(rows.map((row) => row.token).filter(Boolean))];
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    title: "Order ready for pickup",
    body: `${order.orderNumber} is ready for pickup`,
    sound: "ready_alert",
    priority: "high",
    channelId: "kitchen-ready",
    data: {
      screen: "ready-items",
      orderId: order.id,
      orderNumber: order.orderNumber,
      tableId: order.tableId,
    },
  }));

  // Expo accepts up to 100 messages per request. Branches normally have far
  // fewer devices, but batching keeps this safe as the restaurant grows.
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Expo push failed (${response.status}): ${text.slice(0, 300)}`);
    }
  }
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^(ExpoPushToken|ExponentPushToken)\[.+\]$/.test(value);
}
