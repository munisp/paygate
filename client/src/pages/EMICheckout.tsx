import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function EMICheckout() {
  const [purchaseAmount, setPurchaseAmount] = useState("50000");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [merchantEnabled, setMerchantEnabled] = useState(true);
  const [subsidyPct, setSubsidyPct] = useState("0");
  const [minOrder, setMinOrder] = useState("10000");

  const {isLoading, data: plans} = trpc.newFeatures.emiCheckout.getEMIPlans.useQuery(
    { amountKobo: Math.round(parseFloat(purchaseAmount) * 100) },
    { enabled: parseFloat(purchaseAmount) > 0 }
  );
  const { data: merchantConfig } = trpc.newFeatures.emiCheckout.getMerchantEMIConfig.useQuery();

  const initiateMutation = trpc.newFeatures.emiCheckout.initiateEMI.useMutation({
    onSuccess: (d: any) => toast.success(`EMI initiated: ${d.emiId}`),
    onError: (e: any) => toast.error(e.message),
  });
  const updateConfigMutation = trpc.newFeatures.emiCheckout.updateMerchantEMIConfig.useMutation({
    onSuccess: () => toast.success("EMI config updated"),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">EMI Checkout</h1>

      {/* Calculator */}
      <Card>
        <CardHeader><CardTitle className="text-base">EMI Calculator</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Purchase Amount (₦)</label>
            <Input value={purchaseAmount} onChange={e => setPurchaseAmount(e.target.value)} placeholder="50000" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {plans?.plans?.map(plan => (
              <div key={plan.planId}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedPlan === plan.planId ? "ring-2 ring-primary bg-primary/5" : "hover:border-primary"}`}
                onClick={() => setSelectedPlan(plan.planId)}>
                <p className="font-bold text-lg">{plan.tenure} months</p>
                <p className="text-sm text-muted-foreground">EMI: <strong>{formatKobo(plan.monthlyInstalment)}/mo</strong></p>
                <p className="text-xs text-muted-foreground">Interest: {plan.interestRate}% p.a.</p>
                <p className="text-xs text-muted-foreground">Total: {formatKobo(plan.totalAmountKobo)}</p>
                {plan.processingFeeKobo > 0 && <p className="text-xs text-orange-600">Fee: {formatKobo(plan.processingFeeKobo)}</p>}
                {plan.isNoInterest && <Badge className="mt-1 bg-green-600 text-white text-xs">0% Interest</Badge>}
                <p className="text-xs text-muted-foreground mt-1">{plan.bankName}</p>
              </div>
            ))}
            {!plans?.plans?.length && <p className="text-muted-foreground text-sm col-span-3">Enter an amount to see EMI plans</p>}
          </div>
          {selectedPlan && (
            <Button className="w-full" disabled={initiateMutation.isPending}
              onClick={() => initiateMutation.mutate({ planId: selectedPlan, orderId: `ord_${Date.now()}` })}>
              {initiateMutation.isPending ? "Initiating..." : `Initiate EMI — ${plans?.plans?.find(p => p.planId === selectedPlan)?.tenure} months`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Merchant Config */}
      <Card>
        <CardHeader><CardTitle className="text-base">Merchant EMI Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {merchantConfig && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={merchantConfig.enabled ? "default" : "secondary"}>{merchantConfig.enabled ? "Enabled" : "Disabled"}</Badge></div>
              <div><p className="text-xs text-muted-foreground">Min Order</p><p className="font-semibold">{formatKobo(merchantConfig.minOrderKobo)}</p></div>
              <div><p className="text-xs text-muted-foreground">Max Tenure</p><p className="font-semibold">{merchantConfig.maxTenure} months</p></div>
              <div><p className="text-xs text-muted-foreground">Subsidy</p><p className="font-semibold">{merchantConfig.subsidyPct}%</p></div>
            </div>
          )}
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground">Min Order (₦)</label>
              <Input value={minOrder} onChange={e => setMinOrder(e.target.value)} className="w-32" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subsidy %</label>
              <Input value={subsidyPct} onChange={e => setSubsidyPct(e.target.value)} className="w-24" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm">Enable EMI</label>
              <input type="checkbox" checked={merchantEnabled} onChange={e => setMerchantEnabled(e.target.checked)} className="w-4 h-4" />
            </div>
            <Button disabled={updateConfigMutation.isPending}
              onClick={() => updateConfigMutation.mutate({ enabled: merchantEnabled, supportedBanks: ["GTB", "Access", "Zenith", "UBA", "First Bank"], maxTenure: 24, subsidyPct: parseFloat(subsidyPct), minOrderKobo: Math.round(parseFloat(minOrder) * 100) })}>
              {updateConfigMutation.isPending ? "Saving..." : "Save Config"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
