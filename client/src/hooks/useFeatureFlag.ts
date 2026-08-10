/**
 * useFeatureFlag — evaluates a feature flag for the current user/merchant context.
 * Uses wave26.featureFlags.evaluate tRPC endpoint with deterministic hash-based rollout.
 *
 * Usage:
 *   const { enabled, loading } = useFeatureFlag("bnpl_v2");
 *   const { enabled: bulkEnabled } = useFeatureFlags(["bnpl_v2", "virtual_cards_v3"]);
 */
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";

export function useFeatureFlag(key: string, merchantId?: string) {
  const { user } = useAuth();
  const { data, isLoading } = trpc.wave26.featureFlags.evaluate.useQuery(
    {
      key,
      userId: user?.openId,
      merchantId,
    },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: false,
    }
  );
  return {
    enabled: data?.enabled ?? false,
    reason: data?.reason,
    loading: isLoading,
  };
}

export function useFeatureFlags(keys: string[], merchantId?: string) {
  const { user } = useAuth();
  const { data, isLoading } = trpc.wave26.featureFlags.bulkEvaluate.useQuery(
    {
      keys,
      userId: user?.openId,
      merchantId,
    },
    {
      staleTime: 5 * 60 * 1000,
      retry: false,
    }
  );
  return {
    flags: data ?? {},
    loading: isLoading,
    isEnabled: (key: string) => (data ?? {})[key] ?? false,
  };
}
