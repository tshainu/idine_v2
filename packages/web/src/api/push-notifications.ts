import { and, eq, isNull } from "drizzle-orm";
import { db } from "./database";
import * as schema from "./database/schema";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function notifyKitchenReady(order: {
  id: number;
  branchId: number | null;
  orderNumber: string;
  tableId: number | null;
}) {
  try {
    const deviceRows = await db
      .select({ token: schema.deviceTokens.token })
      .from(schema.deviceTokens)
      .where(and(
        eq(schema.deviceTokens.isActive, true),
        order.branchId === null
          ? isNull(schema.deviceTokens.branchId)
          : eq(schema.deviceTokens.branchId, order.branchId),
      ));
    const waiterRows = await db
      .select({ token: schema.waiterPushTokens.token })
      .from(schema.waiterPushTokens)
      .where(order.branchId === null
        ? isNull(schema.waiterPushTokens.branchId)
        : eq(schema.waiterPushTokens.branchId, order.branchId));
    const kdsRows = await db
      .select({ token: schema.kdsPushTokens.token })
      .from(schema.kdsPushTokens)
      .where(and(
        eq(schema.kdsPushTokens.isActive, true),
        order.branchId === null
          ? isNull(schema.kdsPushTokens.branchId)
          : eq(schema.kdsPushTokens.branchId, order.branchId),
      ));
    const tokens = [...new Set([
      ...deviceRows.map((row) => row.token),
      ...waiterRows.map((row) => row.token),
      ...kdsRows.map((row) => row.token),
    ].filter(Boolean))];
    if (!tokens.length) return;

    const messages = tokens.map((to) => ({
      to,
      title: `Kitchen order ready · Table ${order.tableId ?? "—"}`,
      body: `Table ${order.tableId ?? "—"} · ${order.orderNumber} is ready for pickup`,
      sound: "ready_alert",
      channelId: "kitchen-ready-v3",
      priority: "high",
      _contentAvailable: true,
      data: {
        type: "kitchen-ready",
        screen: "ready-items",
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableId: order.tableId,
      },
    }));

    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        console.error("Expo push notification failed", response.status, await response.text());
        return;
      }

      const result = await response.json() as {
        data?: Array<{ status?: string; details?: { error?: string } }>;
      };
      const invalidTokens = result.data
        ?.map((receipt, index) => receipt.details?.error === "DeviceNotRegistered" ? tokens[i + index] : null)
        .filter((token): token is string => !!token) ?? [];
      for (const token of invalidTokens) {
        await db.update(schema.deviceTokens)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(schema.deviceTokens.token, token));
      }
    }
  } catch (error) {
    // A push outage must never prevent the KDS from marking an order ready.
    console.error("Kitchen-ready push notification error", error);
  }
}

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && /^(ExpoPushToken|ExponentPushToken)\[.+\]$/.test(value);
}

export const sendKitchenReadyPush = notifyKitchenReady;

export type ReadyOrderNotification = Parameters<typeof notifyKitchenReady>[0];
