import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  trialing: "bg-blue-100 text-blue-800",
  past_due: "bg-yellow-100 text-yellow-800",
  canceled: "bg-red-100 text-red-800",
  unpaid: "bg-orange-100 text-orange-800",
  incomplete: "bg-gray-100 text-gray-800",
};

const PLAN_PRICES: Record<string, { name: string; price: number; features: string[] }> = {
  free: { name: "Free", price: 0, features: ["1,000 API calls/mo", "$1,000 volume", "2 users", "Email support"] },
  starter: { name: "Starter", price: 49, features: ["10,000 API calls/mo", "$10,000 volume", "5 users", "Webhooks", "Chat support"] },
  growth: { name: "Growth", price: 199, features: ["100,000 API calls/mo", "$100,000 volume", "20 users", "FX corridors", "Priority support"] },
  business: { name: "Business", price: 799, features: ["1M API calls/mo", "$1M volume", "100 users", "BNPL", "SSO", "Account manager"] },
  enterprise: { name: "Enterprise", price: 0, features: ["Unlimited everything", "Custom limits", "SLA guarantee", "On-premise option"] },
};

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: mySub } = trpc.wave32.stripeSubs.getMine.useQuery();
  const { data, refetch, isLoading } = trpc.wave32.stripeSubs.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const cancelMutation = trpc.wave32.stripeSubs.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "Subscription will cancel at period end",
      onError: (e) => toast.error(e.message),
    });
      setCancelId(null);
      refetch();
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const currentPlan = mySub?.plan ?? "free";
  const planInfo = PLAN_PRICES[currentPlan];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Subscriptions</h1>
          <p className="text-muted-foreground">Manage your subscription plan and billing.</p>
        </div>
      </div>

      {/* Current Plan */}
      <Card className="border-2 border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl font-bold capitalize">{planInfo?.name ?? currentPlan}</span>
                {mySub && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[mySub.status ?? "active"]}`}>
                    {mySub.status}
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold">
                {planInfo?.price === 0 ? "Free" : `$${planInfo?.price}/mo`}
              </div>
              {mySub?.currentPeriodEnd && (
                <p className="text-sm text-muted-foreground mt-1">
                  {mySub.cancelAtPeriodEnd ? "Cancels" : "Renews"} on {format(new Date(mySub.currentPeriodEnd), "MMMM d, yyyy")}
                </p>
              )}
              <ul className="mt-3 space-y-1">
                {planInfo?.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-3 w-3 text-green-500" />{f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setUpgradeOpen(true)}>Upgrade Plan</Button>
              {mySub && !mySub.cancelAtPeriodEnd && (
                <Button variant="outline" className="text-destructive" onClick={() => setCancelId(mySub.id)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Subscriptions (Admin) */}
      <div>
        <h2 className="text-lg font-semibold mb-4">All Subscriptions</h2>
        <div className="flex gap-3 mb-4">
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {["active", "trialing", "past_due", "canceled", "unpaid"].map(s => (
                <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  {["User ID", "Plan", "Status", "Period End", "Cancel at End", "Stripe Sub ID", "Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : data?.items?.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No subscriptions found</td></tr>
                ) : data?.items?.map(sub => (
                  <tr key={sub.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{sub.userId}</td>
                    <td className="px-4 py-3 capitalize font-medium">{sub.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[sub.status ?? "active"]}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sub.currentPeriodEnd ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {sub.cancelAtPeriodEnd ? (
                        <span className="flex items-center gap-1 text-yellow-600 text-xs"><AlertCircle className="h-3 w-3" />Yes</span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="h-3 w-3" />No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{sub.stripeSubscriptionId?.slice(0, 20)}…</td>
                    <td className="px-4 py-3">
                      {!sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => setCancelId(sub.id)}>
                          <XCircle className="h-3 w-3 mr-1" />Cancel
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {data && data.total > 20 && (
          <div className="flex justify-between items-center mt-4">
            <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Confirmation */}
      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Subscription</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This subscription will remain active until the end of the current billing period, then cancel automatically.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>Keep Subscription</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate({ id: cancelId! })} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Canceling..." : "Cancel at Period End"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Dialog */}
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Choose a Plan</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(PLAN_PRICES).filter(([k]) => k !== "enterprise").map(([key, plan]) => (
              <Card key={key} className={`cursor-pointer hover:border-primary transition-colors ${currentPlan === key ? "border-2 border-primary" : ""}`}>
                <CardContent className="pt-4">
                  <div className="font-bold capitalize mb-1">{plan.name}</div>
                  <div className="text-2xl font-bold mb-3">{plan.price === 0 ? "Free" : `$${plan.price}/mo`}</div>
                  <ul className="space-y-1">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />{f}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full mt-4" size="sm"
                    variant={currentPlan === key ? "secondary" : "default"}
                    disabled={currentPlan === key}
                    onClick={() => {
                      toast({ title: "Redirecting to Stripe Checkout", description: "Opening payment page..." });
                      setUpgradeOpen(false);
                    }}>
                    {currentPlan === key ? "Current Plan" : "Select Plan"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Enterprise plans include custom limits and SLA guarantees. <a href="mailto:sales@paygate.ng" className="underline">Contact sales</a>.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
