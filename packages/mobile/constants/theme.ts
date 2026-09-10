// Axis Waiter — modern service-floor theme.
// Deep navy chrome keeps the top and bottom navigation readable in busy dining rooms,
// while teal actions and warm surfaces keep the order flow fast to scan.

export const Colors = {
  light: {
    background: "#F3F6FA",
    card: "#FFFFFF",
    cardAlt: "#F8FAFC",
    foreground: "#122033",
    muted: "#607087",
    mutedSoft: "#93A0B2",
    border: "#DCE4EE",
    primary: "#19B796",
    primaryDark: "#087F6C",
    primarySoft: "#DDF8F1",
    onPrimary: "#062A23",
    success: "#159A63",
    successSoft: "#E2F7EC",
    warning: "#D98218",
    warningSoft: "#FFF1DA",
    destructive: "#D64550",
    destructiveSoft: "#FCE9EC",
    info: "#3579C7",
    infoSoft: "#E7F0FB",
    chrome: "#122033",
    chromeSoft: "#1D3048",
    onChrome: "#F7FBFF",
    chromeMuted: "#AFC0D4",
  },
};

export const Colors_dark = Colors.light;

export const Fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
};

export const Radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const Shadow = {
  card: {
    shadowColor: "#122033",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  raised: {
    shadowColor: "#122033",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
    elevation: 6,
  },
};

export const TableStatus = {
  available: { label: "Free", fg: "#159A63", bg: "#E2F7EC", border: "#BEEBD2" },
  occupied: { label: "Occupied", fg: "#D64550", bg: "#FCE9EC", border: "#F2BFC6" },
  billed: { label: "Billed", fg: "#B7791F", bg: "#FFF4CC", border: "#F1D58A" },
  reserved: { label: "Reserved", fg: "#3579C7", bg: "#E7F0FB", border: "#C6DCF6" },
} as const;

export type TableStatusKey = keyof typeof TableStatus;
