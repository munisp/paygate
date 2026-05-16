import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CreditCard, CheckCircle, XCircle, Clock, TrendingUp, RefreshCw, Eye, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  past_due: "bg-orange-100 text-orange-800",
  trialing: "bg-blue-100 text-blue-800",
  incomplete: "bg-yellow-100 text-yellow-800",
  incomplete_expired: "bg-gray-100 text-gray-600",
  unpaid: "bg-red-100 text-red-800",
};

export default function StripeSubscriptions() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.stripeSubscriptions.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const { data: stats } = trpc.stripeSubscriptions.stats.useQuery();

  const cancelMutation = trpc.stripeSubscriptions.cancel.useMutation({
    onSuccess: () => {
      toast.success("Subscription cancelled");
      utils.stripeSubscriptions.list.invalidate();
      utils.stripeSubscriptions.stats.invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency?.toUpperCase() ?? "USD" }).format(amount / 100);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stripe Subscriptions</h1>
          <p className="text-muted-foreground text-sm mt-1">Recurring billing subscriptions managed via Stripe</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats?.total ?? 0, icon: CreditCard, color: "text-blue-600" },
          { label: "Active", value: stats?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Past Due", value: stats?.pastDue ?? 0, icon: Clock, color: "text-orange-600" },
          { label: "MRR", value: stats?.mrr ? formatAmount(stats.mrr, "usd") : "—", icon: TrendingUp, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} subscriptions</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load subscriptions.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subscription ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead>Current Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No subscriptions found</TableCell>
                  </TableRow>
                )}
                {data?.rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.stripeSubscriptionId ?? r.id}</TableCell>
                    <TableCell className="text-sm">{r.customerEmail ?? r.stripeCustomerId}</TableCell>
                    <TableCell className="font-medium">{r.planName ?? r.stripePriceId}</TableCell>
                    <TableCell className="font-semibold">{formatAmount(r.amountCents ?? 0, r.currency ?? "usd")}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.interval ?? "month"}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.currentPeriodStart ? new Date(r.currentPeriodStart).toLocaleDateString() : "—"}
                      {" → "}
                      {r.currentPeriodEnd ? new Date(r.currentPeriodEnd).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {r.stripeSubscriptionId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`https://dashboard.stripe.com/subscriptions/${r.stripeSubscriptionId}`, "_blank")}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        )}
                        {r.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => cancelMutation.mutate({ id: r.id })}
                            disabled={cancelMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Subscription Detail</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm max-h-96 overflow-y-auto">
              {Object.entries(selected).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium text-right max-w-[60%] break-all">{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
