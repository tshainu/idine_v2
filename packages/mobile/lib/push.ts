import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { http } from "./http";
import type { WaiterSession } from "./session";

// Channel settings are immutable after Android creates a channel. The v2 ID
// forces devices that previously created a silent kitchen-ready channel to get
// a fresh high-importance channel with sound and vibration enabled.
const CHANNEL_ID = "kitchen-ready-v3";

// Foreground uses the existing looping in-app alert. Background/terminated/locked
// states are handled by Android's system notification UI and sound channel.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerWaiterPush(session: WaiterSession) {
  if (Platform.OS !== "android" || !Device.isDevice) return null;

  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Kitchen ready alerts",
    importance: Notifications.AndroidImportance.MAX,
    sound: "ready_alert",
    vibrationPattern: [0, 700, 400],
    enableVibrate: true,
    enableLights: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });

  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) throw new Error("Expo project ID is not configured");

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await http.post("/push-tokens", {
    token,
    branchId: session.branchId,
    waiterId: session.id,
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? null,
  });
  return token;
}

export async function unregisterWaiterPush(token: string | null) {
  if (!token) return;
  await http.del("/push-tokens", { token }).catch(() => undefined);
}

export { CHANNEL_ID };
