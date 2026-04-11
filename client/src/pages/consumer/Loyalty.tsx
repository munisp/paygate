/**
 * Consumer Loyalty Points (Consumer) - Wave 68
 * View points balance, transaction history, and redeem points for wallet credit.
 */
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Star, TrendingUp, Gift, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const TIER_THRESHOLDS = [
  { name: "Bronze", min: 0, max: 999, color: "text-amber-700", bg: "bg-amber-100 dark:bg-amber-900/20" },
  { name: "Silver", min: 1000, max: 4999, color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800/30" },
  { name: "Gold", min: 5000, max: 19999, color: "text-yellow-500", bg: "bg-yellow-100 dark:bg-yellow-900/20" },
  { name: "Platinum", min: 20000, max: Infinity, color: "text-cyan-500", bg: "bg-cyan-100 dark:bg-cyan-900/20" },
];

function getTier(points: number) {
  return TIER_THRESHOLDS.find(t => points >= t.min && points <= t.max) ?? TIER_THRESHOLDS[0];
}

export default function Loyalty() {
  useOnboardingGate();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { data: balance, isLoading: balLoading } = trpc.tier1to5.loyalty.getLoyaltyAccount.useQuery(undefined, { staleTime: 30_000 });
  const { data: historyData, isLoading: histLoading } = trpc.tier1to5.loyalty.getTransactionHistory.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const history = historyData?.rows ?? [];

  const redeem = trpc.tier1to5.loyalty.redeemPoints.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Redeemed! ₦${(data.creditedKobo / 100).toLocaleString()} added to your wallet`);
      utils.loyalty.getAccount.invalidate();
      utils.loyalty.history.invalidate();
      utils.consumerWallet.getBalance.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const points = (balance as any)?.points ?? 0;
  const tier = getTier(points);
  const nextTier = TIER_THRESHOLDS.find(t => t.min > points);
  const progress = nextTier ? Math.round(((points - tier.min) / (nextTier.min - tier.min)) * 100) : 100;
  const redeemableNaira = Math.floor(points / 100); // 100 points = ₦1

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">Loyalty Points</h1>
      </div>

      {balLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : (
        <Card className={`border-0 ${tier.bg}`}>
          <CardContent className="pt-6 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Your Points</p>
                <p className="text-4xl font-bold">{points.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground mt-1">≈ ₦{redeemableNaira.toLocaleString()} redeemable</p>
              </div>
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${tier.bg} border`}>
                <Star className={`w-4 h-4 ${tier.color}`} />
                <span className={`text-sm font-bold ${tier.color}`}>{tier.name}</span>
              </div>
            </div>
            {nextTier && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>{points.toLocaleString()} pts</span>
                  <span>{nextTier.min.toLocaleString()} pts for {nextTier.name}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {redeemableNaira >= 100 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Redeem Points</p>
                  <p className="text-xs text-muted-foreground">Min 10,000 pts (₦100) · 100 pts = ₦1</p>
                </div>
              </div>
              <Button size="sm" onClick={() => redeem.mutate({ pointsToRedeem: points, redemptionType: 'cashback' })} disabled={redeem.isPending || points < 10000}>
                {redeem.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redeem All"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />Points History
        </h2>
        {histLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : !(history as any[]).length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Earn points by making payments!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(history as any[]).map((h: any) => (
              <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                <div>
                  <p className="text-sm font-medium">{h.description ?? h.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</p>
                </div>
                <div className={`text-sm font-bold ${h.type === "redeem" ? "text-destructive" : "text-emerald-500"}`}>
                  {h.type === "redeem" ? "-" : "+"}{h.points.toLocaleString()} pts
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
