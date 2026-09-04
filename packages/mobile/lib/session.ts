// Session + 4-digit PIN for the waiter app.
//
// Flow: full login (User ID + username + password) once per device → session stored →
// waiter sets a 4-digit PIN → afterwards the app only asks for the PIN on relaunch and
// after it has been backgrounded, so re-entry mid-shift is one-handed and instant.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WaiterSession = {
  id: number;
  name: string;
  role: string;
  branchId: number;
  userId: string | null;   // business id, e.g. PUM9211
  username: string | null;
};

const SESSION_KEY = "waiter_session";
const PIN_KEY = "waiter_pin";
const LEGACY_USER_KEY = "waiter_user"; // written by the previous app version

export async function saveSession(s: WaiterSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export async function loadSession(): Promise<WaiterSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as WaiterSession;

    // Migrate a session written by the old build so existing devices don't get logged out.
    const legacy = await AsyncStorage.getItem(LEGACY_USER_KEY);
    if (!legacy) return null;
    const u = JSON.parse(legacy);
    const migrated: WaiterSession = {
      id: u.id,
      name: u.name,
      role: u.role ?? "waiter",
      branchId: u.branchId ?? 1,
      userId: u.userId ?? null,
      username: u.username ?? null,
    };
    await saveSession(migrated);
    return migrated;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await AsyncStorage.multiRemove([SESSION_KEY, PIN_KEY, LEGACY_USER_KEY]);
}

// ── PIN ───────────────────────────────────────────────────────────────────────
// The PIN is a local convenience lock, not an auth factor: it gates re-entry to an
// already-authenticated session on this device. The server password is never stored.

export async function setPin(pin: string) {
  await AsyncStorage.setItem(PIN_KEY, pin);
}

export async function hasPin(): Promise<boolean> {
  return (await AsyncStorage.getItem(PIN_KEY)) !== null;
}

export async function verifyPin(pin: string): Promise<boolean> {
  const saved = await AsyncStorage.getItem(PIN_KEY);
  return saved !== null && saved === pin;
}

export async function clearPin() {
  await AsyncStorage.removeItem(PIN_KEY);
}
