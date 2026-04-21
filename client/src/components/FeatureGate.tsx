/**
 * FeatureGate.tsx — Plan-based feature gating component.
 *
 * Usage:
 *   <FeatureGate feature="wealthManagement" requiredPlan="growth">
 *     <WealthManagementPage />
 *   </FeatureGate>
 *
 * If the user's current plan does not include the feature, a locked overlay
 * is shown with an upgrade CTA linking to /billing.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Crown, Sparkles, Star, Zap, ArrowRight, Loader2 } from "lucide-react";

export type FeatureFlag =
  | "reportsCenter"
  | "aiInsightsV2"
  | "wealthManagement"
  | "subscriptionBillingV2"
  | "digitalGold"
  | "nodalAccounts"
  | "salaryAccounts"
  | "internationalRemittance";

export type PlanKey = "free" | "starter" | "growth" | "enterprise";

const PLAN_ICONS: Record<PlanKey, React.ReactNode> = {
  free: <Zap className="w-5 h-5 text-slate-500" />,
  starter: <Star className="w-5 h-5 text-blue-500" />,
  growth: <Sparkles className="w-5 h-5 text-purple-500" />,
  enterprise: <Crown className="w-5 h-5 text-amber-500" />,
};

const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  starter: "Starter ($29/mo)",
  growth: "Growth ($79/mo)",
  enterprise: "Enterprise ($199/mo)",
};

const PLAN_COLORS: Record<PlanKey, string> = {
  free: "text-slate-600",
  starter: "text-blue-600",
  growth: "text-purple-600",
  enterprise: "text-amber-600",
};

interface FeatureGateProps {
  /** The feature flag to check */
  feature: FeatureFlag;
  /** Minimum plan required to access this feature */
  requiredPlan: PlanKey;
  /** Feature display name for the locked overlay */
  featureName?: string;
  /** Children to render when the feature is accessible */
  children: React.ReactNode;
  /** Optional: render a compact inline lock badge instead of a full overlay */
  inline?: boolean;
}

export function FeatureGate({
  feature,
  requiredPlan,
  featureName,
  children,
  inline = false,
}: FeatureGateProps) {
  const [, navigate] = useLocation();
  const { data: subscription, isLoading } = trpc.newFeatures.portalBilling.getSubscription.useQuery(
    undefined,
    { staleTime: 60_000 }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const featureFlags = subscription?.featureFlags as Record<FeatureFlag, boolean> | undefined;
  const hasAccess = featureFlags?.[feature] === true;

  if (hasAccess) {
    return <>{children}</>;
  }

  if (inline) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 ${PLAN_COLORS[requiredPlan]} cursor-pointer`}
        onClick={() => navigate("/billing")}
        title={`Requires ${PLAN_LABELS[requiredPlan]}`}
      >
        <Lock className="w-3 h-3" />
        {PLAN_LABELS[requiredPlan]}
      </span>
    );
  }

  return (
    <div className="relative min-h-[400px] flex items-center justify-center">
      {/* Blurred background preview */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none opacity-20 blur-sm">
        {children}
      </div>
      {/* Lock overlay */}
      <Card className="relative z-10 max-w-md w-full mx-4 shadow-xl border-2 border-amber-200 bg-white/95 backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
              <Lock className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900">
              {featureName ?? "Premium Feature"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              This feature requires the{" "}
              <span className={`font-semibold ${PLAN_COLORS[requiredPlan]}`}>
                {PLAN_LABELS[requiredPlan]}
              </span>{" "}
              plan or higher.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            {PLAN_ICONS[requiredPlan]}
            <span>
              Your current plan:{" "}
              <span className="font-medium text-slate-700 capitalize">
                {subscription?.plan ?? "Free"}
              </span>
            </span>
          </div>
          <Button
            className="w-full"
            onClick={() => navigate("/billing")}
          >
            Upgrade to {PLAN_LABELS[requiredPlan]}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground">
            Cancel anytime. No long-term commitment.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hook to check if a feature is accessible for the current user.
 * Returns { hasAccess, isLoading, currentPlan }.
 */
export function useFeatureAccess(feature: FeatureFlag) {
  const { data: subscription, isLoading } = trpc.newFeatures.portalBilling.getSubscription.useQuery(
    undefined,
    { staleTime: 60_000 }
  );
  const featureFlags = subscription?.featureFlags as Record<FeatureFlag, boolean> | undefined;
  const hasAccess = featureFlags?.[feature] === true;
  const currentPlan = (subscription?.plan ?? "free") as PlanKey;
  return { hasAccess, isLoading, currentPlan };
}
