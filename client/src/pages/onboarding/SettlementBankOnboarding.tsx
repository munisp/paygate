import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function SettlementBankOnboarding() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({
    nipEnabled: true, rtgsEnabled: false,
  });

  const { data: banks, refetch } = trpc.wave223.settlementBanks.list.useQuery();

  const createMutation = trpc.wave223.settlementBanks.create.useMutation({
    onSuccess: () => { toast.success("Settlement bank registered."); setOpen(false); setForm({ nipEnabled: true, rtgsEnabled: false }); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave223.settlementBanks.delete.useMutation({
    onSuccess: () => { toast.success("Bank removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = () => {
    if (!form.bankCode || !form.bankName || !form.nipCode) {
      toast.error("Fill required fields."); return;
    }
    createMutation.mutate({
      bankCode: form.bankCode as string,
      bankName: form.bankName as string,
      nipCode: form.nipCode as string,
      swiftCode: form.swiftCode as string | undefined,
      cbnLicenseNumber: form.cbnLicenseNumber as string | undefined,
      settlementAccountNumber: form.settlementAccountNumber as string | undefined,
      nipEnabled: !!form.nipEnabled,
      rtgsEnabled: !!form.rtgsEnabled,
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Landmark className="h-6 w-6 text-teal-500" /> Settlement Banks</h1>
          <p className="text-muted-foreground text-sm mt-1">Register commercial banks as settlement partners for interbank clearing</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Register Bank</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>NIP Code</TableHead>
                <TableHead>SWIFT</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>RTGS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!banks?.length && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">No settlement banks registered yet.</TableCell></TableRow>
              )}
              {banks?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.bankCode}</TableCell>
                  <TableCell className="font-medium">{b.bankName}</TableCell>
                  <TableCell className="font-mono">{b.nipCode}</TableCell>
                  <TableCell className="font-mono text-muted-foreground">{b.swiftCode ?? "—"}</TableCell>
                  <TableCell><Badge variant={b.nipEnabled ? "default" : "secondary"}>{b.nipEnabled ? "Yes" : "No"}</Badge></TableCell>
                  <TableCell><Badge variant={b.rtgsEnabled ? "default" : "secondary"}>{b.rtgsEnabled ? "Yes" : "No"}</Badge></TableCell>
                  <TableCell><Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: b.id })} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            <div className="space-y-2">
              <Label>Bank Code <span className="text-destructive">*</span></Label>
              <Input placeholder="011" value={form.bankCode as string ?? ""} onChange={(e) => set("bankCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bank Name <span className="text-destructive">*</span></Label>
              <Input placeholder="First Bank of Nigeria" value={form.bankName as string ?? ""} onChange={(e) => set("bankName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>NIP Code <span className="text-destructive">*</span></Label>
              <Input placeholder="000016" value={form.nipCode as string ?? ""} onChange={(e) => set("nipCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>SWIFT Code</Label>
              <Input placeholder="FBNINGLA" value={form.swiftCode as string ?? ""} onChange={(e) => set("swiftCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CBN License Number</Label>
              <Input placeholder="CBN/FBN/2024/001" value={form.cbnLicenseNumber as string ?? ""} onChange={(e) => set("cbnLicenseNumber", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Settlement Account</Label>
              <Input placeholder="10-digit NUBAN" maxLength={10} value={form.settlementAccountNumber as string ?? ""} onChange={(e) => set("settlementAccountNumber", e.target.value)} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label className="cursor-pointer">NIP Enabled</Label>
              <Switch checked={!!form.nipEnabled} onCheckedChange={(c) => set("nipEnabled", c)} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label className="cursor-pointer">RTGS Enabled</Label>
              <Switch checked={!!form.rtgsEnabled} onCheckedChange={(c) => set("rtgsEnabled", c)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Register Bank"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
