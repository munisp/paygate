import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Shield, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function RegulatorOnboarding() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: regulators, refetch } = trpc.wave223.regulators.list.useQuery();

  const createMutation = trpc.wave223.regulators.create.useMutation({
    onSuccess: () => { toast.success("Regulator onboarded."); setOpen(false); setForm({}); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave223.regulators.delete.useMutation({
    onSuccess: () => { toast.success("Regulator deactivated."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleCreate = () => {
    if (!form.regulatorCode || !form.regulatorName || !form.regulatoryType) {
      toast.error("Fill required fields."); return;
    }
    createMutation.mutate({
      regulatorCode: form.regulatorCode,
      regulatorName: form.regulatorName,
      jurisdiction: form.jurisdiction ?? "NG",
      regulatoryType: form.regulatoryType as any,
      contactEmail: form.contactEmail,
      reportingFrequency: (form.reportingFrequency ?? "daily") as any,
      dataAccessLevel: (form.dataAccessLevel ?? "aggregate") as any,
      apiEndpoint: form.apiEndpoint,
      webhookUrl: form.webhookUrl,
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="h-6 w-6 text-red-500" /> Regulator Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Onboard and manage regulatory observers (CBN, SEC, NDIC)</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Regulator</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Data Access</TableHead>
                <TableHead>Reporting</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!regulators?.length && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">No regulators onboarded yet.</TableCell></TableRow>
              )}
              {regulators?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm">{r.regulatorCode}</TableCell>
                  <TableCell className="font-medium">{r.regulatorName}</TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{r.regulatoryType?.replace(/_/g, ' ')}</Badge></TableCell>
                  <TableCell className="capitalize">{r.dataAccessLevel}</TableCell>
                  <TableCell className="capitalize">{r.reportingFrequency}</TableCell>
                  <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: r.id })} className="text-destructive hover:text-destructive">
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
          <DialogHeader><DialogTitle>Onboard New Regulator</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Regulator Code <span className="text-destructive">*</span></Label>
              <Input placeholder="CBN" value={form.regulatorCode ?? ""} onChange={(e) => set("regulatorCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Regulator Name <span className="text-destructive">*</span></Label>
              <Input placeholder="Central Bank of Nigeria" value={form.regulatorName ?? ""} onChange={(e) => set("regulatorName", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={form.regulatoryType ?? ""} onValueChange={(v) => set("regulatoryType", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="central_bank">Central Bank</SelectItem>
                  <SelectItem value="securities_regulator">Securities Regulator</SelectItem>
                  <SelectItem value="deposit_insurer">Deposit Insurer</SelectItem>
                  <SelectItem value="financial_intelligence">Financial Intelligence Unit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data Access Level</Label>
              <Select value={form.dataAccessLevel ?? "aggregate"} onValueChange={(v) => set("dataAccessLevel", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aggregate">Aggregate (default)</SelectItem>
                  <SelectItem value="anonymized">Anonymized</SelectItem>
                  <SelectItem value="full">Full (requires approval)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reporting Frequency</Label>
              <Select value={form.reportingFrequency ?? "daily"} onValueChange={(v) => set("reportingFrequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realtime">Real-time</SelectItem>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <Input type="email" placeholder="tech@regulator.gov.ng" value={form.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>API Endpoint (optional)</Label>
              <Input placeholder="https://api.cbn.gov.ng/reporting" value={form.apiEndpoint ?? ""} onChange={(e) => set("apiEndpoint", e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Webhook URL (optional)</Label>
              <Input placeholder="https://hooks.cbn.gov.ng/paygate" value={form.webhookUrl ?? ""} onChange={(e) => set("webhookUrl", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving…" : "Onboard Regulator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
