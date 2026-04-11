import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Plus, Repeat, Users, AlertTriangle } from "lucide-react";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function RecurringBilling() {
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ planName: "", amountKobo: "", intervalType: "monthly" as const, trialDays: "0", description: "" });

  const { data: plans, isLoading, refetch } = trpc.tier1to5.recurringBilling.getPlans.useQuery();
  const { data: subs } = trpc.tier1to5.recurringBilling.getSubscriptions.useQuery({ status: 'active' });
  const { data: dunning } = trpc.tier1to5.recurringBilling.getDunningQueue.useQuery();

  const createMutation = trpc.tier1to5.recurringBilling.createPlan.useMutation({
    onSuccess: () => { toast.success("Billing plan created."); setShowCreate(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const cancelMutation = trpc.tier1to5.recurringBilling.cancelSubscription.useMutation({
    onSuccess: () => { toast.success("Subscription cancelled."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    paused: "bg-yellow-100 text-yellow-800",
    cancelled: "bg-red-100 text-red-800",
    trialing: "bg-blue-100 text-blue-800",
    past_due: "bg-orange-100 text-orange-800",
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Recurring Billing</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage subscription plans, billing cycles, and dunning</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(v => !v)}><Plus className="w-4 h-4 mr-2" />New Plan</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Repeat className="w-8 h-8 text-primary opacity-70" />
              <div>
                <p className="text-2xl font-bold">{plans?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Active Plans</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="w-8 h-8 text-green-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{subs?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Subscribers</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-orange-500 opacity-70" />
              <div>
                <p className="text-2xl font-bold">{dunning?.length ?? 0}</p>
                <p className="text-xs text-muted-foreground">Dunning Queue</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Plan */}
        {showCreate && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle>Create Billing Plan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Plan Name</Label>
                  <Input placeholder="Pro Monthly" value={form.planName} onChange={e => setForm(f => ({ ...f, planName: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Amount (₦)</Label>
                  <Input type="number" placeholder="5000" value={form.amountKobo} onChange={e => setForm(f => ({ ...f, amountKobo: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label>Billing Interval</Label>
                  <Select value={form.intervalType} onValueChange={v => setForm(f => ({ ...f, intervalType: v as any }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Trial Days</Label>
                  <Input type="number" placeholder="0" value={form.trialDays} onChange={e => setForm(f => ({ ...f, trialDays: e.target.value }))} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input placeholder="Plan description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createMutation.mutate({ planName: form.planName, amountKobo: parseInt(form.amountKobo) * 100, intervalType: form.intervalType, trialDays: parseInt(form.trialDays), description: form.description })} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Plan"}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plans */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Billing Plans</h2>
          {isLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Card key={i} className="animate-pulse h-20" />)}</div>
          ) : !plans?.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><Repeat className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No billing plans yet.</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {plans.map((plan: any) => (
                <Card key={plan.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{plan.planName}</p>
                        <p className="text-2xl font-bold text-primary mt-1">{formatNGN(plan.amountKobo)}<span className="text-sm font-normal text-muted-foreground">/{plan.intervalType}</span></p>
                        {plan.trialDays > 0 && <p className="text-xs text-muted-foreground">{plan.trialDays} day trial</p>}
                      </div>
                      <Badge variant="default">{plan.subscriberCount ?? 0} subscribers</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Subscriptions */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Active Subscriptions</h2>
          {!subs?.length ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">No active subscriptions yet.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {subs.slice(0, 10).map((sub: any) => (
                <Card key={sub.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{sub.customerEmail}</p>
                      <p className="text-xs text-muted-foreground">{sub.planName} · Next billing: {sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString() : "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor[sub.status] ?? "bg-gray-100 text-gray-800"}>{sub.status}</Badge>
                      {sub.status === "active" && (
                        <Button variant="ghost" size="sm" className="text-red-500 h-7 text-xs" onClick={() => cancelMutation.mutate({ subscriptionId: sub.id })}>Cancel</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Dunning Queue */}
        {dunning && dunning.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" />Dunning Queue</h2>
            <div className="space-y-2">
              {dunning.map((item: any) => (
                <Card key={item.id} className="border-orange-200">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{item.customerEmail}</p>
                      <p className="text-xs text-muted-foreground">Attempt {item.attemptCount}/{item.maxAttempts} · {formatNGN(item.amountKobo)}</p>
                    </div>
                    <Badge className="bg-orange-100 text-orange-800">Past Due</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
