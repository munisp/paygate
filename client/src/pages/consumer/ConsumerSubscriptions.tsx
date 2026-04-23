// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Pause, X, Plus, CreditCard } from "lucide-react";

export default function ConsumerSubscriptions() {
  const [activeTab, setActiveTab] = useState<"active" | "plans">("active");

  const { data: subscriptions, refetch, isLoading } = trpc.subscriptions.list.useQuery({ limit: 20, offset: 0 });
  const { data: plans } = trpc.newFeatures.subscriptionBillingV2.listPlans.useQuery();

  const pauseMutation = trpc.subscriptions.pause.useMutation({
    onSuccess: () => { toast.success("Subscription paused"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => { toast.success("Subscription cancelled"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const subscribeMutation = trpc.newFeatures.subscriptionBillingV2.subscribe.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Subscribed to ${d.planName}`);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const statusColor: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
    pending: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <RefreshCw className="h-8 w-8 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">Manage your recurring subscriptions and plans</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Button
          variant={activeTab === "active" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("active")}
        >
          My Subscriptions
        </Button>
        <Button
          variant={activeTab === "plans" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("plans")}
        >
          <Plus className="h-4 w-4 mr-1" /> Browse Plans
        </Button>
      </div>

      {activeTab === "active" && (
        <Card>
          <CardHeader>
            <CardTitle>Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground text-center py-4">Loading...</p>
            ) : !subscriptions?.items?.length ? (
              <div className="text-center py-8">
                <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No active subscriptions</p>
                <Button variant="outline" className="mt-3" onClick={() => setActiveTab("plans")}>
                  Browse Plans
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {subscriptions.items.map((sub: any) => (
                  <div key={sub.id} className="p-4 rounded-lg border">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{sub.planName ?? "Subscription"}</div>
                        <div className="text-sm text-muted-foreground">
                          {sub.interval ?? "monthly"} · {formatKobo(sub.amountKobo ?? 0)}
                        </div>
                        {sub.nextBillingDate && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Next billing: {new Date(sub.nextBillingDate).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <Badge className={statusColor[sub.status] ?? ""}>{sub.status}</Badge>
                    </div>

                    {sub.status === "active" && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pauseMutation.mutate({ id: sub.id })}
                          disabled={pauseMutation.isPending}
                        >
                          <Pause className="h-3 w-3 mr-1" /> Pause
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => cancelMutation.mutate({ id: sub.id })}
                          disabled={cancelMutation.isPending}
                        >
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "plans" && (
        <Card>
          <CardHeader>
            <CardTitle>Available Plans</CardTitle>
          </CardHeader>
          <CardContent>
            {!plans?.plans?.length ? (
              <p className="text-muted-foreground text-center py-4">No plans available</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {plans.plans.map((plan: any) => (
                  <div key={plan.planId} className="p-4 rounded-lg border">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{plan.name}</div>
                        <div className="text-sm text-muted-foreground">{plan.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatKobo(plan.amountKobo ?? 0)}</div>
                        <div className="text-xs text-muted-foreground">/{plan.interval ?? "month"}</div>
                      </div>
                    </div>

                    {plan.features?.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {plan.features.slice(0, 4).map((f: string, i: number) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <span className="text-green-500">✓</span> {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => subscribeMutation.mutate({ planId: plan.planId })}
                      disabled={subscribeMutation.isPending}
                    >
                      Subscribe
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
