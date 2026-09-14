import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId, getUser } from "../lib/store";
import { hasPrivilege, parsePrivileges, privilegeForPath } from "../lib/permissions";

const PUBLIC_PATHS = ["/", "/invoice/", "/menu"];

export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const user = getUser();
  const branchId = getBranchId();
  const isPublic = PUBLIC_PATHS.some(path => path === location || location.startsWith(path));
  const { data, isLoading } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
    enabled: Boolean(user) && !isPublic,
    staleTime: 30_000,
  });
  const privilege = privilegeForPath(location);
  const saved = parsePrivileges((data as any)?.settings?.userPrivileges);
  const allowed = isPublic || (Boolean(user) && (!privilege || hasPrivilege(user.role, privilege, saved)));

  useEffect(() => {
    if (!isLoading && !allowed && location !== "/") navigate(user ? "/home" : "/");
  }, [allowed, isLoading, location, navigate, user]);

  if (isLoading && Boolean(user) && !isPublic) return <div className="h-screen flex items-center justify-center text-sm">Checking access…</div>;
  if (!allowed && location !== "/") return <div className="h-screen flex items-center justify-center text-sm">You do not have permission to open this page.</div>;
  return <>{children}</>;
}
