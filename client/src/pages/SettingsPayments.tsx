/**
 * /settings/payments — Stripe Payment Configuration & Go-Live Checklist
 *
 * Embeds the full go-live checklist (trpc.system.goLiveChecklist) alongside
 * a live Stripe key-mode indicator and a one-click test charge button.
 * Accessible from Settings sidebar and from the Billing page banner.
 */
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Info,
  RefreshCw,
  Rocket,
  ShieldCheck,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ── Status helpers ────────────────────────────────────────────────────────────
type CheckStatus = "ok" | "pending" | "warning" | "info";

const STATUS_CONFIG: Record<
  CheckStatus,
  { icon: React.ReactNode; badge: string; badgeClass: string }
> = {
  ok: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
    badge: "Complete",
    badgeClass: "bg-green-100 text-green-800 border-green-200",
  },
  pending: {
    icon: <XCircle className="h-5 w-5 text-red-400" />,
    badge: "Pending",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
    badge: "Warning",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
  },
  info: {
    icon: <Info className="h-5 w-5 text-blue-400" />,
    badge: "Recommended",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
};

// ── Stripe mode badge ─────────────────────────────────────────────────────────
function StripeModeChip({ mode }: { mode: string }) {
  if (mode === "live")
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 font-medium">
        <ShieldCheck className="h-3 w-3 mr-1" /> Live Mode
      </Badge>
    );
  if (mode === "test")
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-medium">
        <Zap className="h-3 w-3 mr-1" /> Test Mode
      </Badge>
    );
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 font-medium">
      <XCircle className="h-3 w-3 mr-1" /> Not Configured
    </Badge>
  );
}

// ── Sandbox expiry countdown ──────────────────────────────────────────────────
function SandboxCountdown({ expiry }: { expiry: string }) {
  const expiryDate = new Date(expiry);
  const daysLeft = Math.ceil(
    (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const isUrgent = daysLeft <= 14;
  return (
    <span
      className={`text-xs font-medium ${isUrgent ? "text-red-600" : "text-amber-600"}`}
    >
      <Clock className="h-3 w-3 inline mr-1" />
      Sandbox expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""} (
      {expiryDate.toLocaleDateString()})
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettingsPayments() {
  const [testChargeResult, setTestChargeResult] = useState<{
    ok: boolean;
    intentId?: string;
    status?: string;
  } | null>(null);

  // Key mode
  const {
    data: stripeMode,
    isLoading: modeLoading,
    refetch: refetchMode,
  } = trpc.stripe.getKeyMode.useQuery(undefined, { staleTime: 30_000 });

  // Go-live checklist
  const {
    data: checklistData,
    isLoading: checklistLoading,
    refetch: refetchChecklist,
  } = trpc.system.goLiveChecklist.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  // Test charge
  const testChargeMutation = trpc.stripe.testCharge.useMutation({
    onSuccess: (data) => {
      setTestChargeResult(data);
      toast.success(`Test charge created — Intent ${data.intentId} (${data.status})`);
      refetchChecklist();
    },
    onError: (err) => {
      toast.error(`Test charge failed: ${err.message}`);
    },
  });

  const items = checklistData?.items ?? [];
  const okCount = items.filter((i: any) => i.status === "ok").length;
  const blockers = items.filter((i: any) => i.status === "pending").length;
  const nonInfoItems = items.filter((i: any) => i.status !== "info").length;
  const progress =
    nonInfoItems > 0 ? Math.round((okCount / nonInfoItems) * 100) : 0;
  const isReadyToLaunch = blockers === 0;

  const mode = stripeMode?.mode ?? "unconfigured";
  const sandboxClaimUrl =
    (stripeMode as any)?.sandboxClaimUrl ??
    "https://dashboard.stripe.com/claim_sandbox/YWNjdF8xVEFBTkRSaTdHR0FyY3hXLDE3NzM5MzcwNjcv100Ox49WXeJ";
  const sandboxExpiry =
    (stripeMode as any)?.sandboxExpiry ?? "2026-05-11T16:17:47.000Z";

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Payment Configuration
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure Stripe, run test charges, and track your production go-live
            readiness.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchMode();
            refetchChecklist();
          }}
          disabled={modeLoading || checklistLoading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${modeLoading || checklistLoading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* ── Stripe key status card ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Stripe Integration Status</CardTitle>
            {!modeLoading && <StripeModeChip mode={mode} />}
          </div>
          <CardDescription>
            Current Stripe key mode detected from your environment secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {modeLoading ? (
            <div className="h-8 bg-muted animate-pulse rounded" />
          ) : (
            <>
              {/* Sandbox claim banner */}
              {mode !== "live" && (
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Clock className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Claim your Stripe test sandbox
                    </p>
                    <SandboxCountdown expiry={sandboxExpiry} />
                    <div className="flex items-center gap-3 mt-2">
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white h-7 text-xs"
                        onClick={() => window.open(sandboxClaimUrl, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3 mr-1.5" />
                        Claim Sandbox
                      </Button>
                      <span className="text-xs text-amber-600">
                        Test card:{" "}
                        <code className="font-mono bg-amber-100 px-1 rounded">
                          4242 4242 4242 4242
                        </code>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Live mode success */}
              {mode === "live" && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 text-sm">
                    Live Stripe keys are active. Real payments are enabled.
                  </AlertDescription>
                </Alert>
              )}

              {/* Test charge button */}
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => testChargeMutation.mutate()}
                  disabled={testChargeMutation.isPending || mode === "unconfigured"}
                >
                  <Zap
                    className={`h-4 w-4 mr-2 ${testChargeMutation.isPending ? "animate-pulse" : ""}`}
                  />
                  {testChargeMutation.isPending ? "Running…" : "Run Test Charge (₦50)"}
                </Button>
                {testChargeResult?.ok && (
                  <span className="text-xs text-green-700 font-medium">
                    <CheckCircle2 className="h-3 w-3 inline mr-1" />
                    Intent {testChargeResult.intentId} — {testChargeResult.status}
                  </span>
                )}
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                To swap keys, go to{" "}
                <strong>Settings → Secrets</strong> and update{" "}
                <code className="font-mono bg-muted px-1 rounded text-xs">
                  STRIPE_SECRET_KEY
                </code>{" "}
                and{" "}
                <code className="font-mono bg-muted px-1 rounded text-xs">
                  VITE_STRIPE_PUBLISHABLE_KEY
                </code>
                . A 99% discount promo code is available for live-mode testing.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Go-live checklist ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Rocket className="h-4 w-4 text-primary" />
                Production Go-Live Checklist
              </CardTitle>
              <CardDescription>
                Complete all required items before accepting real payments.
              </CardDescription>
            </div>
            {!checklistLoading && (
              <Badge
                className={
                  isReadyToLaunch
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {isReadyToLaunch ? "Ready to Launch" : `${blockers} blocker${blockers !== 1 ? "s" : ""}`}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {checklistLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {okCount} / {nonInfoItems} required items complete
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              <Separator />

              {/* Checklist items */}
              <div className="space-y-3">
                {items.map((item: any) => {
                  const cfg = STATUS_CONFIG[item.status as CheckStatus] ?? STATUS_CONFIG.info;
                  const isStripeClaim = item.id === "stripe_claimed";
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div className="mt-0.5 flex-shrink-0">{cfg.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{item.label}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${cfg.badgeClass}`}
                          >
                            {cfg.badge}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.detail}
                        </p>
                        {isStripeClaim &&
                          item.status !== "ok" &&
                          item.sandboxExpiry && (
                            <div className="mt-1">
                              <SandboxCountdown expiry={item.sandboxExpiry} />
                            </div>
                          )}
                        {item.actionUrl && (
                          <div className="mt-2">
                            {item.actionUrl.startsWith("http") ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  window.open(item.actionUrl, "_blank")
                                }
                              >
                                <ExternalLink className="h-3 w-3 mr-1.5" />
                                {item.actionLabel}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() =>
                                  (window.location.href = item.actionUrl)
                                }
                              >
                                {item.actionLabel}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isReadyToLaunch && (
                <Alert className="border-green-200 bg-green-50 mt-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800 text-sm font-medium">
                    All required items are complete — your platform is ready for
                    production traffic.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
