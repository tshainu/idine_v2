import { useQuery } from "@tanstack/react-query";
import { http, API_BASE } from "../lib/http";
import type { Category, MenuItem, Modifier } from "../lib/types";

// The menu barely changes during a shift, so cache it hard — the order screen must
// open instantly even on flaky restaurant wifi.
const MENU_CACHE = { staleTime: 10 * 60_000, gcTime: 60 * 60_000, refetchOnMount: false } as const;

export function useCategories(branchId: number | undefined) {
  return useQuery({
    queryKey: ["categories", branchId],
    enabled: !!branchId,
    ...MENU_CACHE,
    queryFn: async () => {
      const data = await http.get<{ categories: Category[] }>("/categories", { branchId });
      return (data.categories ?? [])
        .filter((x) => x.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
  });
}

export function useMenuItems(branchId: number | undefined) {
  return useQuery({
    queryKey: ["menu-items", branchId],
    enabled: !!branchId,
    ...MENU_CACHE,
    queryFn: async () => {
      const data = await http.get<{ menuItems: MenuItem[] }>("/menu-items", { branchId });
      return (data.menuItems ?? [])
        .filter((x) => x.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    },
  });
}

export function useModifiers(branchId: number | undefined) {
  return useQuery({
    queryKey: ["modifiers", branchId],
    enabled: !!branchId,
    ...MENU_CACHE,
    queryFn: async () => {
      const data = await http.get<{ modifiers: Modifier[] }>("/modifiers", { branchId });
      return (data.modifiers ?? []).filter((m) => m.isActive);
    },
  });
}

// Dish photos are served from the same host as the API (/menu/manjal/MJ001.jpg).
export function imageUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  return `${API_BASE}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
}
