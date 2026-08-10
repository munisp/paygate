/**
 * useTenant — reads the current user's tenant context.
 * Fetches tenant config via wave26.tenants.getConfig tRPC endpoint.
 *
 * Usage:
 *   const { tenant, loading, isBnplEnabled, isVirtualCardsEnabled } = useTenant();
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export function useTenant(tenantId?: string) {
  const { isAuthenticated } = useAuth();

  const { data, isLoading } = trpc.wave26.tenantManagement.getById.useQuery(
    { id: tenantId ?? "ten_default" },
    {
      enabled: isAuthenticated && !!tenantId,
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: false,
    }
  );

  return {
    tenant: data,
    loading: isLoading,
    tenantId: data?.id ?? tenantId ?? "ten_default",
    // Feature flags from tenant config
    isBnplEnabled: (data as any)?.bnplEnabled ?? false,
    isCrossBorderEnabled: (data as any)?.crossBorderEnabled ?? false,
    isVirtualCardsEnabled: (data as any)?.virtualCardsEnabled ?? false,
    plan: (data as any)?.plan ?? "starter",
  };
}
