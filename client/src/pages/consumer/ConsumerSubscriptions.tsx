import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Pause, Play, X, CreditCard } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function ConsumerSubscriptions() {
  const [cancelDialog, setCancelDialog] = useState<any | null>(null);

  const { data: subscriptions, refetch } = trpc.consumerFinancial.subscriptions.listSubscriptions.useQuery();

  const cancelMutation = trpc.consumerFinancial.subscriptions.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      setCancelDialog(null);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const pauseMutation = trpc.consumerFinancial.subscriptions.pauseSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription paused");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resumeMutation = trpc.consumerFinancial.subscriptions.resumeSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription resumed");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const subList = (subscriptions as any[]) ?? [];

  const statusVariant = (s: string) => {
    if (s === "active") return "default";
    if (s === "paused") return "secondary";
    if (s === "cancelled") return "destructive";
    return "outline";
  };

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-green-500" /> My Subscriptions
      </h1>

      {subList.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p>No active subscriptions found.</p>
            <p className="text-xs mt-1">Subscriptions you set up will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {subList.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium">{sub.merchantName ?? sub.merchantId}</p>
                    <p className="text-xs text-muted-foreground font-mono">{sub.id}</p>
                  </div>
                  <Badge variant={statusVariant(sub.status)}>{sub.status}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                  <div>
                    <p className="text-muted-foreground">Amount</p>
                    <p className="font-semibold">{formatKobo(sub.amountKobo ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Frequency</p>
                    <p className="font-semibold capitalize">{sub.frequency ?? "monthly"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Next Billing</p>
                    <p className="font-semibold">
                      {sub.nextBillingDate ? new Date(sub.nextBillingDate).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {sub.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => pauseMutation.mutate({ subscriptionId: sub.id })}
                      disabled={pauseMutation.isPending}
                    >
                      <Pause className="w-3 h-3 mr-1" /> Pause
                    </Button>
                  )}
                  {sub.status === "paused" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-8 text-xs"
                      onClick={() => resumeMutation.mutate({ subscriptionId: sub.id })}
                      disabled={resumeMutation.isPending}
                    >
                      <Play className="w-3 h-3 mr-1" /> Resume
                    </Button>
                  )}
                  {sub.status !== "cancelled" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="flex-1 h-8 text-xs"
                      onClick={() => setCancelDialog(sub)}
                    >
                      <X className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Cancel Confirmation */}
      <Dialog open={!!cancelDialog} onOpenChange={(o) => !o && setCancelDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Subscription</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to cancel your subscription with{" "}
            <strong>{cancelDialog?.merchantName ?? cancelDialog?.merchantId}</strong>?
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>Keep Subscription</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelDialog && cancelMutation.mutate({ subscriptionId: cancelDialog.id })}
            >
              {cancelMutation.isPending ? "Cancelling..." : "Yes, Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
