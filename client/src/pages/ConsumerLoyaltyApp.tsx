import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const mockHistory = [
  { id: 1, type: "earned", description: "Purchase at Shoprite", points: 150, date: "2026-04-22", amount: "₦15,000" },
  { id: 2, type: "earned", description: "Online transfer bonus", points: 50, date: "2026-04-20", amount: "₦5,000" },
  { id: 3, type: "redeemed", description: "Cashback to wallet", points: -500, date: "2026-04-18", amount: "₦5,000" },
  { id: 4, type: "earned", description: "Fuel purchase", points: 80, date: "2026-04-15", amount: "₦8,000" },
  { id: 5, type: "earned", description: "Airtime purchase", points: 20, date: "2026-04-12", amount: "₦2,000" },
];

const offers = [
  { id: 1, title: "Double Points Weekend", desc: "Earn 2x points on all purchases this weekend", expiry: "Apr 27", icon: "⚡" },
  { id: 2, title: "Fuel Cashback Boost", desc: "Get 5% cashback on fuel purchases up to ₦50,000", expiry: "Apr 30", icon: "⛽" },
  { id: 3, title: "Grocery Bonus", desc: "Earn 500 bonus points on grocery spend above ₦20,000", expiry: "May 5", icon: "🛒" },
];

export default function ConsumerLoyaltyApp() {
  // Real loyalty data from DB
  const { data: loyaltyAccounts, isLoading } = trpc.wave99.loyalty.listAccounts.useQuery({ limit: 10 });
  const { data: loyaltyTransactions } = trpc.wave99.loyalty.listTransactions.useQuery({ limit: 20 });
  const [points, setPoints] = useState(3_750);
  const [cashbackBalance, setCashbackBalance] = useState(3_750); // kobo → naira
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");

  const currentTier = TIERS.find((t) => points >= t.min && points <= t.max) ?? TIERS[0];
  const nextTier = TIERS[TIERS.indexOf(currentTier) + 1];
  const progressToNext = nextTier
    ? ((points - currentTier.min) / (nextTier.min - currentTier.min)) * 100
    : 100;
  const pointsToNext = nextTier ? nextTier.min - points : 0;

  const handleRedeem = () => {
    const amount = parseInt(redeemAmount);
    if (!amount || amount < 500) { toast.error("Minimum redemption is ₦500"); return; }
    if (amount > cashbackBalance) { toast.error("Insufficient cashback balance"); return; }
    setCashbackBalance((b) => b - amount);
    setPoints((p) => p - Math.floor(amount / 10));
    setShowRedeem(false);
    setRedeemAmount("");
    toast.success(`₦${amount.toLocaleString()} redeemed to your wallet!`);
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
              <Button onClick={() => setShowRedeem(true)} className="gap-2">
                <Zap className="w-4 h-4" /> Redeem
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">This Month's Earnings</p>
            <p className="text-3xl font-bold mt-1">300 pts</p>
            <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +12% vs last month
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
            <div className="divide-y">
              {mockHistory.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === "earned" ? "bg-green-100" : "bg-orange-100"}`}>
                      {tx.type === "earned" ? <ShoppingBag className="w-4 h-4 text-green-600" /> : <Zap className="w-4 h-4 text-orange-500" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">{tx.date} · {tx.amount}</p>
                    </div>
                  </div>
                  <span className={`font-semibold text-sm ${tx.points > 0 ? "text-green-600" : "text-orange-500"}`}>
                    {tx.points > 0 ? "+" : ""}{tx.points} pts
                  </span>
                </div>
              ))}
            </div>
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
              <Button className="flex-1" onClick={handleRedeem}>Redeem to Wallet</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
