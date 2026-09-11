import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { http } from "./http";
import type { WaiterSession } from "./session";

export const KITCHEN_READY_CHANNEL = "kitchen-ready";

// Foreground alerts continue to use the existing full-screen ringing provider.
// Background/closed alerts are rendered by Android as a high-priority notification.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function configureKitchenReadyNotifications() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(KITCHEN_READY_CHANNEL, {
      name: "Kitchen ready orders",
      description: "Alerts when the kitchen finishes a waiter order.",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 400],
      sound: "ready_alert",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

export async function registerKitchenReadyNotifications(session: WaiterSession) {
  if (Platform.OS === "web" || !Device.isDevice) return;

  await configureKitchenReadyNotifications();
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  const projectId =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants.easConfig as any)?.projectId;
  if (!projectId) return;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await http.post("/device-tokens", {
    userId: session.id,
    branchId: session.branchId,
    token,
    platform: Platform.OS,
  });
}

export function subscribeToKitchenReadyNotificationTap(onOpen: () => void) {
  return Notifications.addNotificationResponseReceivedListener(() => onOpen());
}
