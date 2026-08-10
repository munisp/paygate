/**
 * Wave 175 — SCUML Status Card
 * Shows SCUML registration status and allows initiating a new check.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShieldCheck, ShieldAlert, Clock, AlertTriangle, Loader2, RefreshCw } from "lucide-react";

export default function SCUMLStatus() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ entityName: "", rcNumber: "", checkType: "registration" as const });

  const { data, isLoading } = trpc.scuml.list.useQuery({ page: 1, limit: 5 });
  const { data: expiring } = trpc.scuml.expiringSoon.useQuery({ daysAhead: 30 });

  const initiateMutation = trpc.scuml.initiate.useMutation({
    onSuccess: (result) => {
      toast[result.status === "cleared" ? "success" : "error"](
        result.status === "cleared"
          ? `SCUML cleared — Ref: ${result.scumlRef}`
          : `SCUML flagged: ${result.flagReason ?? "Manual review required"}`
      );
      utils.scuml.list.invalidate();
      utils.scuml.expiringSoon.invalidate();
      setOpen(false);
      setForm({ entityName: "", rcNumber: "", checkType: "registration" });
    },
    onError: (e) => toast.error(e.message),
  });

  const latest = data?.checks?.[0];

  const statusIcon = (status: string) => {
    if (status === "cleared") return <ShieldCheck className="w-4 h-4 text-green-500" />;
    if (status === "flagged") return <ShieldAlert className="w-4 h-4 text-red-500" />;
    if (status === "pending") return <Clock className="w-4 h-4 text-amber-500" />;
    return <AlertTriangle className="w-4 h-4 text-muted-foreground" />;
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, any> = {
      cleared: "default",
      flagged: "destructive",
      pending: "secondary",
      error: "outline",
    };
    return <Badge variant={variants[status] ?? "outline"} className="capitalize">{status}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4" />
            SCUML Compliance
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <RefreshCw className="w-3 h-3 mr-1" /> New Check
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {expiring && expiring.length > 0 && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs">
              <AlertTriangle className="w-3 h-3" />
              {expiring.length} SCUML registration(s) expiring within 30 days
            </div>
          )}

          {isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
          ) : !data?.checks.length ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No SCUML checks yet. Initiate a check to verify AML/CFT compliance.
            </div>
          ) : (
            <div className="space-y-2">
              {data.checks.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusIcon(c.status ?? "pending")}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{c.entityName}</span>
                        {statusBadge(c.status ?? "pending")}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                        {c.scumlRef && <span>Ref: {c.scumlRef}</span>}
                        {c.rcNumber && <span>RC: {c.rcNumber}</span>}
                        {c.expiresAt && (
                          <span>Expires: {new Date(c.expiresAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      {c.flagReason && (
                        <p className="text-xs text-red-500 mt-0.5">{c.flagReason}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Initiate SCUML Check</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Business / Entity Name *</Label>
              <Input
                placeholder="Registered business name"
                value={form.entityName}
                onChange={(e) => setForm(f => ({ ...f, entityName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>RC Number (optional)</Label>
              <Input
                placeholder="CAC registration number"
                value={form.rcNumber}
                onChange={(e) => setForm(f => ({ ...f, rcNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Check Type</Label>
              <Select value={form.checkType} onValueChange={(v: any) => setForm(f => ({ ...f, checkType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="registration">New Registration</SelectItem>
                  <SelectItem value="renewal">Annual Renewal</SelectItem>
                  <SelectItem value="amendment">Amendment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => initiateMutation.mutate(form)}
              disabled={initiateMutation.isPending || !form.entityName.trim()}
            >
              {initiateMutation.isPending ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Checking…</>
              ) : "Initiate Check"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
