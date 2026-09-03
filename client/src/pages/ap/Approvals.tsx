// @ts-nocheck
/**
 * AP Approvals — approval rule CRUD plus the personal approval queue with
 * single approve/reject (notes dialog) and batch approve via checkboxes.
 */
import { useMemo, useState } from "react";
import {
  ShieldCheck, Plus, RefreshCw, Pencil, Trash2, CheckCircle2, XCircle,
  Inbox, ListChecks, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function nairaToKobo(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function koboToNairaStr(kobo: number | null | undefined): string {
  return kobo != null ? String(kobo / 100) : "";
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

type RuleForm = {
  name: string;
  priority: string;
  minAmount: string;
  maxAmount: string;
  approverRole: string;
  requiredApprovals: string;
  isActive: boolean;
};

const EMPTY_RULE: RuleForm = {
  name: "", priority: "0", minAmount: "0", maxAmount: "", approverRole: "", requiredApprovals: "1", isActive: true,
};

export default function Approvals() {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"queue" | "rules">("queue");
  const [ruleDialog, setRuleDialog] = useState<{ mode: "create" } | { mode: "edit"; ruleId: number } | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(EMPTY_RULE);
  const [decision, setDecision] = useState<{ billIds: string[]; action: "approve" | "reject" } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ── queries ──
  const { data: queue, isLoading: queueLoading, refetch: refetchQueue } = trpc.apApprovals.approvalQueue.useQuery(
    undefined,
    { staleTime: 15_000 },
  );
  const queueRows: any[] = queue ?? [];

  const { data: rules, isLoading: rulesLoading } = trpc.apApprovals.listRules.useQuery(
    { includeInactive: true },
    { staleTime: 30_000 },
  );
  const ruleRows: any[] = rules ?? [];

  const invalidate = () => {
    utils.apApprovals.approvalQueue.invalidate();
    utils.apApprovals.listRules.invalidate();
    utils.apBillPay.listBills.invalidate();
  };

  // ── mutations ──
  const createRule = trpc.apApprovals.createRule.useMutation({
    onSuccess: () => { toast.success("Approval rule created"); setRuleDialog(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateRule = trpc.apApprovals.updateRule.useMutation({
    onSuccess: () => { toast.success("Approval rule updated"); setRuleDialog(null); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.apApprovals.deleteRule.useMutation({
    onSuccess: () => { toast.success("Approval rule deleted"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const approveStep = trpc.apApprovals.approveStep.useMutation({
    onSuccess: (r: any) => {
      toast.success(r?.billApproved ? "Bill fully approved" : "Approval step recorded");
      closeDecision(); invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const rejectStep = trpc.apApprovals.rejectStep.useMutation({
    onSuccess: () => { toast.success("Bill rejected"); closeDecision(); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const batchApprove = trpc.apApprovals.batchApprove.useMutation({
    onSuccess: (r: any) => {
      const failed = (r?.results ?? []).filter((x: any) => !x.ok);
      if (failed.length === 0) {
        toast.success(`${r?.results?.length ?? 0} bill(s) approved`);
      } else {
        toast.warning(`${(r?.results ?? []).length - failed.length} approved, ${failed.length} failed: ${failed[0]?.error ?? ""}`);
      }
      closeDecision(); invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDecision = () => {
    setDecision(null);
    setDecisionNotes("");
    setSelected(new Set());
  };

  // ── rule form ──
  const openCreate = () => { setRuleForm(EMPTY_RULE); setRuleDialog({ mode: "create" }); };
  const openEdit = (r: any) => {
    setRuleForm({
      name: r.name ?? "",
      priority: String(r.priority ?? 0),
      minAmount: koboToNairaStr(r.minAmountKobo) || "0",
      maxAmount: koboToNairaStr(r.maxAmountKobo),
      approverRole: r.approverRole ?? "",
      requiredApprovals: String(r.requiredApprovals ?? 1),
      isActive: Boolean(r.isActive),
    });
    setRuleDialog({ mode: "edit", ruleId: r.id });
  };

  const submitRule = () => {
    if (!ruleForm.name.trim()) { toast.error("Rule name is required"); return; }
    const minAmountKobo = nairaToKobo(ruleForm.minAmount);
    const maxAmountKobo = ruleForm.maxAmount.trim() ? nairaToKobo(ruleForm.maxAmount) : undefined;
    if (maxAmountKobo != null && maxAmountKobo <= minAmountKobo) {
      toast.error("Max amount must be greater than min amount");
      return;
    }
    if (ruleDialog?.mode === "create") {
      createRule.mutate({
        name: ruleForm.name.trim(),
        priority: parseInt(ruleForm.priority, 10) || 0,
        minAmountKobo,
        maxAmountKobo,
        approverRole: ruleForm.approverRole.trim() || undefined,
        requiredApprovals: Math.min(5, Math.max(1, parseInt(ruleForm.requiredApprovals, 10) || 1)),
        isActive: ruleForm.isActive,
      });
    } else if (ruleDialog?.mode === "edit") {
      updateRule.mutate({
        ruleId: ruleDialog.ruleId,
        name: ruleForm.name.trim(),
        priority: parseInt(ruleForm.priority, 10) || 0,
        minAmountKobo,
        maxAmountKobo: ruleForm.maxAmount.trim() ? nairaToKobo(ruleForm.maxAmount) : null,
        approverRole: ruleForm.approverRole.trim() || null,
        requiredApprovals: Math.min(5, Math.max(1, parseInt(ruleForm.requiredApprovals, 10) || 1)),
        isActive: ruleForm.isActive,
      });
    }
  };

  // ── queue decisions ──
  const submitDecision = () => {
    if (!decision) return;
    if (decision.action === "reject") {
      if (decisionNotes.trim().length < 3) { toast.error("Rejection notes are required (min 3 characters)"); return; }
      rejectStep.mutate({ billId: decision.billIds[0], notes: decisionNotes.trim() });
      return;
    }
    if (decision.billIds.length === 1) {
      approveStep.mutate({ billId: decision.billIds[0], notes: decisionNotes.trim() || undefined });
    } else {
      batchApprove.mutate({ billIds: decision.billIds, notes: decisionNotes.trim() || undefined });
    }
  };

  const toggleSelected = (billId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) next.delete(billId); else next.add(billId);
      return next;
    });
  };
  const allSelected = queueRows.length > 0 && queueRows.every((r) => selected.has(r.bill.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(queueRows.map((r) => r.bill.id)));
  };

  const deciding = approveStep.isPending || rejectStep.isPending || batchApprove.isPending;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bill approval chains — rules, your queue and batch decisions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetchQueue()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> New Rule
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { key: "queue", label: "My Approval Queue", icon: Inbox, count: queueRows.length },
          { key: "rules", label: "Approval Rules", icon: ListChecks, count: ruleRows.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.key
                ? "bg-primary text-primary-foreground shadow"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/20" : "bg-muted"}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ── Queue tab ── */}
      {tab === "queue" && (
        <>
          {selected.size > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm text-foreground">{selected.size} bill(s) selected</p>
              <Button size="sm" className="gap-2" onClick={() => setDecision({ billIds: [...selected], action: "approve" })}>
                <CheckCircle2 className="w-4 h-4" /> Batch Approve
              </Button>
            </div>
          )}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {queueLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading approval queue…</div>
            ) : queueRows.length === 0 ? (
              <div className="p-12 text-center">
                <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">Nothing awaiting your approval</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Bills submitted for approval appear here when you are the assigned approver</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 w-10">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">WHT</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {queueRows.map((r) => (
                      <tr key={r.approvalId} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selected.has(r.bill.id)}
                            onCheckedChange={() => toggleSelected(r.bill.id)}
                            aria-label={`Select bill ${r.bill.billNumber ?? r.bill.id}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{r.bill.billNumber ?? `#${r.bill.id.slice(0, 8)}`}</p>
                          <p className="text-xs text-muted-foreground">{r.bill.source ?? "manual"}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{formatNGN(r.bill.totalKobo)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{(r.bill.whtKobo ?? 0) > 0 ? formatNGN(r.bill.whtKobo) : "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant="outline" className="text-xs">Step {r.step}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(r.bill.dueDate)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(r.bill.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 justify-end">
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-green-400"
                              onClick={() => setDecision({ billIds: [r.bill.id], action: "approve" })}>
                              <ThumbsUp className="w-3.5 h-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 gap-1 text-red-400"
                              onClick={() => setDecision({ billIds: [r.bill.id], action: "reject" })}>
                              <ThumbsDown className="w-3.5 h-3.5" /> Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Rules tab ── */}
      {tab === "rules" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {rulesLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading rules…</div>
          ) : ruleRows.length === 0 ? (
            <div className="p-12 text-center">
              <ListChecks className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No approval rules</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create a rule to route bills through an approval chain</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rule</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount Range</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Approver</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ruleRows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{r.priority}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatNGN(r.minAmountKobo ?? 0)}{r.maxAmountKobo != null ? ` – ${formatNGN(r.maxAmountKobo)}` : "+"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.approverRole ? `Role: ${r.approverRole}` : r.approverUserId ? `User #${r.approverUserId}` : "Merchant owner"}
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{r.requiredApprovals}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${r.isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                          {r.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground" title="Edit rule">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { if (confirm(`Delete rule "${r.name}"?`)) deleteRule.mutate({ ruleId: r.id }); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-red-400" title="Delete rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Rule create/edit dialog ── */}
      <Dialog open={!!ruleDialog} onOpenChange={(o) => { if (!o) setRuleDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ruleDialog?.mode === "create" ? "New Approval Rule" : "Edit Approval Rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="e.g. Bills over ₦500k need finance sign-off" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Priority (lower runs first)</Label>
                <Input type="number" value={ruleForm.priority} onChange={(e) => setRuleForm({ ...ruleForm, priority: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Required Approvals (1–5)</Label>
                <Input type="number" min="1" max="5" value={ruleForm.requiredApprovals} onChange={(e) => setRuleForm({ ...ruleForm, requiredApprovals: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Min Amount (₦)</Label>
                <Input type="number" min="0" step="0.01" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Max Amount (₦, optional)</Label>
                <Input type="number" min="0" step="0.01" value={ruleForm.maxAmount} onChange={(e) => setRuleForm({ ...ruleForm, maxAmount: e.target.value })} placeholder="No upper bound" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Approver Role (optional)</Label>
              <Input value={ruleForm.approverRole} onChange={(e) => setRuleForm({ ...ruleForm, approverRole: e.target.value })} placeholder="e.g. finance_manager" />
            </div>
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-4 py-3">
              <Label htmlFor="rule-active" className="cursor-pointer">Rule active</Label>
              <Switch id="rule-active" checked={ruleForm.isActive} onCheckedChange={(v) => setRuleForm({ ...ruleForm, isActive: v })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRuleDialog(null)}>Cancel</Button>
              <Button onClick={submitRule} disabled={createRule.isPending || updateRule.isPending}>
                {ruleDialog?.mode === "create" ? "Create Rule" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Approve / Reject notes dialog ── */}
      <Dialog open={!!decision} onOpenChange={(o) => { if (!o) closeDecision(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "approve"
                ? decision.billIds.length > 1 ? `Batch Approve ${decision.billIds.length} Bills` : "Approve Bill"
                : "Reject Bill"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Notes {decision?.action === "reject" ? "(required)" : "(optional)"}</Label>
              <Textarea rows={3} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder={decision?.action === "reject" ? "Why is this bill being rejected?" : "Optional approval notes"} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDecision}>Cancel</Button>
              <Button
                variant={decision?.action === "reject" ? "destructive" : "default"}
                onClick={submitDecision}
                disabled={deciding}
                className="gap-2"
              >
                {decision?.action === "approve" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {decision?.action === "approve" ? "Approve" : "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
