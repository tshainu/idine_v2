// iDine Waiter — light & clean theme, Manjal yellow accent.
// Every screen reads from here, so one edit restyles the whole app.

export const Colors = {
  light: {
    background: "#F7F7F8",
    card: "#FFFFFF",
    cardAlt: "#FBFBFC",
    foreground: "#15161A",
    muted: "#6B7280",
    mutedSoft: "#9CA3AF",
    border: "#E8E9ED",
    primary: "#F2B705", // Manjal yellow
    primaryDark: "#C99400",
    primarySoft: "#FEF6DC",
    onPrimary: "#1A1400",
    success: "#129D6B",
    successSoft: "#E4F7EF",
    warning: "#E8890C",
    warningSoft: "#FDF0DC",
    destructive: "#DC3545",
    destructiveSoft: "#FCE8EA",
    info: "#2B6CB0",
    infoSoft: "#E6EFF9",
  },
};

export const Colors_dark = Colors.light; // app is light-only by design (bright dining rooms)

export const Fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
};

export const Radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Soft shadow used on every card. Cross-platform (elevation on Android, shadow* on iOS/web).
export const Shadow = {
  card: {
    shadowColor: "#0B1020",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0B1020",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
};

// Table status → colour token mapping, shared by the floor view and dashboard.
export const TableStatus = {
  available: { label: "Free", fg: "#129D6B", bg: "#E4F7EF", border: "#BCEBD8" },
  occupied: { label: "Occupied", fg: "#C99400", bg: "#FEF6DC", border: "#F5DFA0" },
  billed: { label: "Billed", fg: "#2B6CB0", bg: "#E6EFF9", border: "#C2D9F0" },
  reserved: { label: "Reserved", fg: "#6B7280", bg: "#F1F2F4", border: "#DEE0E5" },
} as const;

export type TableStatusKey = keyof typeof TableStatus;
