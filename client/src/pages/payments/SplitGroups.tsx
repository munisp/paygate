// @ts-nocheck
/**
 * Split Groups — split payment groups (create/edit members, activate/deactivate)
 * plus a live split-preview calculator panel.
 */
import { useState } from "react";
import {
  Split, Plus, RefreshCw, Users, Calculator, Trash2, UserPlus, Percent, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function nairaToKobo(v: string): number {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

type MemberRow = { subaccountRef: string; share: string };

export default function SplitGroups() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", type: "percentage", currency: "NGN", bearerType: "account", bearerSubaccountId: "",
  });
  const [members, setMembers] = useState<MemberRow[]>([{ subaccountRef: "", share: "" }]);
  const [addMemberTo, setAddMemberTo] = useState<any | null>(null);
  const [newMember, setNewMember] = useState<MemberRow>({ subaccountRef: "", share: "" });
  const [preview, setPreview] = useState({ amount: "", splitCode: "" });
  const [previewResult, setPreviewResult] = useState<any | null>(null);

  const { data, isLoading, refetch } = trpc.splitEngine.listGroups.useQuery({}, { staleTime: 15_000 });
  const groups: any[] = data?.groups ?? data?.items ?? (Array.isArray(data) ? data : []);

  const invalidate = () => utils.splitEngine.listGroups.invalidate();

  const createGroup = trpc.splitEngine.createGroup.useMutation({
    onSuccess: () => {
      toast.success("Split group created");
      setCreateOpen(false);
      setForm({ name: "", type: "percentage", currency: "NGN", bearerType: "account", bearerSubaccountId: "" });
      setMembers([{ subaccountRef: "", share: "" }]);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const updateGroup = trpc.splitEngine.updateGroup.useMutation({
    onSuccess: () => { toast.success("Group updated"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const addMember = trpc.splitEngine.addMember.useMutation({
    onSuccess: () => {
      toast.success("Member added");
      setAddMemberTo(null);
      setNewMember({ subaccountRef: "", share: "" });
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = trpc.splitEngine.removeMember.useMutation({
    onSuccess: () => { toast.success("Member removed"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const previewSplit = trpc.splitEngine.previewSplit.useMutation({
    onSuccess: (r: any) => setPreviewResult(r),
    onError: (e) => { setPreviewResult(null); toast.error(e.message); },
  });

  const submitCreate = () => {
    if (!form.name.trim()) { toast.error("Group name is required"); return; }
    const parsedMembers = members
      .filter((m) => m.subaccountRef.trim())
      .map((m) => ({ subaccountRef: m.subaccountRef.trim(), share: parseFloat(m.share) || 0 }));
    if (parsedMembers.length === 0) { toast.error("Add at least one member with a subaccount reference"); return; }
    if (parsedMembers.some((m) => !(m.share > 0))) { toast.error("Each member share must be greater than zero"); return; }
    if (form.type === "percentage") {
      const total = parsedMembers.reduce((s, m) => s + m.share, 0);
      if (Math.abs(total - 100) > 0.01) { toast.error(`Percentage shares must total 100 (currently ${total})`); return; }
    }
    if (form.bearerType === "subaccount" && !form.bearerSubaccountId.trim()) {
      toast.error("Bearer subaccount is required when bearer type is 'subaccount'");
      return;
    }
    createGroup.mutate({
      name: form.name.trim(),
      type: form.type,
      currency: form.currency,
      bearerType: form.bearerType,
      bearerSubaccountId: form.bearerSubaccountId.trim() || undefined,
      members: parsedMembers,
    });
  };

  const submitAddMember = () => {
    const share = parseFloat(newMember.share);
    if (!newMember.subaccountRef.trim() || !(share > 0)) { toast.error("Subaccount ref and a positive share are required"); return; }
    addMember.mutate({ groupId: addMemberTo.id ?? addMemberTo.groupId, subaccountRef: newMember.subaccountRef.trim(), share });
  };

  const runPreview = () => {
    const amountKobo = nairaToKobo(preview.amount);
    if (amountKobo <= 0) { toast.error("Enter a valid amount"); return; }
    previewSplit.mutate({ amountKobo, splitCode: preview.splitCode.trim() || undefined });
  };

  const previewLines: any[] = previewResult?.splits ?? previewResult?.members ?? previewResult?.lines ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Split Groups
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Split incoming payments across subaccounts by percentage or flat amounts</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Split Group
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Groups table */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border overflow-hidden self-start">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />)}
            </div>
          ) : groups.length === 0 ? (
            <div className="p-12 text-center">
              <Split className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No split groups yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create a group to start splitting settlements</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Split Code</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Members</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {groups.map((g: any) => (
                    <tr key={g.id ?? g.groupId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{g.name}</p>
                        <p className="text-xs text-muted-foreground">{g.currency ?? "NGN"} · bearer: {g.bearerType ?? "account"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{g.splitCode ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className="text-xs gap-1">
                          {g.type === "flat" ? <DollarSign className="w-3 h-3" /> : <Percent className="w-3 h-3" />}
                          {g.type ?? "percentage"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          {(g.members ?? []).map((m: any) => (
                            <div key={m.id ?? m.memberId ?? m.subaccountRef} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-muted-foreground">{m.subaccountRef ?? m.subaccount}</span>
                              <span className="text-foreground font-medium">{m.share}{g.type === "flat" ? " kobo" : "%"}</span>
                              <button
                                className="text-red-400/70 hover:text-red-400"
                                onClick={() => removeMember.mutate({ groupId: g.id ?? g.groupId, memberId: m.id ?? m.memberId })}
                                title="Remove member"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          {(g.members ?? []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Switch
                          checked={!!g.active}
                          onCheckedChange={(checked) => updateGroup.mutate({ id: g.id ?? g.groupId, active: checked })}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setAddMemberTo(g)}>
                          <UserPlus className="w-3 h-3" /> Add member
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Preview calculator */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4 self-start">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Split Preview</h2>
          </div>
          <p className="text-xs text-muted-foreground">See how a payment would be split before it happens.</p>
          <div className="space-y-2">
            <Label>Amount (₦)</Label>
            <Input inputMode="decimal" value={preview.amount} onChange={(e) => setPreview({ ...preview, amount: e.target.value })} placeholder="e.g. 50,000.00" />
          </div>
          <div className="space-y-2">
            <Label>Split Code</Label>
            <Input value={preview.splitCode} onChange={(e) => setPreview({ ...preview, splitCode: e.target.value })} placeholder="SPL_xxxx" />
          </div>
          <Button className="w-full gap-2" onClick={runPreview} disabled={previewSplit.isPending}>
            {previewSplit.isPending ? "Calculating…" : "Preview Split"}
          </Button>
          {previewResult && (
            <div className="border border-border rounded-lg divide-y divide-border">
              {previewLines.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">Full amount goes to the main account.</p>
              ) : previewLines.map((l: any, i: number) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{l.subaccountRef ?? l.subaccount ?? l.name ?? `Line ${i + 1}`}</span>
                  <span className="font-semibold">{formatNGN(l.amountKobo ?? l.amount ?? 0)}</span>
                </div>
              ))}
              {previewResult.feesKobo != null && (
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                  <span>Fees</span><span>{formatNGN(previewResult.feesKobo)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create group dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Split Group</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>Group Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="flat">Flat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["NGN", "USD", "GHS", "KES"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fees Bearer</Label>
              <Select value={form.bearerType} onValueChange={(v) => setForm({ ...form, bearerType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="account">Main account</SelectItem>
                  <SelectItem value="subaccount">Subaccount</SelectItem>
                  <SelectItem value="all-proportional">All (proportional)</SelectItem>
                  <SelectItem value="all">All (equal)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.bearerType === "subaccount" && (
              <div className="space-y-2">
                <Label>Bearer Subaccount ID *</Label>
                <Input value={form.bearerSubaccountId} onChange={(e) => setForm({ ...form, bearerSubaccountId: e.target.value })} />
              </div>
            )}
            <div className="col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label>Members * {form.type === "percentage" && <span className="text-muted-foreground font-normal">(shares must total 100%)</span>}</Label>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => setMembers([...members, { subaccountRef: "", share: "" }])}>
                  <Plus className="w-3 h-3" /> Add row
                </Button>
              </div>
              {members.map((m, i) => (
                <div key={i} className="flex gap-2">
                  <Input className="flex-1" placeholder="Subaccount ref (ACCT_xxx)" value={m.subaccountRef}
                    onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, subaccountRef: e.target.value } : x)))} />
                  <Input className="w-28" placeholder={form.type === "flat" ? "Kobo" : "Share %"} inputMode="decimal" value={m.share}
                    onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" onClick={() => setMembers(members.filter((_, j) => j !== i))} disabled={members.length === 1}>
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreate} disabled={createGroup.isPending}>
              {createGroup.isPending ? "Creating…" : "Create Group"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={!!addMemberTo} onOpenChange={(o) => { if (!o) setAddMemberTo(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Member — {addMemberTo?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Subaccount Reference *</Label>
              <Input value={newMember.subaccountRef} onChange={(e) => setNewMember({ ...newMember, subaccountRef: e.target.value })} placeholder="ACCT_xxx" />
            </div>
            <div className="space-y-2">
              <Label>Share {addMemberTo?.type === "flat" ? "(kobo)" : "(%)"} *</Label>
              <Input inputMode="decimal" value={newMember.share} onChange={(e) => setNewMember({ ...newMember, share: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setAddMemberTo(null)}>Cancel</Button>
            <Button onClick={submitAddMember} disabled={addMember.isPending}>
              {addMember.isPending ? "Adding…" : "Add Member"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
