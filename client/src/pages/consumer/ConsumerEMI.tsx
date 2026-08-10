// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CreditCard, Calendar, CheckCircle, Clock } from "lucide-react";

export default function ConsumerEMI() {
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [selectedEMI, setSelectedEMI] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading } = trpc.newFeatures.emiCheckout.getPlans.useQuery(
    { amountKobo: parseFloat(purchaseAmount || "0", { staleTime: 30_000 }) * 100, merchantId: merchantId || undefined },
    { enabled: !!purchaseAmount && parseFloat(purchaseAmount) > 0 }
  );

  const { data: schedule } = trpc.newFeatures.emiCheckout.getSchedule.useQuery(
    { emiId: selectedEMI! },
    { enabled: !!selectedEMI , staleTime: 30_000 })

  const initiateMutation = trpc.newFeatures.emiCheckout.initiateEMI.useMutation({
    onSuccess: (d: any) => {
      toast.success(`EMI plan created — ${d.tenure} months at ₦${(d.monthlyInstalment / 100).toLocaleString()}/mo`);
      setSelectedEMI(d.emiId);
      setPurchaseAmount("");
      setSelectedPlan(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <CreditCard className="h-8 w-8 text-purple-600" />
        <div>
          <h1 className="text-2xl font-bold">EMI / Buy Now Pay Later</h1>
          <p className="text-muted-foreground">Split your purchases into easy monthly instalments</p>
        </div>
      </div>

      {/* EMI Calculator */}
      <Card>
        <CardHeader>
          <CardTitle>Calculate EMI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Purchase Amount (₦)</Label>
              <Input
                type="number"
                placeholder="e.g. 150000"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                min="1000"
              />
            </div>
            <div>
              <Label>Merchant ID (optional)</Label>
              <Input
                placeholder="Leave blank for personal EMI"
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
              />
            </div>
          </div>

          {plansLoading && purchaseAmount && (
            <p className="text-muted-foreground text-sm">Loading plans...</p>
          )}

          {plans?.plans?.length > 0 && (
            <div className="space-y-3">
              <Label>Select EMI Plan</Label>
              {plans.plans.map((plan: any) => (
                <div
                  key={plan.planId}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedPlan === plan.planId ? "border-primary bg-primary/5" : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedPlan(plan.planId)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{plan.tenure} months</div>
                      <div className="text-sm text-muted-foreground">
                        Interest: {plan.interestRate?.toFixed(1)}% p.a.
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatKobo(plan.monthlyInstalmentKobo ?? 0)}</div>
                      <div className="text-xs text-muted-foreground">per month</div>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Total payable: {formatKobo(plan.totalPayableKobo ?? 0)}
                    {plan.processingFeeKobo > 0 && ` (incl. ₦${(plan.processingFeeKobo / 100).toLocaleString()} processing fee)`}
                  </div>
                </div>
              ))}

              <Button
                className="w-full"
                onClick={() => {
                  const plan = plans.plans.find((p: any) => p.planId === selectedPlan);
                  if (plan) {
                    initiateMutation.mutate({
                      planId: plan.planId,
                      amountKobo: parseFloat(purchaseAmount) * 100,
                      orderId: `ORD-${Date.now()}`,
                      merchantId: merchantId || undefined,
                    });
                  }
                }}
                disabled={!selectedPlan || initiateMutation.isPending}
              >
                {initiateMutation.isPending ? "Processing..." : "Apply for EMI"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* EMI Schedule */}
      {selectedEMI && schedule && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" /> Repayment Schedule
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(schedule.instalments ?? []).map((inst: any) => (
                <div key={inst.instalmentNo} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    {inst.status === "paid" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <div className="font-medium">Instalment {inst.instalmentNo}</div>
                      <div className="text-sm text-muted-foreground">
                        Due: {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatKobo(inst.amountKobo ?? 0)}</div>
                    <Badge variant={inst.status === "paid" ? "default" : "secondary"} className="text-xs">
                      {inst.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* How it works */}
      <Card>
        <CardHeader>
          <CardTitle>How EMI Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            {[
              { step: "1", title: "Choose Amount", desc: "Enter your purchase amount and select a tenure" },
              { step: "2", title: "Get Approved", desc: "Instant approval based on your credit profile" },
              { step: "3", title: "Pay Monthly", desc: "Auto-debit from your PayGate wallet each month" },
            ].map((s) => (
              <div key={s.step} className="p-4 rounded-lg bg-muted/50">
                <div className="text-2xl font-bold text-primary mb-2">{s.step}</div>
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
