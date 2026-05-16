import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Gift, Star, TrendingUp, History, Award, Zap, ShoppingBag } from "lucide-react";

const TIERS = [
  { name: "Bronze", min: 0, max: 999, color: "text-amber-700", bg: "bg-amber-100", cashback: 0.5 },
  { name: "Silver", min: 1000, max: 4999, color: "text-slate-500", bg: "bg-slate-100", cashback: 1.0 },
  { name: "Gold", min: 5000, max: 9999, color: "text-yellow-600", bg: "bg-yellow-100", cashback: 2.0 },
  { name: "Platinum", min: 10000, max: Infinity, color: "text-purple-600", bg: "bg-purple-100", cashback: 3.0 },
];

const offers = [
  { id: 1, title: "Double Points Weekend", desc: "Earn 2x points on all purchases this weekend", expiry: "Apr 27", icon: "⚡" },
  { id: 2, title: "Fuel Cashback Boost", desc: "Get 5% cashback on fuel purchases up to ₦50,000", expiry: "Apr 30", icon: "⛽" },
  { id: 3, title: "Grocery Bonus", desc: "Earn 500 bonus points on grocery spend above ₦20,000", expiry: "May 5", icon: "🛒" },
];

export default function ConsumerLoyaltyApp() {
  // Real loyalty data from DB
  const { data: loyaltyAccounts, isLoading } = trpc.wave99.loyalty.listAccounts.useQuery({ limit: 10 }, { staleTime: 30_000 });
  const { data: loyaltyTransactionsData } = trpc.wave99.loyalty.listTransactions.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");

  // Derive points from real account data (first account) or default to 0
  const firstAccount = loyaltyAccounts?.[0];
  const points = firstAccount?.pointsBalance ?? 0;
  const cashbackBalance = Math.floor(points * 10); // 1 pt = ₦10 cashback

  const currentTier = TIERS.find((t) => points >= t.min && points <= t.max) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const progressToNext = nextTier
    ? ((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100
    : 100;
  const pointsToNext = nextTier ? nextTier.min - points : 0;

  // Real transaction history from DB
  const txHistory = useMemo(() => {
    if (!loyaltyTransactionsData?.length) return [];
    return loyaltyTransactionsData.map((tx) => ({
      id: tx.id,
      type: tx.type === "earn" ? "earned" : "redeemed",
      description: tx.note ?? (tx.type === "earn" ? "Points earned" : "Points redeemed"),
      points: tx.type === "redeem" ? -Math.abs(tx.points) : tx.points,
      date: new Date(tx.createdAt).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" }),
      amount: tx.orderId ? `Order #${tx.orderId}` : "",
    }));
  }, [loyaltyTransactionsData]);

  // Monthly earnings from real data
  const thisMonthPts = useMemo(() => {
    if (!loyaltyTransactionsData) return 0;
    const now = new Date();
    return loyaltyTransactionsData
      .filter((tx) => {
        const d = new Date(tx.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && tx.type === "earn";
      })
      .reduce((sum, tx) => sum + tx.points, 0);
  }, [loyaltyTransactionsData]);

  const redeemMutation = trpc.wave99.loyalty.redeemPoints.useMutation({
    onSuccess: () => {
      toast.success(`₦${parseInt(redeemAmount).toLocaleString()} redeemed to your wallet!`);
      setShowRedeem(false);
      setRedeemAmount("");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRedeem = () => {
    const amount = parseInt(redeemAmount);
    if (!amount || amount < 500) { toast.error("Minimum redemption is ₦500"); return; }
    if (!firstAccount) { toast.error("No loyalty account found"); return; }
    const ptsNeeded = Math.ceil(amount / 10);
    if (ptsNeeded > points) { toast.error("Insufficient points balance"); return; }
    redeemMutation.mutate({ accountId: firstAccount.id, points: ptsNeeded, transactionRef: `redeem-${Date.now()}` });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gift className="w-6 h-6 text-purple-500" /> Loyalty Rewards
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Your cashback & points dashboard</p>
        </div>
      </div>

      {/* Tier Card */}
      <div className={`rounded-2xl p-6 ${currentTier.bg} border`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-muted-foreground">Current Tier</p>
            <h2 className={`text-3xl font-bold ${currentTier.color}`}>
              <Award className="inline w-7 h-7 mr-1" />{currentTier.name}
            </h2>
            <p className="text-sm mt-1">{currentTier.cashback}% cashback on all purchases</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Points</p>
            <p className="text-4xl font-bold">{points.toLocaleString()}</p>
          </div>
        </div>
        {nextTier && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{currentTier.name}</span>
              <span>{pointsToNext.toLocaleString()} pts to {nextTier.name}</span>
            </div>
            <Progress value={progressToNext} className="h-2" />
          </div>
        )}
        {!nextTier && (
          <Badge className="bg-purple-600 text-white">Maximum Tier Achieved!</Badge>
        )}
      </div>

      {/* Cashback Balance + Redeem */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cashback Balance</p>
                <p className="text-3xl font-bold text-green-600 mt-1">₦{cashbackBalance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Min redemption: ₦500</p>
              </div>
              <Button onClick={() => setShowRedeem(true)} className="gap-2" disabled={cashbackBalance < 500}>
                <Zap className="w-4 h-4" /> Redeem
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">This Month's Earnings</p>
            <p className="text-3xl font-bold mt-1">{thisMonthPts.toLocaleString()} pts</p>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Live from transaction history
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Offers */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" /> Active Offers
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="border-dashed hover:border-solid hover:shadow-sm transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="text-2xl mb-2">{offer.icon}</div>
                <h3 className="font-semibold text-sm">{offer.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{offer.desc}</p>
                <Badge variant="outline" className="mt-2 text-xs">Expires {offer.expiry}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <History className="w-5 h-5" /> Points History
        </h2>
        <Card>
          <CardContent className="p-0">
            {txHistory.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No transactions yet. Start earning points by making purchases!
              </div>
            ) : (
              <div className="divide-y">
                {txHistory.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "earned" ? "bg-green-100" : "bg-orange-100"}`}>
                        {tx.type === "earned" ? <ShoppingBag className="w-4 h-4 text-green-600" /> : <Zap className="w-4 h-4 text-orange-500" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{tx.description}</p>
                        <p className="text-xs text-muted-foreground">{tx.date}{tx.amount ? ` · ${tx.amount}` : ""}</p>
                      </div>
                    </div>
                    <span className={`font-semibold text-sm ${tx.points > 0 ? "text-green-600" : "text-orange-500"}`}>
                      {tx.points > 0 ? "+" : ""}{tx.points} pts
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Redeem Dialog */}
      <Dialog open={showRedeem} onOpenChange={setShowRedeem}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Cashback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-muted rounded-lg p-3 text-sm">
              Available balance: <strong>₦{cashbackBalance.toLocaleString()}</strong>
              <span className="text-muted-foreground ml-2">({points.toLocaleString()} pts)</span>
            </div>
            <div>
              <label className="text-sm font-medium">Amount to redeem (₦)</label>
              <Input
                type="number"
                placeholder="Min ₦500"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRedeem(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleRedeem} disabled={redeemMutation.isPending}>
                {redeemMutation.isPending ? "Processing..." : "Redeem to Wallet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
