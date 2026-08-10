/**
 * Wave 174 — UBO Manager
 * Manage Ultimate Beneficial Owners for a KYB verification.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, Plus, Trash2, AlertTriangle, CheckCircle } from "lucide-react";

interface Props {
  verificationId: string;
}

export default function UBOManager({ verificationId }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", bvn: "", ownershipPct: "", isPep: false });

  const utils = trpc.useUtils();
  const { data: ubos = [], isLoading } = trpc.uboMgmt.list.useQuery({ verificationId });
  const { data: summary } = trpc.uboMgmt.ownershipSummary.useQuery({ verificationId });

  const addMutation = trpc.uboMgmt.add.useMutation({
    onSuccess: () => {
      toast.success("UBO added successfully");
      utils.uboMgmt.list.invalidate();
      utils.uboMgmt.ownershipSummary.invalidate();
      setOpen(false);
      setForm({ fullName: "", bvn: "", ownershipPct: "", isPep: false });
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.uboMgmt.remove.useMutation({
    onSuccess: () => {
      toast.success("UBO removed");
      utils.uboMgmt.list.invalidate();
      utils.uboMgmt.ownershipSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleAdd = () => {
    const pct = parseFloat(form.ownershipPct);
    if (!form.fullName.trim() || isNaN(pct) || pct <= 0 || pct > 100) {
      toast.error("Please fill in all required fields correctly");
      return;
    }
    addMutation.mutate({
      verificationId,
      fullName: form.fullName.trim(),
      bvn: form.bvn.trim() || undefined,
      ownershipPct: pct,
      isPep: form.isPep,
    });
  };

  const totalOwnership = summary?.totalOwnership ?? 0;
  const isComplete = totalOwnership >= 75; // FATF recommends capturing ≥25% threshold

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" />
          Ultimate Beneficial Owners
        </CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="w-3 h-3 mr-1" /> Add UBO
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary bar */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">Total ownership captured</span>
              <span className="font-medium">{totalOwnership.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${totalOwnership >= 75 ? "bg-green-500" : "bg-amber-500"}`}
                style={{ width: `${Math.min(100, totalOwnership)}%` }}
              />
            </div>
          </div>
          {isComplete ? (
            <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          )}
        </div>

        {summary && summary.pepCount > 0 && (
          <div className="flex items-center gap-2 p-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
            <AlertTriangle className="w-3 h-3" />
            {summary.pepCount} Politically Exposed Person(s) — enhanced due diligence required
          </div>
        )}

        {/* UBO list */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
        ) : ubos.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            No UBOs added yet. Add all persons owning ≥25% of the business.
          </div>
        ) : (
          <div className="space-y-2">
            {ubos.map((ubo) => (
              <div key={ubo.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{ubo.fullName}</span>
                    {ubo.isPep && <Badge variant="destructive" className="text-xs">PEP</Badge>}
                    {ubo.adverseMediaFlagged && <Badge variant="destructive" className="text-xs">Adverse Media</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{ubo.ownershipPct.toFixed(1)}% ownership</span>
                    {ubo.bvn && <span>BVN: {ubo.bvn.slice(0, 4)}•••••••</span>}
                    <Badge variant={ubo.kycStatus === "approved" ? "default" : ubo.kycStatus === "rejected" ? "destructive" : "secondary"} className="text-xs">
                      KYC: {ubo.kycStatus}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="ghost" size="icon"
                  className="text-destructive hover:text-destructive h-7 w-7"
                  onClick={() => removeMutation.mutate({ id: ubo.id })}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Add UBO Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Ultimate Beneficial Owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full Legal Name *</Label>
              <Input
                placeholder="As on government ID"
                value={form.fullName}
                onChange={(e) => setForm(f => ({ ...f, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>BVN (optional)</Label>
              <Input
                placeholder="11-digit BVN"
                maxLength={11}
                value={form.bvn}
                onChange={(e) => setForm(f => ({ ...f, bvn: e.target.value.replace(/\D/g, "") }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ownership Percentage *</Label>
              <Input
                type="number" min="0.01" max="100" step="0.01"
                placeholder="e.g. 30.5"
                value={form.ownershipPct}
                onChange={(e) => setForm(f => ({ ...f, ownershipPct: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Remaining: {Math.max(0, 100 - totalOwnership).toFixed(1)}%
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Politically Exposed Person (PEP)</Label>
                <p className="text-xs text-muted-foreground">Current or former government official</p>
              </div>
              <Switch
                checked={form.isPep}
                onCheckedChange={(v) => setForm(f => ({ ...f, isPep: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Adding…" : "Add UBO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
