import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, RefreshCw, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SettlementBankManagement() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: banks, refetch, isLoading } = trpc.wave223.settlementBanks.list.useQuery();
  const createMutation = trpc.wave223.settlementBanks.create.useMutation({
    onSuccess: () => { toast.success("Settlement bank registered."); setOpen(false); setForm({}); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.wave223.settlementBanks.delete.useMutation({
    onSuccess: () => { toast.success("Bank removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const activateMutation = trpc.wave223.settlementBanks.setActive.useMutation({
    onSuccess: () => { toast.success("Bank status updated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-indigo-500" /> Settlement Bank Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure settlement banks for NextHub multilateral net settlement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Bank</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Name</TableHead>
                <TableHead>Bank Code</TableHead>
                <TableHead>Swift / BIC</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Settlement Window</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && !banks?.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No settlement banks configured.</TableCell></TableRow>}
              {banks?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.bankName}</TableCell>
                  <TableCell className="font-mono text-sm">{b.bankCode}</TableCell>
                  <TableCell className="font-mono text-sm">{b.swiftCode ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{b.accountNumber}</TableCell>
                  <TableCell><Badge variant="outline">{b.currency}</Badge></TableCell>
                  <TableCell className="text-sm">{b.settlementWindowHours ? `${b.settlementWindowHours}h` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={b.isActive ? "default" : "secondary"}>{b.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => activateMutation.mutate({ id: b.id, isActive: !b.isActive })}>
                        {b.isActive ? <XCircle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: b.id })} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Register Settlement Bank</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2 col-span-2"><Label>Bank Name <span className="text-destructive">*</span></Label><Input placeholder="e.g. First Bank of Nigeria" value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} /></div>
            <div className="space-y-2"><Label>Bank Code <span className="text-destructive">*</span></Label><Input placeholder="e.g. 011" value={form.bankCode ?? ""} onChange={(e) => set("bankCode", e.target.value)} /></div>
            <div className="space-y-2"><Label>Swift / BIC</Label><Input placeholder="e.g. FBNINGLA" value={form.swiftCode ?? ""} onChange={(e) => set("swiftCode", e.target.value)} /></div>
            <div className="space-y-2"><Label>Account Number <span className="text-destructive">*</span></Label><Input placeholder="10-digit NUBAN" value={form.accountNumber ?? ""} onChange={(e) => set("accountNumber", e.target.value)} /></div>
            <div className="space-y-2"><Label>Currency <span className="text-destructive">*</span></Label>
              <Select value={form.currency ?? ""} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["NGN", "USD", "EUR", "GBP", "GHS", "KES", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Settlement Window (hours)</Label><Input type="number" placeholder="e.g. 24" value={form.settlementWindowHours ?? ""} onChange={(e) => set("settlementWindowHours", e.target.value)} /></div>
            <div className="space-y-2"><Label>Contact Email</Label><Input type="email" placeholder="ops@bank.com" value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate({ bankName: form.bankName, bankCode: form.bankCode, swiftCode: form.swiftCode, accountNumber: form.accountNumber, currency: form.currency, settlementWindowHours: form.settlementWindowHours ? parseInt(form.settlementWindowHours) : undefined, contactEmail: form.contactEmail })} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Registering…" : "Register Bank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
