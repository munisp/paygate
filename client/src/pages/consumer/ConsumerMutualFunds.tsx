// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, PieChart, Plus, ArrowDownCircle } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const FUND_CATALOG = [
  { id: "fund_money_market", name: "Money Market Fund", category: "money_market", annualReturn: 12.5, risk: "Low", minInvestKobo: 500_000 },
  { id: "fund_equity_growth", name: "Equity Growth Fund", category: "equity", annualReturn: 22.0, risk: "High", minInvestKobo: 1_000_000 },
  { id: "fund_balanced", name: "Balanced Fund", category: "balanced", annualReturn: 16.0, risk: "Medium", minInvestKobo: 500_000 },
  { id: "fund_fixed_income", name: "Fixed Income Fund", category: "fixed_income", annualReturn: 14.0, risk: "Low", minInvestKobo: 500_000 },
  { id: "fund_eurobond", name: "Eurobond Fund", category: "fixed_income", annualReturn: 8.5, risk: "Low", minInvestKobo: 2_000_000 },
];

const riskColor = (risk: string) => {
  if (risk === "High") return "text-red-600 bg-red-50";
  if (risk === "Medium") return "text-amber-600 bg-amber-50";
  return "text-green-600 bg-green-50";
};

export default function ConsumerMutualFunds() {
  const [investDialog, setInvestDialog] = useState<typeof FUND_CATALOG[0] | null>(null);
  const [redeemDialog, setRedeemDialog] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [redeemAmount, setRedeemAmount] = useState("");

  const { data: investments, refetch } = trpc.consumerFinancial.funds.getPortfolio.useQuery();

  const investMutation = trpc.consumerFinancial.funds.invest.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Invested ${formatKobo(d.investedKobo ?? 0)} in ${investDialog?.name}`);
      setInvestDialog(null);
      setAmount("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const redeemMutation = trpc.consumerFinancial.funds.redeem.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Redeemed ${formatKobo(d.redeemedKobo ?? 0)}`);
      setRedeemDialog(null);
      setRedeemAmount("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const portfolio = investments as any;
  const investmentList = portfolio?.investments ?? [];
  const totalInvested = investmentList?.reduce((s: number, i: any) => s + (i.investedKobo ?? 0), 0) ?? 0;
  const totalValue = investmentList?.reduce((s: number, i: any) => s + (i.currentValueKobo ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <PieChart className="w-5 h-5 text-indigo-500" /> Mutual Funds
      </h1>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Invested</p>
            <p className="text-lg font-bold">{formatKobo(totalInvested)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Current Value</p>
            <p className={`text-lg font-bold ${totalValue >= totalInvested ? "text-green-600" : "text-red-600"}`}>
              {formatKobo(totalValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active Investments */}
      {investmentList?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">My Investments</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {investmentList.map((inv: any) => {
                const fund = FUND_CATALOG.find(f => f.id === inv.fundId);
                const gain = (inv.currentValueKobo ?? 0) - (inv.investedKobo ?? 0);
                return (
                  <div key={inv.id} className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{fund?.name ?? inv.fundId}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.units?.toFixed(4)} units · {formatKobo(inv.investedKobo ?? 0)} invested
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatKobo(inv.currentValueKobo ?? 0)}</p>
                      <p className={`text-xs ${gain >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {gain >= 0 ? "+" : ""}{formatKobo(gain)}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs mt-1"
                        onClick={() => setRedeemDialog(inv)}
                      >
                        Redeem
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fund Catalog */}
      <div>
        <h2 className="text-base font-semibold mb-3">Available Funds</h2>
        <div className="space-y-3">
          {FUND_CATALOG.map((fund) => (
            <Card key={fund.id} className="hover:border-primary transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{fund.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskColor(fund.risk)}`}>
                        {fund.risk} Risk
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">{fund.category.replace("_", " ")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Min: {formatKobo(fund.minInvestKobo)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">{fund.annualReturn}%</p>
                    <p className="text-xs text-muted-foreground">p.a.</p>
                    <Button
                      size="sm"
                      className="mt-2"
                      onClick={() => { setInvestDialog(fund); setAmount(""); }}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Invest
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Invest Dialog */}
      <Dialog open={!!investDialog} onOpenChange={(o) => !o && setInvestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invest in {investDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Expected return: <strong>{investDialog?.annualReturn}% p.a.</strong> · Risk: {investDialog?.risk}
            </p>
            <div>
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input
                type="number"
                placeholder={`Min ₦${((investDialog?.minInvestKobo ?? 0) / 100).toLocaleString()}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvestDialog(null)}>Cancel</Button>
            <Button
              disabled={!amount || Number(amount) * 100 < (investDialog?.minInvestKobo ?? 0) || investMutation.isPending}
              onClick={() => investDialog && investMutation.mutate({ fundId: investDialog.id, amountKobo: Math.round(Number(amount) * 100) })}
            >
              {investMutation.isPending ? "Processing..." : "Confirm Investment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog open={!!redeemDialog} onOpenChange={(o) => !o && setRedeemDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeem Investment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current value: <strong>{formatKobo(redeemDialog?.currentValueKobo ?? 0)}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">Amount to redeem (₦)</label>
              <Input
                type="number"
                placeholder="Amount"
                value={redeemAmount}
                onChange={(e) => setRedeemAmount(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedeemDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!redeemAmount || redeemMutation.isPending}
              onClick={() => redeemDialog && redeemMutation.mutate({ investmentId: redeemDialog.id, amountKobo: Math.round(Number(redeemAmount) * 100) })}
            >
              {redeemMutation.isPending ? "Processing..." : "Confirm Redemption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
