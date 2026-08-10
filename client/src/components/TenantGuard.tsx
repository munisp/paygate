/**
 * TenantGuard — blocks access to a page/section if a tenant feature is disabled.
 *
 * Usage:
 *   <TenantGuard feature="bnpl" tenantId={tenantId}>
 *     <BNPLPage />
 *   </TenantGuard>
 *
 *   <TenantGuard feature="virtual_cards" fallback={<UpgradePlanPrompt />}>
 *     <VirtualCardsPage />
 *   </TenantGuard>
 */
import React from "react";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TenantGuardProps {
  /** Feature flag key to evaluate */
  feature: string;
  /** Merchant ID for scoped evaluation (optional) */
  merchantId?: string;
  /** Content to show when feature is enabled */
  children: React.ReactNode;
  /** Custom fallback when feature is disabled (optional) */
  fallback?: React.ReactNode;
}

function DefaultFallback({ feature }: { feature: string }) {
  return (
    <div className="flex items-center justify-center min-h-[300px] p-8">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <CardTitle className="text-lg">Feature Not Available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The <strong>{feature.replace(/_/g, " ")}</strong> feature is not enabled for your
            current plan or tenant configuration.
          </p>
          <p className="text-sm text-muted-foreground">
            Contact your administrator or upgrade your plan to unlock this feature.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function TenantGuard({
  feature,
  merchantId,
  children,
  fallback,
}: TenantGuardProps) {
  const { enabled, loading } = useFeatureFlag(feature, merchantId);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!enabled) {
    return <>{fallback ?? <DefaultFallback feature={feature} />}</>;
  }

  return <>{children}</>;
}

export default TenantGuard;
