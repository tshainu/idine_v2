// Shared 4-digit keypad used by both the PIN setup and PIN unlock screens.
// Big targets (72pt) so it works one-handed while carrying a tray.
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Fonts, Radius, Shadow, Space } from "../constants/theme";

const c = Colors.light;

export const PIN_LENGTH = 4;

export function PinDots({ filled, error }: { filled: number; error?: boolean }) {
  return (
    <View style={s.dots}>
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const on = i < filled;
        return (
          <View
            key={i}
            style={[
              s.dot,
              on && { backgroundColor: c.foreground, borderColor: c.foreground },
              error && { backgroundColor: c.destructiveSoft, borderColor: c.destructive },
            ]}
          />
        );
      })}
    </View>
  );
}

export function PinPad({
  onDigit,
  onBackspace,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <View style={s.pad}>
      {keys.map((k, i) => {
        if (k === "") return <View key={i} style={s.key} />;
        const isBack = k === "back";
        return (
          <TouchableOpacity
            key={i}
            style={[s.key, !isBack && s.keyFilled]}
            activeOpacity={0.6}
            disabled={disabled}
            onPress={() => (isBack ? onBackspace() : onDigit(k))}
          >
            {isBack ? (
              <Ionicons name="backspace-outline" size={24} color={c.muted} />
            ) : (
              <Text style={s.keyText}>{k}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: "row", gap: Space.lg, justifyContent: "center" },
  dot: {
    width: 16, height: 16, borderRadius: Radius.pill,
    borderWidth: 1.5, borderColor: c.border, backgroundColor: "transparent",
  },
  pad: {
    flexDirection: "row", flexWrap: "wrap",
    justifyContent: "center", gap: Space.lg,
    maxWidth: 300, alignSelf: "center",
  },
  key: { width: 72, height: 72, borderRadius: Radius.pill, alignItems: "center", justifyContent: "center" },
  keyFilled: {
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border, ...Shadow.card,
  },
  keyText: { fontFamily: Fonts.semibold, fontSize: 24, color: c.foreground },
});
