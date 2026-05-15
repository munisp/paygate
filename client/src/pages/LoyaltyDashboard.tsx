// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Star, Gift, TrendingUp, Award, Zap, RefreshCw, History, Crown } from "lucide-react";
import { toast } from "sonner";

const TIER_CONFIG = {
  bronze: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: "🥉", min: 0, max: 10_000, next: "Silver" },
  silver: { color: "text-slate-600", bg: "bg-slate-50 border-slate-200", icon: "🥈", min: 10_000, max: 50_000, next: "Gold" },
  gold: { color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", icon: "🥇", min: 50_000, max: 200_000, next: "Platinum" },
  platinum: { color: "text-purple-600", bg: "bg-purple-50 border-purple-200", icon: "💎", min: 200_000, max: null, next: null },
};

// MOCK_HISTORY removed — now fetched from loyaltyMw.history

const CHART_DATA = [
  { month: "Nov", earned: 8_000, redeemed: 3_000 },
  { month: "Dec", earned: 12_000, redeemed: 5_000 },
  { month: "Jan", earned: 9_500, redeemed: 4_000 },
  { month: "Feb", earned: 15_000, redeemed: 7_000 },
  { month: "Mar", earned: 11_000, redeemed: 5_500 },
  { month: "Apr", earned: 8_400, redeemed: 7_000 },
];

export default function LoyaltyDashboard() {
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | "earned" | "redeemed">("all");

  const { data: balance, isLoading, refetch } = trpc.loyaltyMw.balance.useQuery();
  const redeemMutation = trpc.loyaltyMw.redeem.useMutation({
    onSuccess: (data) => {
      toast.success(`₦${data.newBalance?.toLocaleString() ?? "0"} new balance after redemption`);
      setRedeemOpen(false);
      setRedeemAmount("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });
  const evaluateMutation = trpc.loyaltyMw.evaluateTier.useMutation({
    onSuccess: () => { toast.success("Tier evaluation complete"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const currentBalance = balance?.balance ?? 15_000;
  const tier = (balance?.tier as keyof typeof TIER_CONFIG) ?? "gold";
  const tierCfg = TIER_CONFIG[tier] ?? TIER_CONFIG.gold;
  const progressPct = tierCfg.max
    ? Math.min(100, ((currentBalance - tierCfg.min) / (tierCfg.max - tierCfg.min)) * 100)
    : 100;

  const { data: historyData, isLoading: historyLoading } = trpc.loyaltyMw.history.useQuery();
  const allHistory = historyData ?? [];
  const filteredHistory = allHistory.filter((h: any) =>
    historyFilter === "all" ? true : h.type === historyFilter
  );

  const handleRedeem = () => {
    const amount = parseFloat(redeemAmount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount > currentBalance) { toast.error("Insufficient cashback balance"); return; }
    redeemMutation.mutate({ amountNGN: amount });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500" />
            Loyalty Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track cashback, tier status, and redemption history</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => evaluateMutation.mutate({ userId: undefined })} disabled={evaluateMutation.isLoading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${evaluateMutation.isLoading ? "animate-spin" : ""}`} />
            Evaluate Tier
          </Button>
          <Button size="sm" className="bg-yellow-500 hover:bg-yellow-600 text-white" onClick={() => setRedeemOpen(true)}>
            <Gift className="w-4 h-4 mr-1" /> Redeem Cashback
          </Button>
        </div>
      </div>

      {/* Tier Card + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={`md:col-span-2 border-2 ${tierCfg.bg}`}>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-3xl">{tierCfg.icon}</span>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Current Tier</p>
                    <h2 className={`text-2xl font-bold capitalize ${tierCfg.color}`}>{tier}</h2>
                  </div>
                </div>
                <p className={`text-3xl font-bold mt-2 ${tierCfg.color}`}>
                  ₦{currentBalance.toLocaleString("en-NG")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Available Cashback Balance</p>
              </div>
              <Crown className={`w-10 h-10 ${tierCfg.color} opacity-30`} />
            </div>
            {tierCfg.next && (
              <div className="mt-4 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Progress to {tierCfg.next}</span>
                  <span className={`font-semibold ${tierCfg.color}`}>{progressPct.toFixed(0)}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  ₦{(tierCfg.max! - currentBalance).toLocaleString()} more to reach {tierCfg.next}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {[
          { label: "Total Earned (All Time)", value: "₦50,400", icon: TrendingUp, color: "text-emerald-600" },
          { label: "Total Redeemed", value: "₦35,000", icon: Gift, color: "text-blue-600" },
          { label: "Cashback Rate", value: "1.5%", icon: Zap, color: "text-purple-600" },
          { label: "Tier Bonus", value: "+0.5%", icon: Award, color: "text-yellow-600" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tier Benefits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Tier Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(TIER_CONFIG).map(([t, cfg]) => (
              <div key={t} className={`p-3 rounded-lg border ${t === tier ? cfg.bg + " border-2" : "border-border opacity-60"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{cfg.icon}</span>
                  <span className={`font-semibold capitalize text-sm ${t === tier ? cfg.color : ""}`}>{t}</span>
                  {t === tier && <Badge className="text-xs ml-auto">Current</Badge>}
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• {t === "bronze" ? "1.0%" : t === "silver" ? "1.25%" : t === "gold" ? "1.5%" : "2.0%"} cashback rate</li>
                  <li>• {t === "bronze" ? "No bonus" : t === "silver" ? "+0.25% bonus" : t === "gold" ? "+0.5% bonus" : "+1.0% bonus"}</li>
                  <li>• {t === "platinum" ? "Priority support" : "Standard support"}</li>
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Earnings Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cashback Earnings vs Redemptions (6 months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={CHART_DATA}>
              <defs>
                <linearGradient id="earnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="redeemGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => `₦${v.toLocaleString("en-NG")}`} />
              <Area type="monotone" dataKey="earned" stroke="#eab308" fill="url(#earnGrad)" name="Earned" />
              <Area type="monotone" dataKey="redeemed" stroke="#6366f1" fill="url(#redeemGrad)" name="Redeemed" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" /> Transaction History
            </CardTitle>
            <div className="flex gap-1">
              {(["all", "earned", "redeemed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`text-xs px-3 py-1 rounded-full capitalize transition-colors ${
                    historyFilter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading history...</TableCell></TableRow>
              ) : filteredHistory.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No transactions found.</TableCell></TableRow>
              ) : filteredHistory.map((h: any) => {
                const pts = h.points ?? h.amount ?? 0;
                const isEarned = h.type === "earned" || pts > 0;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">{h.description}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{h.txRef ?? h.id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.date ?? h.createdAt}</TableCell>
                    <TableCell className={`text-right font-semibold ${isEarned ? "text-emerald-600" : "text-red-600"}`}>
                      {isEarned ? "+" : ""}₦{Math.abs(pts).toLocaleString("en-NG")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isEarned ? "default" : "secondary"} className="text-xs capitalize">
                        {h.type ?? (isEarned ? "earned" : "redeemed")}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Redeem Dialog */}
      <Dialog open={redeemOpen} onOpenChange={setRedeemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Cashback</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <p className="text-sm text-yellow-700">Available balance: <strong>₦{currentBalance.toLocaleString("en-NG")}</strong></p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount to Redeem (₦)</label>
              <Input
                type="number"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                placeholder="Enter amount"
                min="100"
                max={currentBalance}
              />
              <p className="text-xs text-muted-foreground">Minimum redemption: ₦100. Funds credited to your settlement account.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemOpen(false)}>Cancel</Button>
            <Button onClick={handleRedeem} disabled={redeemMutation.isLoading} className="bg-yellow-500 hover:bg-yellow-600 text-white">
              {redeemMutation.isLoading ? "Processing..." : "Redeem Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
