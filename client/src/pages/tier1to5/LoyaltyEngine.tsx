import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { RefreshCw, Star, Gift, TrendingUp, Users } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function LoyaltyEngine() {
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemRewardId, setRedeemRewardId] = useState("");

  const { data: account, isLoading, refetch } = trpc.tier1to5.loyalty.getLoyaltyAccount.useQuery();
  const { data: balance } = trpc.tier1to5.loyalty.getPointsBalance.useQuery();
  const { data: txHistory } = trpc.tier1to5.loyalty.getTransactionHistory.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: tiers } = trpc.tier1to5.loyalty.getTierBenefits.useQuery();
  const { data: stats } = trpc.tier1to5.loyalty.getMerchantLoyaltyStats.useQuery();

  const redeemMutation = trpc.tier1to5.loyalty.redeemPoints.useMutation({
    onSuccess: (data: any) => { toast.success(`Redeemed ${data.pointsRedeemed} points for ${data.rewardName}`); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const tierColor: Record<string, string> = {
    bronze: "text-amber-700 bg-amber-50 border-amber-200",
    silver: "text-gray-600 bg-gray-50 border-gray-200",
    gold: "text-yellow-600 bg-yellow-50 border-yellow-200",
    platinum: "text-purple-600 bg-purple-50 border-purple-200",
  };

  if (!isLoading && !account) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Loyalty & Rewards Engine</h1>
            <p className="text-muted-foreground text-sm mt-1">Rust-powered loyalty ledger with Dapr state and Kafka event streaming</p>
          </div>
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
        </div>

        {/* Account Overview */}
        {isLoading ? (
          <Card className="animate-pulse h-40" />
        ) : account ? (
          <Card className={`border-2 ${tierColor[account.tier] ?? "border-muted"}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Star className="w-12 h-12 text-yellow-500" />
                  <div>
                    <Badge className={tierColor[account.tier] ?? ""}>{account.tier?.toUpperCase()} TIER</Badge>
                    <p className="text-3xl font-bold mt-1">{balance?.available?.toLocaleString() ?? 0} <span className="text-lg font-normal text-muted-foreground">pts</span></p>
                    <p className="text-sm text-muted-foreground">{balance?.pending ?? 0} pending · {balance?.lifetime ?? 0} lifetime</p>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <p className="text-xs text-muted-foreground">Next Tier Progress</p>
                  <Progress value={account.tierProgressPct ?? 0} className="w-32 h-2" />
                  <p className="text-xs text-muted-foreground">{account.pointsToNextTier ?? 0} pts to {account.nextTier}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Merchant Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Members</p><p className="text-2xl font-bold">{stats.totalMembers?.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Points Issued</p><p className="text-2xl font-bold">{stats.totalPointsIssued?.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Points Redeemed</p><p className="text-2xl font-bold">{stats.totalPointsRedeemed?.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Redemption Rate</p><p className="text-2xl font-bold">{stats.redemptionRate?.toFixed(1)}%</p></CardContent></Card>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Redeem Points */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Gift className="w-5 h-5 text-primary" />Redeem Points</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Reward ID</Label>
                <Input placeholder="reward_cashback_500" value={redeemRewardId} onChange={e => setRedeemRewardId(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Points to Redeem</Label>
                <Input type="number" placeholder="500" value={redeemPoints} onChange={e => setRedeemPoints(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={() => redeemMutation.mutate({ pointsToRedeem: parseInt(redeemPoints) || 0, redemptionType: 'cashback' })} disabled={redeemMutation.isPending || !redeemPoints} className="w-full">
                {redeemMutation.isPending ? "Redeeming..." : "Redeem Points"}
              </Button>
            </CardContent>
          </Card>

          {/* Tier Benefits */}
          <Card>
            <CardHeader><CardTitle>Tier Benefits</CardTitle></CardHeader>
            <CardContent>
              {tiers ? (
                <div className="space-y-2">
                  {tiers.map((tier: any) => (
                    <div key={tier.tier} className={`p-3 rounded-lg border ${tierColor[tier.tier] ?? "border-muted"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize">{tier.tier}</span>
                        <span className="text-xs">{tier.minPoints?.toLocaleString()} pts</span>
                      </div>
                      <p className="text-xs mt-1 opacity-70">{tier.benefits?.join(" · ")}</p>
                    </div>
                  ))}
                </div>
              ) : <div className="animate-pulse space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-muted rounded" />)}</div>}
            </CardContent>
          </Card>
        </div>

        {/* Transaction History */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Points History</h2>
          {!txHistory?.length ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No points transactions yet.</CardContent></Card>
          ) : (
            <div className="space-y-1">
              {txHistory.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={`font-bold ${tx.type === 'earn' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'earn' ? '+' : '-'}{tx.points?.toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
