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
    const tokens = await db
      .select({ token: schema.deviceTokens.token })
      .from(schema.deviceTokens)
      .where(and(
        eq(schema.deviceTokens.isActive, true),
        order.branchId === null
          ? isNull(schema.deviceTokens.branchId)
          : eq(schema.deviceTokens.branchId, order.branchId),
      ));

    if (!tokens.length) return;
    const messages = tokens.map(({ token }) => ({
      to: token,
      title: `Kitchen order ready · Table ${order.tableId ?? "—"}`,
      body: `Table ${order.tableId ?? "—"} · ${order.orderNumber} is ready for pickup`,
      sound: "default",
      channelId: "kitchen-ready",
      priority: "high",
      data: {
        type: "kitchen-ready",
        orderId: order.id,
        orderNumber: order.orderNumber,
        tableId: order.tableId,
      },
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.error("Expo push notification failed", response.status, await response.text());
      return;
    }

    const result = await response.json() as {
      data?: Array<{ status?: string; details?: { error?: string } }>;
    };
    const invalidTokens = result.data
      ?.map((receipt, index) => receipt.details?.error === "DeviceNotRegistered" ? tokens[index]?.token : null)
      .filter((token): token is string => !!token) ?? [];
    for (const token of invalidTokens) {
      await db.update(schema.deviceTokens)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.deviceTokens.token, token));
    }
  } catch (error) {
    // A push outage must never prevent the KDS from marking an order ready.
    console.error("Kitchen-ready push notification error", error);
  }
}
