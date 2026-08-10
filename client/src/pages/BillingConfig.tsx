// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, BarChart2, CheckCircle2, Clock, Plus, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { Link } from "wouter";

// ── Helpers ───────────────────────────────────────────────────────────────────

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

function pct(val: number): string {
  return `${(val * 100).toFixed(2)}%`;
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    draft: { label: "Draft", variant: "secondary" },
    superseded: { label: "Superseded", variant: "outline" },
    archived: { label: "Archived", variant: "destructive" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

// ── Default tenant (first tenant in the system — in production this comes from auth context) ──

const DEFAULT_TENANT_ID = "ten_default";

// ── Billing Config Form ───────────────────────────────────────────────────────

interface BillingFormData {
  pricingModel: "per_transaction" | "subscription" | "hybrid";
  feeRate: number;
  feeCapKobo: number;
  feeFloorKobo: number;
  platformShare: number;
  resellerShare: number;
  interchangeCostKobo: number;
  signOnFeeKobo: number;
  signOnPlatformShare: number;
  subscriptionFeeKobo: number;
  subscriptionPlatformShare: number;
  monthlyOverheadCapKobo: number;
  notes: string;
  reason: string;
}

const DEFAULT_FORM: BillingFormData = {
  pricingModel: "per_transaction",
  feeRate: 0.015,
  feeCapKobo: 200_000,
  feeFloorKobo: 0,
  platformShare: 0.65,
  resellerShare: 0.35,
  interchangeCostKobo: 5_000,
  signOnFeeKobo: 500_000,
  signOnPlatformShare: 0.70,
  subscriptionFeeKobo: 0,
  subscriptionPlatformShare: 0.65,
  monthlyOverheadCapKobo: 0,
  notes: "",
  reason: "",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BillingConfig() {
  const isLoading = false; // Data loaded synchronously

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tenantId = DEFAULT_TENANT_ID;

  const [createOpen, setCreateOpen] = useState(false);
  const [activateOpen, setActivateOpen] = useState<string | null>(null);
  const [activateReason, setActivateReason] = useState("");
  const [form, setForm] = useState<BillingFormData>(DEFAULT_FORM);

  // Period for metrics (last 30 days)
  const [periodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [periodEnd] = useState(() => new Date());

  // Queries
  const activeConfig = trpc.billing.getActive.useQuery({ tenantId }, { staleTime: 30_000 });
  const versions = trpc.billing.listVersions.useQuery({ tenantId }, { staleTime: 30_000 });
  const auditLog = trpc.billing.getAuditLog.useQuery({ tenantId, limit: 20 }, { staleTime: 30_000 });
  const metrics = trpc.billing.getMetricsSummary.useQuery({ tenantId, periodStart, periodEnd }, { staleTime: 30_000 });
  const overheadByCategory = trpc.billing.getOverheadByCategory.useQuery({ tenantId, periodStart, periodEnd }, { staleTime: 30_000 });
  const billingEvents = trpc.billing.listBillingEvents.useQuery({ tenantId, limit: 50 }, { staleTime: 30_000 });

  const utils = trpc.useUtils();

  // Mutations
  const createConfig = trpc.billing.create.useMutation({
    onSuccess: () => {
      toast.success("Billing config created as draft");
      setCreateOpen(false);
      setForm(DEFAULT_FORM);
      utils.billing.listVersions.invalidate({ tenantId });
    },
    onError: (e) => toast.error(e.message),
  });

  const activateConfig = trpc.billing.activate.useMutation({
    onSuccess: (data) => {
      toast.success(`Billing config v${data.version} activated`);
      setActivateOpen(null);
      setActivateReason("");
      utils.billing.getActive.invalidate({ tenantId });
      utils.billing.listVersions.invalidate({ tenantId });
      utils.billing.getAuditLog.invalidate({ tenantId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Computed: projected monthly revenue from active config
  const projectedRevenue = useMemo(() => {
    const cfg = activeConfig.data;
    if (!cfg) return null;
    const txns = 100_000;
    const avgAmount = 10_000_00; // ₦10,000 in kobo
    const grossFee = Math.min(Math.max(avgAmount * cfg.feeRate, cfg.feeFloorKobo), cfg.feeCapKobo);
    const platformRev = grossFee * cfg.platformShare;
    const resellerRev = grossFee * cfg.resellerShare;
    const interchange = cfg.interchangeCostKobo;
    const netPlatform = platformRev - interchange;
    return {
      txns,
      grossFee: grossFee * txns,
      platformRev: platformRev * txns,
      resellerRev: resellerRev * txns,
      netPlatform: netPlatform * txns,
    };
  }, [activeConfig.data]);

  function handleCreate() {
    createConfig.mutate({ ...form, tenantId });
  }

  function handleActivate(id: string) {
    if (!activateReason.trim()) {
      toast.error("Please provide a reason for activation");
      return;
    }
    activateConfig.mutate({ id, reason: activateReason });
  }

  return (
    <div className="container py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing Configuration</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage fee schedules, profit splits, and overhead tracking. All changes are audited and require admin approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/billing-engine/analytics">
            <Button variant="outline" size="sm">
              <BarChart2 className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
          </Link>
        {isAdmin && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Config Draft
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Billing Config Draft</DialogTitle>
                <DialogDescription>
                  Configure fee rates and profit splits. The draft must be activated by an admin before it takes effect.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4 py-4">
                {/* Pricing Model */}
                <div className="col-span-2">
                  <Label>Pricing Model</Label>
                  <Select
                    value={form.pricingModel}
                    onValueChange={(v) => setForm(f => ({ ...f, pricingModel: v as BillingFormData["pricingModel"] }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_transaction">Per Transaction</SelectItem>
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="hybrid">Hybrid (Both)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Per-transaction fields */}
                {(form.pricingModel === "per_transaction" || form.pricingModel === "hybrid") && (
                  <>
                    <div>
                      <Label>Fee Rate (%)</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        max="5"
                        className="mt-1"
                        value={(form.feeRate * 100).toFixed(3)}
                        onChange={(e) => setForm(f => ({ ...f, feeRate: parseFloat(e.target.value) / 100 }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Industry standard: 1.4–1.5%</p>
                    </div>
                    <div>
                      <Label>Fee Cap (₦)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={form.feeCapKobo / 100}
                        onChange={(e) => setForm(f => ({ ...f, feeCapKobo: Math.round(parseFloat(e.target.value) * 100) }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">CBN draft cap: ₦10,000</p>
                    </div>
                    <div>
                      <Label>Platform Share (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        className="mt-1"
                        value={(form.platformShare * 100).toFixed(0)}
                        onChange={(e) => setForm(f => ({ ...f, platformShare: parseFloat(e.target.value) / 100 }))}
                      />
                    </div>
                    <div>
                      <Label>Reseller Share (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        max="100"
                        className="mt-1"
                        value={(form.resellerShare * 100).toFixed(0)}
                        onChange={(e) => setForm(f => ({ ...f, resellerShare: parseFloat(e.target.value) / 100 }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Total: {((form.platformShare + form.resellerShare) * 100).toFixed(0)}%
                        {form.platformShare + form.resellerShare > 1 && (
                          <span className="text-destructive ml-1">⚠ Exceeds 100%</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <Label>Interchange Cost (₦)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={form.interchangeCostKobo / 100}
                        onChange={(e) => setForm(f => ({ ...f, interchangeCostKobo: Math.round(parseFloat(e.target.value) * 100) }))}
                      />
                    </div>
                    <div>
                      <Label>Sign-On Fee (₦)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={form.signOnFeeKobo / 100}
                        onChange={(e) => setForm(f => ({ ...f, signOnFeeKobo: Math.round(parseFloat(e.target.value) * 100) }))}
                      />
                      <p className="text-xs text-muted-foreground mt-1">One-time onboarding fee per merchant</p>
                    </div>
                  </>
                )}

                {/* Subscription fields */}
                {(form.pricingModel === "subscription" || form.pricingModel === "hybrid") && (
                  <>
                    <div>
                      <Label>Monthly Subscription Fee (₦)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={form.subscriptionFeeKobo / 100}
                        onChange={(e) => setForm(f => ({ ...f, subscriptionFeeKobo: Math.round(parseFloat(e.target.value) * 100) }))}
                      />
                    </div>
                    <div>
                      <Label>Subscription Platform Share (%)</Label>
                      <Input
                        type="number"
                        step="1"
                        className="mt-1"
                        value={(form.subscriptionPlatformShare * 100).toFixed(0)}
                        onChange={(e) => setForm(f => ({ ...f, subscriptionPlatformShare: parseFloat(e.target.value) / 100 }))}
                      />
                    </div>
                  </>
                )}

                {/* Overhead cap */}
                <div>
                  <Label>Monthly Overhead Cap (₦)</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={form.monthlyOverheadCapKobo / 100}
                    onChange={(e) => setForm(f => ({ ...f, monthlyOverheadCapKobo: Math.round(parseFloat(e.target.value) * 100) }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Alert threshold for overhead monitoring</p>
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    className="mt-1"
                    placeholder="Describe the purpose of this config..."
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <div className="col-span-2">
                  <Label>Reason for Change</Label>
                  <Input
                    className="mt-1"
                    placeholder="e.g. Q2 2026 pricing review"
                    value={form.reason}
                    onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createConfig.isPending}>
                  {createConfig.isPending ? "Creating..." : "Create Draft"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Active Config Summary */}
      {activeConfig.data ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Active Billing Config — v{activeConfig.data.version}</CardTitle>
              </div>
              {statusBadge(activeConfig.data.status)}
            </div>
            <CardDescription>
              Effective from {new Date(activeConfig.data.effectiveFrom).toLocaleDateString()} ·
              Approved by {activeConfig.data.approvedBy ?? "—"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Pricing Model</p>
                <p className="font-medium capitalize">{activeConfig.data.pricingModel.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fee Rate</p>
                <p className="font-medium">{pct(activeConfig.data.feeRate ?? 0)} (cap {koboToNaira(activeConfig.data.feeCapKobo)})</p>
              </div>
              <div>
                <p className="text-muted-foreground">Platform / Reseller Split</p>
                <p className="font-medium">{pct(activeConfig.data.platformShare ?? 0)} / {pct(activeConfig.data.resellerShare ?? 0)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Sign-On Fee</p>
                <p className="font-medium">{koboToNaira(activeConfig.data.signOnFeeKobo)}</p>
              </div>
            </div>

            {/* Projected revenue (100K txns @ ₦10K avg) */}
            {projectedRevenue && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  Projected monthly revenue at 100K transactions × ₦10,000 avg
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-background rounded-md p-2 border">
                    <p className="text-muted-foreground text-xs">Gross Fees</p>
                    <p className="font-semibold">{koboToNaira(projectedRevenue.grossFee)}</p>
                  </div>
                  <div className="bg-background rounded-md p-2 border">
                    <p className="text-muted-foreground text-xs">Platform Revenue</p>
                    <p className="font-semibold text-primary">{koboToNaira(projectedRevenue.platformRev)}</p>
                  </div>
                  <div className="bg-background rounded-md p-2 border">
                    <p className="text-muted-foreground text-xs">Reseller Revenue</p>
                    <p className="font-semibold">{koboToNaira(projectedRevenue.resellerRev)}</p>
                  </div>
                  <div className="bg-background rounded-md p-2 border">
                    <p className="text-muted-foreground text-xs">Net Platform (after interchange)</p>
                    <p className="font-semibold text-green-600">{koboToNaira(projectedRevenue.netPlatform)}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
            <p className="font-medium">No active billing configuration</p>
            <p className="text-sm text-muted-foreground mt-1">Create a draft and activate it to start billing.</p>
          </CardContent>
        </Card>
      )}

      {/* Live Metrics (last 30 days) */}
      {metrics.data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Transactions (30d)", value: metrics.data.totalTransactions.toLocaleString() },
            { label: "Platform Revenue", value: koboToNaira(metrics.data.totalPlatformRevenueKobo) },
            { label: "Reseller Revenue", value: koboToNaira(metrics.data.totalResellerRevenueKobo) },
            { label: "EBITDA", value: koboToNaira(metrics.data.ebitdaKobo), highlight: metrics.data.ebitdaKobo > 0 },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className={`text-xl font-bold mt-1 ${m.highlight ? "text-green-600" : ""}`}>{m.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="versions">
        <TabsList>
          <TabsTrigger value="versions">Config Versions</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="overhead">Overhead Costs</TabsTrigger>
          <TabsTrigger value="events">Billing Events</TabsTrigger>
        </TabsList>

        {/* Config Versions */}
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Version History</CardTitle>
              <CardDescription>All billing config versions for this tenant. Only one can be active at a time.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Fee Rate</TableHead>
                    <TableHead>Split (P/R)</TableHead>
                    <TableHead>Sign-On Fee</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.data?.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.version}</TableCell>
                      <TableCell className="capitalize">{v.pricingModel.replace("_", " ")}</TableCell>
                      <TableCell>{pct(v.feeRate ?? 0)}</TableCell>
                      <TableCell>{pct(v.platformShare ?? 0)} / {pct(v.resellerShare ?? 0)}</TableCell>
                      <TableCell>{koboToNaira(v.signOnFeeKobo)}</TableCell>
                      <TableCell>{statusBadge(v.status)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {v.status === "draft" && (
                            <Dialog
                              open={activateOpen === v.id}
                              onOpenChange={(o) => { setActivateOpen(o ? v.id : null); setActivateReason(""); }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  Activate
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Activate Billing Config v{v.version}</DialogTitle>
                                  <DialogDescription>
                                    This will deactivate the current active config and replace it. All future transactions will use these rates.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="py-4 space-y-3">
                                  <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                                    <p><span className="text-muted-foreground">Fee rate:</span> {pct(v.feeRate ?? 0)} (cap {koboToNaira(v.feeCapKobo)})</p>
                                    <p><span className="text-muted-foreground">Split:</span> {pct(v.platformShare ?? 0)} platform / {pct(v.resellerShare ?? 0)} reseller</p>
                                    <p><span className="text-muted-foreground">Sign-on fee:</span> {koboToNaira(v.signOnFeeKobo)}</p>
                                  </div>
                                  <div>
                                    <Label>Reason for Activation *</Label>
                                    <Input
                                      className="mt-1"
                                      placeholder="e.g. Approved in Q2 pricing review meeting"
                                      value={activateReason}
                                      onChange={(e) => setActivateReason(e.target.value)}
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={() => setActivateOpen(null)}>Cancel</Button>
                                  <Button
                                    onClick={() => handleActivate(v.id)}
                                    disabled={activateConfig.isPending || !activateReason.trim()}
                                  >
                                    {activateConfig.isPending ? "Activating..." : "Confirm Activation"}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!versions.data?.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No billing configs yet. Create a draft to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Log */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Audit Log</CardTitle>
                  <CardDescription>Every billing config change is recorded here with actor, timestamp, and reason.</CardDescription>
                </div>
                <Button variant="ghost" size="sm" aria-label="Refresh" onClick={() => utils.billing.getAuditLog.invalidate({ tenantId })}><RefreshCw/>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Config ID</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLog.data?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant={
                          entry.action === "activated" ? "default" :
                          entry.action === "created" ? "secondary" :
                          entry.action === "superseded" ? "outline" : "outline"
                        }>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.actorId}</TableCell>
                      <TableCell className="text-xs capitalize">{entry.actorRole}</TableCell>
                      <TableCell className="font-mono text-xs truncate max-w-[120px]">
                        {entry.billingConfigId?.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {entry.reason ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!auditLog.data?.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No audit entries yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Overhead Costs */}
        <TabsContent value="overhead">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overhead Cost Breakdown (Last 30 Days)</CardTitle>
              <CardDescription>
                Operational costs tracked against revenue for EBITDA calculation.
                {metrics.data && (
                  <span className="ml-2 font-medium text-foreground">
                    Total overhead: {koboToNaira(metrics.data.totalOverheadKobo)} ·
                    EBITDA margin: {(metrics.data.ebitdaMarginBps / 100).toFixed(1)}%
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {overheadByCategory.data?.length ? (
                <div className="space-y-3">
                  {overheadByCategory.data.map((row) => (
                    <div key={row.category} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="capitalize text-sm">{row.category}</span>
                      </div>
                      <span className="font-medium text-sm">{koboToNaira(Number(row.totalKobo ?? 0))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Clock className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No overhead costs recorded for this period.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use the API or settlement bridge to record infrastructure, labor, and other operational costs.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* Billing Events */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing Events</CardTitle>
              <CardDescription>
                Recent billing lifecycle events — fee calculations, overrides, and adjustments.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {billingEvents.isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : billingEvents.data?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead>Amount (₦)</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Occurred At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingEvents.data.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="font-medium capitalize">{(ev.eventType ?? '').replace(/_/g, ' ')}</TableCell>
                        <TableCell>{ev.amountKobo != null ? koboToNaira(Number(ev.amountKobo)) : '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{ev.referenceId ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {ev.occurredAt ? new Date(ev.occurredAt).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-sm text-muted-foreground">No billing events recorded yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Events are generated automatically as transactions are processed.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
