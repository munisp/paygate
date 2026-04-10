import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type PlanInterval = "day" | "week" | "month" | "year";

export default function SubscriptionBillingV2() {
  const [planName, setPlanName] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planInterval, setPlanInterval] = useState<PlanInterval>("month");
  const [trialDays, setTrialDays] = useState("0");
  const [features, setFeatures] = useState("Feature 1\nFeature 2\nFeature 3");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: plans, refetch: refetchPlans } = trpc4.subscriptionBillingV2.listPlans.useQuery();
  const { data: subscribers } = trpc4.subscriptionBillingV2.listSubscribers.useQuery({ planId: selectedPlan ?? undefined, page: 1 });
  const { data: churn } = trpc4.subscriptionBillingV2.getChurnAnalytics.useQuery({ period: "30d" });

  const createPlanMutation = trpc4.subscriptionBillingV2.createPlan.useMutation({
    onSuccess: () => { toast.success("Plan created"); refetchPlans(); },
    onError: (e) => toast.error(e.message),
  });
  const cancelMutation = trpc4.subscriptionBillingV2.cancelSubscription.useMutation({
    onSuccess: (d) => toast.success(`Subscription ${d.subscriptionId} cancelled`),
    onError: (e) => toast.error(e.message),
  });
  const pauseMutation = trpc4.subscriptionBillingV2.pauseSubscription.useMutation({
    onSuccess: () => toast.success("Subscription paused"),
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const statusColors: Record<string, string> = { active: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700", past_due: "bg-orange-100 text-orange-700", trialing: "bg-blue-100 text-blue-700" };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Subscription Billing V2</h1>

      {/* Churn Analytics */}
      {churn && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">New Subscriptions</p><p className="text-2xl font-bold">{churn.newSubscriptions?.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Net Growth</p><p className="text-2xl font-bold text-green-600">{churn.netGrowth?.toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Churn Rate</p><p className="text-2xl font-bold text-red-600">{churn.churnRate}%</p></CardContent></Card>
          <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">MRR</p><p className="text-2xl font-bold">₦{(churn.mrr / 100).toLocaleString()}</p></CardContent></Card>
        </div>
      )}

      {/* Plans */}
      <Card>
        <CardHeader><CardTitle>Subscription Plans</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {plans?.plans?.map(plan => (
              <div key={plan.planId}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedPlan === plan.planId ? "ring-2 ring-primary bg-primary/5" : "hover:border-primary"}`}
                onClick={() => setSelectedPlan(plan.planId)}>
                <div className="flex justify-between items-start mb-2">
                  <p className="font-bold">{plan.name}</p>
                  <Badge variant={plan.status === "active" ? "default" : "secondary"}>{plan.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{plan.description}</p>
                <p className="text-2xl font-bold">{formatKobo(plan.priceKobo)}<span className="text-sm font-normal text-muted-foreground">/{plan.interval}</span></p>
                {plan.trialDays > 0 && <p className="text-xs text-blue-600">{plan.trialDays}-day free trial</p>}
                <p className="text-xs text-muted-foreground mt-1">{plan.activeSubscribers} subscribers</p>
                <ul className="mt-2 space-y-0.5">
                  {plan.features?.slice(0, 3).map((f, i) => <li key={i} className="text-xs text-muted-foreground">✓ {f}</li>)}
                </ul>
              </div>
            ))}
          </div>

          {/* Create Plan */}
          <div className="border-t pt-4 space-y-3">
            <p className="font-medium">Create New Plan</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><label className="text-xs text-muted-foreground">Name</label><Input value={planName} onChange={e => setPlanName(e.target.value)} placeholder="Pro Plan" /></div>
              <div><label className="text-xs text-muted-foreground">Description</label><Input value={planDesc} onChange={e => setPlanDesc(e.target.value)} placeholder="For growing businesses" /></div>
              <div><label className="text-xs text-muted-foreground">Price (₦)</label><Input value={planPrice} onChange={e => setPlanPrice(e.target.value)} placeholder="9999" /></div>
              <div>
                <label className="text-xs text-muted-foreground">Billing Interval</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={planInterval} onChange={e => setPlanInterval(e.target.value as PlanInterval)}>
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
              <div><label className="text-xs text-muted-foreground">Trial Days</label><Input value={trialDays} onChange={e => setTrialDays(e.target.value)} placeholder="0" /></div>
              <div><label className="text-xs text-muted-foreground">Features (one per line)</label><textarea className="w-full border rounded-md px-3 py-2 text-sm bg-background" rows={3} value={features} onChange={e => setFeatures(e.target.value)} /></div>
            </div>
            <Button disabled={createPlanMutation.isPending}
              onClick={() => createPlanMutation.mutate({ name: planName, description: planDesc, priceKobo: Math.round(parseFloat(planPrice) * 100), currency: "NGN", interval: planInterval, intervalCount: 1, trialDays: parseInt(trialDays), features: features.split("\n").filter(Boolean) })}>
              {createPlanMutation.isPending ? "Creating..." : "Create Plan"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Subscribers */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Subscribers</CardTitle>
            {selectedPlan && <Button size="sm" variant="outline" onClick={() => setSelectedPlan(null)}>Show All</Button>}
          </div>
        </CardHeader>
        <CardContent>
          {!subscribers?.subscribers?.length ? <p className="text-muted-foreground text-sm">No subscribers yet</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Customer</th><th className="text-left py-2">Plan</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Status</th><th className="text-right py-2">Renews</th><th className="text-right py-2">Actions</th></tr></thead>
              <tbody>
                {subscribers.subscribers.map(s => (
                  <tr key={s.subscriptionId} className="border-b hover:bg-muted/30">
                    <td className="py-2">{s.customerName}</td>
                    <td>{s.planName}</td>
                    <td className="text-right">{formatKobo(s.amountKobo)}</td>
                    <td className="text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[s.status] ?? "bg-gray-100 text-gray-700"}`}>{s.status}</span></td>
                    <td className="text-right text-muted-foreground">{new Date(s.currentPeriodEnd).toLocaleDateString()}</td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" disabled={pauseMutation.isPending}
                          onClick={() => pauseMutation.mutate({ subscriptionId: s.subscriptionId })}>Pause</Button>
                        <Button size="sm" variant="destructive" disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate({ subscriptionId: s.subscriptionId, reason: cancelReason, cancelAtPeriodEnd: true })}>Cancel</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
