/**
 * Billing.tsx — Portal Subscription Management
 * Displays current plan, available plans, and Stripe checkout/portal links.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CreditCard, Star, Zap, Building2, CheckCircle2, ArrowUpRight,
  Settings, AlertCircle, Crown, Sparkles, ExternalLink, Clock,
} from "lucide-react";

const PLAN_ICONS: Record<string, React.ReactNode> = {
  free: <Zap className="w-5 h-5 text-slate-500" />,
  starter: <Star className="w-5 h-5 text-blue-500" />,
  growth: <Sparkles className="w-5 h-5 text-purple-500" />,
  enterprise: <Crown className="w-5 h-5 text-amber-500" />,
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-slate-200 bg-slate-50",
  starter: "border-blue-200 bg-blue-50",
  growth: "border-purple-200 bg-purple-50",
  enterprise: "border-amber-200 bg-amber-50",
};

const PLAN_BADGE_COLORS: Record<string, string> = {
  free: "bg-slate-100 text-slate-700",
  starter: "bg-blue-100 text-blue-700",
  growth: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

export default function Billing() {
  const [, navigate] = useLocation();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const { data: subscription, isLoading } = trpc.newFeatures.portalBilling.getSubscription.useQuery();
  const { data: plans } = trpc.newFeatures.portalBilling.listPlans.useQuery();

  const checkoutMutation = trpc.newFeatures.portalBilling.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, "_blank");
        toast.success("Redirecting to Stripe checkout…");
      }
      setUpgradingPlan(null);
    },
    onError: (err) => {
      toast.error(err.message);
      setUpgradingPlan(null);
    },
  });

  const portalMutation = trpc.newFeatures.portalBilling.createPortalSession.useMutation({
    onSuccess: (data) => {
      if (data.url) window.open(data.url, "_blank");
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.newFeatures.portalBilling.cancelSubscription.useMutation({
    onSuccess: () => toast.success("Subscription will cancel at period end."),
    onError: (err) => toast.error(err.message),
  });

  const handleUpgrade = (planKey: string) => {
    setUpgradingPlan(planKey);
    checkoutMutation.mutate({ planKey: planKey as any, origin: window.location.origin });
  };

  const currentPlan = subscription?.plan ?? "free";

  // Stripe key mode — shows claim banner when in test/unconfigured mode
  const { data: stripeMode } = trpc.stripe.getKeyMode.useQuery(undefined, { staleTime: 300_000 });
  const sandboxClaimUrl = stripeMode?.sandboxClaimUrl;
  const sandboxExpiry = stripeMode?.sandboxExpiry ? new Date(stripeMode.sandboxExpiry) : null;
  const daysUntilExpiry = sandboxExpiry
    ? Math.ceil((sandboxExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const isTestMode = stripeMode?.mode === 'test' || stripeMode?.mode === 'unconfigured';

  // Check for success/cancel query params
  const searchParams = new URLSearchParams(window.location.search);
  const isSuccess = searchParams.get("success") === "1";
  const isCancelled = searchParams.get("cancelled") === "1";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" role="main" aria-label="Billing and subscription management">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your PayGate portal subscription and feature access.
          </p>
        </div>
        {currentPlan !== "free" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => portalMutation.mutate({ origin: window.location.origin })}
            disabled={portalMutation.isPending}
          >
            <Settings className="w-4 h-4 mr-2" />
            Manage Billing
          </Button>
        )}
      </div>

      {/* Stripe Sandbox Claim Banner */}
      {isTestMode && sandboxClaimUrl && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-300 rounded-lg">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              Claim Your Stripe Test Sandbox
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your Stripe sandbox is provisioned and ready. Claim it to activate test payments.
              {daysUntilExpiry !== null && daysUntilExpiry > 0 && (
                <span className="ml-1 font-medium">Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}.</span>
              )}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                onClick={() => window.open(sandboxClaimUrl, '_blank')}
              >
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Claim Sandbox
              </Button>
              <span className="text-xs text-amber-600">
                Use card{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">4242 4242 4242 4242</code>{' '}
                for testing
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Success / Cancel banners */}
      {isSuccess && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            Subscription activated! Your new features are now available.
          </span>
        </div>
      )}
      {isCancelled && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            Checkout was cancelled. Your current plan remains unchanged.
          </span>
        </div>
      )}

      {/* Current Plan Card */}
      <Card className={`border-2 ${PLAN_COLORS[currentPlan] ?? "border-slate-200"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {PLAN_ICONS[currentPlan]}
              <div>
                <CardTitle className="text-lg">Current Plan</CardTitle>
                <CardDescription>Your active portal subscription</CardDescription>
              </div>
            </div>
            <Badge className={PLAN_BADGE_COLORS[currentPlan] ?? ""}>
              {isLoading ? "Loading…" : (subscription?.planDetails?.name ?? "Free")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-16 bg-muted animate-pulse rounded" />
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="w-4 h-4" />
                {currentPlan === "free"
                  ? "Free plan — no payment required"
                  : subscription?.cancelAtPeriodEnd
                  ? `Cancels on ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "period end"}`
                  : `Renews on ${subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—"}`}
              </div>
              <div className="flex flex-wrap gap-2">
                {subscription?.planDetails?.features?.map((f: string) => (
                  <div key={f} className="flex items-center gap-1.5 text-xs text-foreground">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    {f}
                  </div>
                ))}
              </div>
              {currentPlan !== "free" && !subscription?.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive mt-2"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  Cancel subscription
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(plans ?? []).map((plan: any) => {
            const isCurrent = plan.key === currentPlan;
            const isDowngrade = ["free", "starter", "growth", "enterprise"].indexOf(plan.key) <
              ["free", "starter", "growth", "enterprise"].indexOf(currentPlan);

            return (
              <Card
                key={plan.key}
                className={`relative flex flex-col ${isCurrent ? "ring-2 ring-primary" : ""} ${plan.key === "growth" ? "shadow-lg" : ""}`}
              >
                {plan.key === "growth" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white text-xs px-3">Most Popular</Badge>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    {PLAN_ICONS[plan.key]}
                    <CardTitle className="text-base">{plan.name}</CardTitle>
                  </div>
                  <div className="text-2xl font-bold">
                    {plan.priceUSD === 0 ? "Free" : `$${plan.priceUSD}`}
                    {plan.priceUSD > 0 && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col flex-1">
                  <ul className="space-y-1.5 flex-1 mb-4">
                    {plan.features.map((f: string) => (
                      <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Separator className="mb-4" />
                  {isCurrent ? (
                    <Button variant="outline" size="sm" disabled className="w-full">
                      Current Plan
                    </Button>
                  ) : isDowngrade || plan.key === "free" ? (
                    <Button variant="ghost" size="sm" disabled className="w-full text-muted-foreground">
                      Downgrade
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={upgradingPlan === plan.key || checkoutMutation.isPending}
                    >
                      {upgradingPlan === plan.key ? "Opening checkout…" : "Upgrade"}
                      <ArrowUpRight className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Feature Access Matrix — dynamic from listPlans API */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Feature Access by Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">Feature</th>
                  {(plans ?? []).map((p: any) => (
                    <th key={p.key} className="text-center py-2 px-3 font-medium">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Always-available core features */}
                {[
                  { name: "Dashboard & Analytics" },
                  { name: "Transactions & Payouts" },
                  { name: "Payment Links & Webhooks" },
                  { name: "Virtual Cards" },
                  { name: "Customer Management" },
                ].map((row) => (
                  <tr key={row.name} className="hover:bg-muted/30">
                    <td className="py-2 pr-4 text-foreground">{row.name}</td>
                    {(plans ?? []).map((p: any) => (
                      <td key={p.key} className="text-center py-2 px-3">
                        <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Feature-flag gated features */}
                {[
                  { name: "Reports Center", flag: "reportsCenter" },
                  { name: "AI Insights V2", flag: "aiInsightsV2" },
                  { name: "Wealth Management", flag: "wealthManagement" },
                  { name: "Subscription Billing V2", flag: "subscriptionBillingV2" },
                  { name: "Digital Gold & Mutual Funds", flag: "digitalGold" },
                  { name: "International Remittance", flag: "internationalRemittance" },
                  { name: "Nodal Accounts", flag: "nodalAccounts" },
                  { name: "Salary Accounts", flag: "salaryAccounts" },
                ].map((row) => (
                  <tr key={row.name} className="hover:bg-muted/30">
                    <td className="py-2 pr-4 text-foreground">{row.name}</td>
                    {(plans ?? []).map((p: any) => (
                      <td key={p.key} className="text-center py-2 px-3">
                        {p.featureFlags?.[row.flag] ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Test card info */}
      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
        <strong>Testing:</strong> Use card <code className="font-mono bg-background px-1 rounded">4242 4242 4242 4242</code>, any future expiry, any CVC.
        Live keys can be configured in Settings → Payment once Stripe KYC is complete.
      </div>
    </div>
  );
}
