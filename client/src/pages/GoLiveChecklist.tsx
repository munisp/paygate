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
  ExternalLink,
  Info,
  RefreshCw,
  Rocket,
  XCircle,
} from "lucide-react";
type CheckStatus = "ok" | "pending" | "warning" | "info";

const STATUS_CONFIG: Record<CheckStatus, { icon: React.ReactNode; badge: string; badgeClass: string }> = {
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

// Stripe sandbox expiry countdown
function SandboxCountdown({ expiry }: { expiry: string }) {
  const expiryDate = new Date(expiry);
  const now = new Date();
  const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isUrgent = daysLeft <= 14;

  return (
    <span className={`text-xs font-medium ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
      <Clock className="h-3 w-3 inline mr-1" />
      Sandbox expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""} ({expiryDate.toLocaleDateString()})
    </span>
  );
}

export default function GoLiveChecklist() {
  const { data, isLoading, refetch } = trpc.system.goLiveChecklist.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const items = data?.items ?? [];
  const okCount = items.filter((i) => i.status === "ok").length;
  const blockers = items.filter((i) => i.status === "pending").length;
  const warnings = items.filter((i) => i.status === "warning").length;
  const progress = items.length > 0 ? Math.round((okCount / items.filter((i) => i.status !== "info").length) * 100) : 0;
  const isReadyToLaunch = blockers === 0 && warnings === 0;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-6 w-6 text-primary" />
            Production Go-Live Checklist
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Complete all items before launching PayGate to real merchants.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Progress summary */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {isReadyToLaunch ? "🎉 Ready to launch!" : `${blockers} blocker${blockers !== 1 ? "s" : ""} remaining`}
              </p>
              <p className="text-xs text-muted-foreground">
                {okCount} of {items.filter((i) => i.status !== "info").length} required items complete
              </p>
            </div>
            <div className="flex gap-2">
              {blockers > 0 && (
                <Badge variant="destructive" className="text-xs">{blockers} Blocking</Badge>
              )}
              {warnings > 0 && (
                <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">{warnings} Warning</Badge>
              )}
              {isReadyToLaunch && (
                <Badge className="text-xs bg-green-100 text-green-800 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Launch Ready
                </Badge>
              )}
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Checklist items */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-4 pb-4">
                <div className="h-4 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))
        ) : (
          items.map((item) => {
            const cfg = STATUS_CONFIG[item.status as CheckStatus] ?? STATUS_CONFIG.info;
            const stripeItem = item.id === "stripe_claimed";

            return (
              <Card
                key={item.id}
                className={`transition-all ${item.status === "ok" ? "opacity-75" : ""}`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">{cfg.icon}</div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium">{item.label}</p>
                        <Badge variant="outline" className={`text-xs ${cfg.badgeClass}`}>
                          {cfg.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                      {stripeItem && item.status !== "ok" && (item as any).sandboxExpiry && (
                        <SandboxCountdown expiry={(item as any).sandboxExpiry} />
                      )}
                    </div>
                    {item.status !== "ok" && item.actionUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          if (item.actionUrl?.startsWith("http")) {
                            window.open(item.actionUrl, "_blank");
                          } else if (item.actionUrl) {
                            window.location.href = item.actionUrl;
                          }
                        }}
                      >
                        {item.actionLabel}
                        {item.actionUrl?.startsWith("http") && (
                          <ExternalLink className="h-3 w-3 ml-1" />
                        )}
                      </Button>
                    )}
                    {item.status !== "ok" && !item.actionUrl && item.actionLabel && (
                      <p className="text-xs text-muted-foreground shrink-0 max-w-[140px] text-right">
                        {item.actionLabel}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Test card reminder */}
      <Card className="bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Test Payment Card</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Use card number <code className="bg-muted px-1 rounded font-mono">4242 4242 4242 4242</code> with any future expiry and any 3-digit CVV to test payments in Stripe test mode.
            A 99% discount promo code is available for live mode testing after KYC.
            Minimum transaction value is <strong>₦0.50 / $0.50</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Launch button */}
      {isReadyToLaunch && (
        <Alert className="border-green-300 bg-green-50">
          <Rocket className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            All required items are complete. Click <strong>Publish</strong> in the top-right of the Management UI to deploy PayGate to production.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
