/**
 * PayGate Merchant Portal — Subscriptions Page
 *
 * Recurring payment plans (Nigerian context):
 *   - Create subscription plans (daily, weekly, monthly, quarterly, annually)
 *   - Amounts in NGN (kobo internally)
 *   - Supports Naira-denominated plans with customer bank details
 *   - Pause / cancel subscriptions
 *   - Stats: active, paused, cancelled, total volume
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
  RefreshCw,
  Plus,
  PauseCircle,
  XCircle,
  TrendingUp,
  Users,
  Banknote,
  Activity,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

const INTERVAL_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
};

// ─── Create Subscription Dialog ───────────────────────────────────────────────

function CreateSubscriptionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    planName: "",
    amountNGN: "",
    interval: "monthly",
    totalCycles: "",
    customerEmail: "",
    customerName: "",
    customerPhone: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    description: "",
  });

  const create = trpc.subscriptions.create.useMutation({
    onSuccess: () => {
      toast.success("Subscription plan created");
      setOpen(false);
      onCreated();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.planName || !form.amountNGN) {
      toast.error("Plan name and amount are required");
      return;
    }
    const amountKobo = Math.round(parseFloat(form.amountNGN) * 100);
    if (isNaN(amountKobo) || amountKobo < 100) {
      toast.error("Amount must be at least ₦1.00");
      return;
    }
    create.mutate({
      planName: form.planName,
      amountKobo,
      currency: "NGN",
      interval: form.interval as any,
      totalCycles: form.totalCycles ? parseInt(form.totalCycles) : undefined,
      customerEmail: form.customerEmail || undefined,
      customerName: form.customerName || undefined,
      customerPhone: form.customerPhone || undefined,
      bankCode: form.bankCode || undefined,
      accountNumber: form.accountNumber || undefined,
      accountName: form.accountName || undefined,
      description: form.description || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          New Subscription
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Recurring Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Plan Name *</Label>
              <Input
                placeholder="e.g. Monthly Savings Plan"
                value={form.planName}
                onChange={(e: any) => setForm({ ...form, planName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Amount (₦) *</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                placeholder="5000.00"
                value={form.amountNGN}
                onChange={(e: any) => setForm({ ...form, amountNGN: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Interval</Label>
              <Select
                value={form.interval}
                onValueChange={(v: any) => setForm({ ...form, interval: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVAL_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Total Cycles (optional)</Label>
              <Input
                type="number"
                min="1"
                placeholder="12 (leave blank for indefinite)"
                value={form.totalCycles}
                onChange={(e: any) => setForm({ ...form, totalCycles: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Customer Email</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={form.customerEmail}
                onChange={(e: any) => setForm({ ...form, customerEmail: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Customer Name</Label>
              <Input
                placeholder="Adaeze Okonkwo"
                value={form.customerName}
                onChange={(e: any) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Customer Phone</Label>
              <Input
                placeholder="08012345678"
                value={form.customerPhone}
                onChange={(e: any) => setForm({ ...form, customerPhone: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Bank Code (NIP)</Label>
              <Input
                placeholder="058 (GTBank)"
                value={form.bankCode}
                onChange={(e: any) => setForm({ ...form, bankCode: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Account Number</Label>
              <Input
                placeholder="0123456789"
                value={form.accountNumber}
                onChange={(e: any) => setForm({ ...form, accountNumber: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Account Name</Label>
              <Input
                placeholder="ADAEZE OKONKWO"
                value={form.accountName}
                onChange={(e: any) => setForm({ ...form, accountName: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Input
                placeholder="Optional description"
                value={form.description}
                onChange={(e: any) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create Plan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const utils = trpc.useUtils();

  const { data: stats } = trpc.subscriptions.stats.useQuery();
  const { data, isLoading, refetch } = trpc.subscriptions.list.useQuery({
    status: statusFilter || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const pause = trpc.subscriptions.pause.useMutation({
    onSuccess: () => { toast.success("Subscription paused"); utils.subscriptions.list.invalidate(); utils.subscriptions.stats.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const cancel = trpc.subscriptions.cancel.useMutation({
    onSuccess: () => { toast.success("Subscription cancelled"); utils.subscriptions.list.invalidate(); utils.subscriptions.stats.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recurring payment plans — NGN-denominated, NIP-powered
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <CreateSubscriptionDialog onCreated={() => { utils.subscriptions.list.invalidate(); utils.subscriptions.stats.invalidate(); }} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Plans", value: stats?.active ?? 0, icon: Activity, color: "text-emerald-600" },
          { label: "Paused", value: stats?.paused ?? 0, icon: PauseCircle, color: "text-amber-600" },
          { label: "Total Plans", value: stats?.total ?? 0, icon: Users, color: "text-blue-600" },
          { label: "Total Volume", value: formatNGN(stats?.totalVolumeKobo ?? 0), icon: Banknote, color: "text-purple-600" },
        ].map((s: any) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-muted ${s.color}`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter || "all"} onValueChange={(v: any) => { setStatusFilter(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} plan{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading subscriptions…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center">
              <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No subscription plans yet.</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first recurring payment plan above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Interval</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Next Run</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((sub: any) => (
                    <tr key={sub.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{sub.planName}</div>
                        <div className="text-xs text-muted-foreground">{sub.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{sub.customerName ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{sub.customerEmail ?? sub.customerPhone ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium">
                        {formatNGN(sub.amountKobo)}
                      </td>
                      <td className="px-4 py-3">
                        {INTERVAL_LABELS[sub.interval] ?? sub.interval}
                        {sub.totalCycles ? ` × ${sub.totalCycles}` : ""}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {sub.nextRunAt ? new Date(sub.nextRunAt).toLocaleDateString("en-NG") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[sub.status] ?? ""}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          {sub.status === "active" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-amber-600 hover:text-amber-700"
                              onClick={() => pause.mutate({ id: sub.id })}
                              disabled={pause.isPending}
                            >
                              <PauseCircle className="w-3.5 h-3.5 mr-1" />
                              Pause
                            </Button>
                          )}
                          {(sub.status === "active" || sub.status === "paused") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-600 hover:text-red-700"
                              onClick={() => cancel.mutate({ id: sub.id })}
                              disabled={cancel.isPending}
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground py-2">
            Page {page + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
