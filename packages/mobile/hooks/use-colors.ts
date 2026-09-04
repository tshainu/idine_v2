import { Colors } from "../constants/theme";

// The waiter app is intentionally light-only: staff use it under bright dining-room
// lighting, and a single palette keeps table-status colours unambiguous.
export function useColors() {
  return Colors.light;
}

export type AppColors = ReturnType<typeof useColors>;
