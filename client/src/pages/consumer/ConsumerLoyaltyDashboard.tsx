// @ts-nocheck
/**
 * ConsumerLoyaltyDashboard — Points balance, tier progress,
 * cashback history, and redemption options.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Gift, Star, TrendingUp, Award, Zap, ChevronRight } from "lucide-react";

const TIERS = [
  { name: "Bronze", minPoints: 0, maxPoints: 999, color: "text-amber-700", bg: "bg-amber-100", icon: "🥉" },
  { name: "Silver", minPoints: 1000, maxPoints: 4999, color: "text-slate-600", bg: "bg-slate-100", icon: "🥈" },
  { name: "Gold", minPoints: 5000, maxPoints: 19999, color: "text-yellow-600", bg: "bg-yellow-100", icon: "🥇" },
  { name: "Platinum", minPoints: 20000, maxPoints: 99999, color: "text-purple-600", bg: "bg-purple-100", icon: "💎" },
  { name: "Diamond", minPoints: 100000, maxPoints: Infinity, color: "text-cyan-600", bg: "bg-cyan-100", icon: "💠" },
];

const REDEMPTION_OPTIONS = [
  { id: "cashback", label: "Cashback to Wallet", pointsRequired: 100, value: "₦50", icon: "💰" },
  { id: "airtime", label: "Airtime Top-up", pointsRequired: 200, value: "₦100", icon: "📱" },
  { id: "data", label: "Data Bundle (1GB)", pointsRequired: 400, value: "₦200", icon: "📶" },
  { id: "voucher", label: "Shopping Voucher", pointsRequired: 1000, value: "₦500", icon: "🛒" },
  { id: "transfer_fee", label: "Free Transfer", pointsRequired: 50, value: "1 transfer", icon: "🔄" },
];

export default function ConsumerLoyaltyDashboard() {
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const { data: cashbackData, refetch, isLoading } = trpc.newFeatures.cashbackRewards.getBalance.useQuery();
  const redeemMutation = trpc.newFeatures.cashbackRewards.redeemCashback.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Redeemed! ${d.message ?? "Points redeemed successfully"}`);
      setRedeeming(null);
      refetch();
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Redemption failed");
      setRedeeming(null);
    },
  });

  const points = cashbackData?.pointsBalance ?? 0;
  const cashbackKobo = cashbackData?.cashbackKobo ?? 0;
  const history = cashbackData?.history ?? [];

  // Determine tier
  const currentTier = TIERS.find((t) => points >= t.minPoints && points <= t.maxPoints) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const tierProgress = nextTier
    ? ((points - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100
    : 100;

  const handleRedeem = (option: (typeof REDEMPTION_OPTIONS)[0]) => {
    if (points < option.pointsRequired) {
      toast.error(`You need ${option.pointsRequired} points to redeem this reward`);
      return;
    }
    setRedeeming(option.id);
    redeemMutation.mutate({
      // Server redeems in kobo (min ₦100); catalog points convert at 50 kobo/point.
      amountKobo: Math.max(10000, option.pointsRequired * 50),
      destinationType: option.id === "airtime" ? "airtime" : "wallet",
    });
  };

  const formatKobo = (k: number) =>
    `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Gift className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold">Loyalty Rewards</h1>
          <p className="text-muted-foreground">Earn points on every transaction and redeem for rewards</p>
        </div>
      </div>

      {/* Points + Tier Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-purple-600 to-purple-800 text-white border-0">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-purple-200 text-sm mb-1">
              <Star className="h-4 w-4" /> Loyalty Points
            </div>
            <div className="text-4xl font-bold">{points.toLocaleString()}</div>
            <div className="text-purple-200 text-sm mt-1">
              ≈ {formatKobo(Math.floor(points * 50))} cashback value
            </div>
          </CardContent>
        </Card>

        <Card className={`${currentTier.bg} border-0`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{currentTier.icon}</span>
              <div>
                <div className={`font-bold text-lg ${currentTier.color}`}>{currentTier.name} Tier</div>
                <div className="text-xs text-muted-foreground">
                  {nextTier
                    ? `${(nextTier.minPoints - points).toLocaleString()} pts to ${nextTier.name}`
                    : "Maximum tier achieved!"}
                </div>
              </div>
            </div>
            {nextTier && (
              <Progress value={tierProgress} className="h-2 mt-2" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cashback Balance */}
      {cashbackKobo > 0 && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <div className="text-sm text-green-700 font-medium">Available Cashback</div>
              <div className="text-2xl font-bold text-green-800">{formatKobo(cashbackKobo)}</div>
            </div>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() =>
                redeemMutation.mutate({ amountKobo: Math.max(10000, cashbackKobo), destinationType: "wallet" })
              }
              disabled={redeemMutation.isPending}
            >
              Redeem to Wallet
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tier Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-5 w-5 text-yellow-500" /> Tier Benefits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {TIERS.map((tier) => {
              const isActive = tier.name === currentTier.name;
              const isPast = TIERS.indexOf(tier) < TIERS.indexOf(currentTier);
              return (
                <div
                  key={tier.name}
                  className={`p-2 rounded-lg text-center border-2 ${
                    isActive
                      ? `${tier.bg} border-current ${tier.color}`
                      : isPast
                      ? "bg-muted/50 border-muted opacity-60"
                      : "bg-muted/20 border-muted/30 opacity-40"
                  }`}
                >
                  <div className="text-xl">{tier.icon}</div>
                  <div className={`text-xs font-medium mt-1 ${isActive ? tier.color : ""}`}>
                    {tier.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {tier.minPoints >= 1000
                      ? `${(tier.minPoints / 1000).toFixed(0)}K+`
                      : `${tier.minPoints}+`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div className="p-2 bg-muted rounded">
              <div className="font-medium text-foreground">Bronze</div>
              <div>1× points on all transactions</div>
            </div>
            <div className="p-2 bg-muted rounded">
              <div className="font-medium text-foreground">Silver+</div>
              <div>1.5× points + free transfers</div>
            </div>
            <div className="p-2 bg-muted rounded">
              <div className="font-medium text-foreground">Gold+</div>
              <div>2× points + priority support</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Redemption Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" /> Redeem Points
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {REDEMPTION_OPTIONS.map((opt) => {
              const canRedeem = points >= opt.pointsRequired;
              return (
                <div
                  key={opt.id}
                  className={`p-3 rounded-lg border flex items-center justify-between ${
                    canRedeem ? "hover:border-primary cursor-pointer" : "opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{opt.icon}</span>
                    <div>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {opt.pointsRequired} pts → {opt.value}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={canRedeem ? "default" : "outline"}
                    disabled={!canRedeem || redeeming === opt.id}
                    onClick={() => handleRedeem(opt)}
                  >
                    {redeeming === opt.id ? "..." : "Redeem"}
                    {canRedeem && <ChevronRight className="h-3 w-3 ml-1" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Points History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Points History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {history.slice(0, 10).map((h: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <div className="text-sm font-medium">{h.description ?? h.type}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <div className={`font-bold ${h.points > 0 ? "text-green-600" : "text-red-600"}`}>
                    {h.points > 0 ? "+" : ""}
                    {h.points} pts
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
