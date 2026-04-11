import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, DollarSign, Clock, CheckCircle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function InvoiceFinancingV2() {
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ invoiceAmount: "", requestedAmount: "", tenorDays: "30" });

  const { data, isLoading, refetch } = trpc.wave80.invoiceFinancingV2.listApplications.useQuery({});
  const { data: stats } = trpc.wave80.invoiceFinancingV2.getStats.useQuery();
  const { data: eligibility } = trpc.wave80.invoiceFinancingV2.getEligibility.useQuery();

  const apply = trpc.wave80.invoiceFinancingV2.applyForFinancing.useMutation({
    onSuccess: () => { toast.success("Application submitted"); setApplyOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const cancel = trpc.wave80.invoiceFinancingV2.cancelApplication.useMutation({
    onSuccess: () => { toast.success("Application cancelled"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const apps = data?.applications ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Invoice Financing V2</h1><p className="text-muted-foreground">Get advance financing on your invoices</p></div>
        <Button onClick={() => setApplyOpen(true)} disabled={!eligibility?.eligible}><Plus className="w-4 h-4 mr-2" />Submit Invoice</Button>
      </div>
      {eligibility && <div className="p-4 bg-muted rounded-lg text-sm"><span className="font-medium">Eligibility: </span>{eligibility.eligible ? "Eligible for financing" : "Not eligible"}</div>}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Applications</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><DollarSign className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalDisbursed ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Financed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{stats?.pending ?? 0}</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{stats?.disbursed ?? 0}</p><p className="text-sm text-muted-foreground">Disbursed</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Applications</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        apps.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No applications yet.</p></div> : (
          <div className="space-y-3">{apps.map(a => (
            <div key={a.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">Invoice: &#8358;{(a.invoiceAmount / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Requested: &#8358;{(a.requestedAmount / 100).toLocaleString()} | {a.tenorDays}d tenor</p></div>
              <div className="flex items-center gap-3">
                <Badge variant={a.status === "disbursed" ? "default" : a.status === "approved" ? "secondary" : "outline"}>{a.status}</Badge>
                {a.status === "pending" && <Button size="sm" variant="outline" onClick={() => cancel.mutate({ appId: a.id })}>Cancel</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for Invoice Financing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Invoice Amount (kobo)</Label><Input type="number" value={form.invoiceAmount} onChange={e => setForm(p => ({ ...p, invoiceAmount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Requested Amount (kobo)</Label><Input type="number" value={form.requestedAmount} onChange={e => setForm(p => ({ ...p, requestedAmount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Tenor (days)</Label><Input type="number" value={form.tenorDays} onChange={e => setForm(p => ({ ...p, tenorDays: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button onClick={() => apply.mutate({ invoiceAmount: parseInt(form.invoiceAmount), requestedAmount: parseInt(form.requestedAmount), tenorDays: parseInt(form.tenorDays) })} disabled={apply.isPending}>{apply.isPending ? "Submitting..." : "Submit Application"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
