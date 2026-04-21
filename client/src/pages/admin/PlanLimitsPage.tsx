import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, DollarSign, Users, Zap, Globe } from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-800",
  starter: "bg-blue-100 text-blue-800",
  growth: "bg-purple-100 text-purple-800",
  business: "bg-orange-100 text-orange-800",
  enterprise: "bg-red-100 text-red-800",
};

const DEFAULT_PLANS = [
  { plan: "free", maxApiCallsPerMonth: 1000, maxTxVolumeUsdPerMonth: 1000, maxUsers: 2, maxCorridors: 1, maxWebhooks: 2, maxApiKeys: 1, priceUsdPerMonth: 0, features: ["Basic dashboard", "Email support"] },
  { plan: "starter", maxApiCallsPerMonth: 10000, maxTxVolumeUsdPerMonth: 10000, maxUsers: 5, maxCorridors: 3, maxWebhooks: 5, maxApiKeys: 3, priceUsdPerMonth: 49, features: ["All Free features", "Webhooks", "API access", "Chat support"] },
  { plan: "growth", maxApiCallsPerMonth: 100000, maxTxVolumeUsdPerMonth: 100000, maxUsers: 20, maxCorridors: 10, maxWebhooks: 20, maxApiKeys: 10, priceUsdPerMonth: 199, features: ["All Starter features", "FX corridors", "Advanced analytics", "Priority support"] },
  { plan: "business", maxApiCallsPerMonth: 1000000, maxTxVolumeUsdPerMonth: 1000000, maxUsers: 100, maxCorridors: 50, maxWebhooks: 100, maxApiKeys: 50, priceUsdPerMonth: 799, features: ["All Growth features", "BNPL", "SSO", "Dedicated account manager"] },
  { plan: "enterprise", maxApiCallsPerMonth: 999999999, maxTxVolumeUsdPerMonth: 999999999, maxUsers: 999999, maxCorridors: 999, maxWebhooks: 999, maxApiKeys: 999, priceUsdPerMonth: 0, features: ["All Business features", "Custom limits", "SLA guarantee", "On-premise option"] },
];

export default function PlanLimitsPage() {
  const { toast } = useToast();
  const [editPlan, setEditPlan] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    plan: "",
    maxApiCallsPerMonth: 10000,
    maxTxVolumeUsdPerMonth: 10000,
    maxUsers: 5,
    maxCorridors: 3,
    maxWebhooks: 5,
    maxApiKeys: 3,
    priceUsdPerMonth: 49,
    stripePriceId: "",
    features: "",
  });

  const { data: plans, refetch, isLoading } = trpc.wave32.planLimits.list.useQuery();

  const upsertMutation = trpc.wave32.planLimits.upsert.useMutation({
    onSuccess: () => {
      toast({ title: "Plan saved" });
      setEditPlan(null);
      setShowCreate(false);
      refetch();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const seedPlans = () => {
    DEFAULT_PLANS.forEach(p => {
      upsertMutation.mutate({ ...p, stripePriceId: undefined });
    });
  };

  const editingPlan = plans?.find(p => p.plan === editPlan);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscription Plans</h1>
          <p className="text-muted-foreground">Configure plan limits, pricing, and features for each tier.</p>
        </div>
        <div className="flex gap-2">
          {(!plans || plans.length === 0) && (
            <Button variant="outline" onClick={seedPlans} disabled={upsertMutation.isPending}>
              Seed Default Plans
            </Button>
          )}
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Plan</Button>
        </div>
      </div>

      {/* Plan Cards */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading plans...</div>
      ) : !plans?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No plans configured yet. Click "Seed Default Plans" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map(plan => (
            <Card key={plan.plan} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${PLAN_COLORS[plan.plan] ?? "bg-gray-100 text-gray-800"}`}>
                    {plan.plan}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setEditPlan(plan.plan)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
                <CardTitle className="text-2xl">
                  {plan.priceUsdPerMonth === 0 ? "Free" : `$${plan.priceUsdPerMonth}/mo`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Zap className="h-3 w-3" />{plan.maxApiCallsPerMonth >= 999999999 ? "Unlimited" : plan.maxApiCallsPerMonth.toLocaleString()} API calls
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />${plan.maxTxVolumeUsdPerMonth >= 999999999 ? "Unlimited" : plan.maxTxVolumeUsdPerMonth.toLocaleString()} vol
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-3 w-3" />{plan.maxUsers >= 999999 ? "Unlimited" : plan.maxUsers} users
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Globe className="h-3 w-3" />{plan.maxCorridors >= 999 ? "Unlimited" : plan.maxCorridors} corridors
                  </div>
                </div>
                {plan.stripePriceId && (
                  <div className="text-xs text-muted-foreground font-mono">{plan.stripePriceId}</div>
                )}
                {plan.features && (
                  <div className="flex flex-wrap gap-1">
                    {(JSON.parse(plan.features as string) as string[]).slice(0, 3).map((f: string) => (
                      <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      {[{ open: showCreate, title: "Create Plan", onClose: () => setShowCreate(false), data: form },
        { open: !!editPlan, title: `Edit ${editPlan} Plan`, onClose: () => setEditPlan(null), data: editingPlan ? {
          plan: editingPlan.plan,
          maxApiCallsPerMonth: editingPlan.maxApiCallsPerMonth,
          maxTxVolumeUsdPerMonth: editingPlan.maxTxVolumeUsdPerMonth,
          maxUsers: editingPlan.maxUsers,
          maxCorridors: editingPlan.maxCorridors,
          maxWebhooks: editingPlan.maxWebhooks,
          maxApiKeys: editingPlan.maxApiKeys,
          priceUsdPerMonth: editingPlan.priceUsdPerMonth,
          stripePriceId: editingPlan.stripePriceId ?? "",
          features: editingPlan.features ? JSON.stringify(JSON.parse(editingPlan.features as string)) : "",
        } : form }
      ].map(({ open, title, onClose, data }) => (
        <Dialog key={title} open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "plan", label: "Plan Name", type: "text", disabled: title.startsWith("Edit") },
                { key: "priceUsdPerMonth", label: "Price USD/mo", type: "number" },
                { key: "maxApiCallsPerMonth", label: "Max API Calls/mo", type: "number" },
                { key: "maxTxVolumeUsdPerMonth", label: "Max TX Volume USD/mo", type: "number" },
                { key: "maxUsers", label: "Max Users", type: "number" },
                { key: "maxCorridors", label: "Max Corridors", type: "number" },
                { key: "maxWebhooks", label: "Max Webhooks", type: "number" },
                { key: "maxApiKeys", label: "Max API Keys", type: "number" },
                { key: "stripePriceId", label: "Stripe Price ID", type: "text" },
              ].map(f => (
                <div key={f.key} className={f.key === "stripePriceId" ? "col-span-2" : ""}>
                  <Label>{f.label}</Label>
                  <Input
                    id={`plan-form-${f.key}`}
                    type={f.type}
                    disabled={f.disabled}
                    defaultValue={(data as any)[f.key]}
                  />
                </div>
              ))}
              <div className="col-span-2">
                <Label>Features (JSON array)</Label>
                <Input id="plan-form-features" defaultValue={(data as any).features} placeholder='["Feature 1", "Feature 2"]' />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                disabled={upsertMutation.isPending}
                onClick={() => {
                  const g = (k: string) => (document.getElementById(`plan-form-${k}`) as HTMLInputElement)?.value;
                  const gn = (k: string) => parseFloat(g(k) ?? "0");
                  let features: string[] | undefined;
                  try { features = JSON.parse(g("features") || "[]"); } catch { features = []; }
                  upsertMutation.mutate({
                    plan: g("plan") || (editPlan ?? ""),
                    priceUsdPerMonth: gn("priceUsdPerMonth"),
                    maxApiCallsPerMonth: gn("maxApiCallsPerMonth"),
                    maxTxVolumeUsdPerMonth: gn("maxTxVolumeUsdPerMonth"),
                    maxUsers: gn("maxUsers"),
                    maxCorridors: gn("maxCorridors"),
                    maxWebhooks: gn("maxWebhooks"),
                    maxApiKeys: gn("maxApiKeys"),
                    stripePriceId: g("stripePriceId") || undefined,
                    features,
                  });
                }}
              >
                {upsertMutation.isPending ? "Saving..." : "Save Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ))}
    </div>
  );
}
