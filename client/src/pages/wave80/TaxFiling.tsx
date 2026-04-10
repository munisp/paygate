import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle, AlertCircle, Calendar, Upload } from "lucide-react";
import { trpc5 } from "@/lib/trpc5";
import { toast } from "sonner";

export default function TaxFiling() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ taxType: "VAT", period: "", taxableAmount: "" });

  const { data, isLoading, refetch } = trpc5.taxFiling.listFilings.useQuery({});
  const { data: stats } = trpc5.taxFiling.getStats.useQuery();
  const { data: deadlines } = trpc5.taxFiling.getUpcomingDeadlines.useQuery();

  const createFiling = trpc5.taxFiling.createFiling.useMutation({
    onSuccess: () => { toast.success("Filing created"); setCreateOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const submitFiling = trpc5.taxFiling.submitFiling.useMutation({
    onSuccess: (data) => { toast.success("Filed! Receipt: " + data.receiptNumber); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const filings = data?.filings ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Tax Filing Integration</h1><p className="text-muted-foreground">FIRS e-filing, VAT, WHT, and CIT management</p></div>
        <Button onClick={() => setCreateOpen(true)}><Upload className="w-4 h-4 mr-2" />File Return</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.filed ?? 0}</p><p className="text-sm text-muted-foreground">Filed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">{stats?.draft ?? 0}</p><p className="text-sm text-muted-foreground">Pending Returns</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Calendar className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{deadlines?.deadlines?.[0] ? new Date(deadlines.deadlines[0].dueDate!).toLocaleDateString("en-NG", { month: "short", day: "numeric" }) : "None"}</p><p className="text-sm text-muted-foreground">Next Deadline</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Tax Filings</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        filings.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No filings yet. Create your first tax return.</p></div> : (
          <div className="space-y-3">{filings.map(f => (
            <div key={f.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{f.taxType} Return - {f.period}</p><p className="text-sm text-muted-foreground">Tax: &#8358;{(f.taxAmount / 100).toLocaleString()}</p></div>
              <div className="flex items-center gap-3">
                <Badge variant={f.status === "filed" ? "default" : f.status === "overdue" ? "destructive" : "secondary"}>{f.status}</Badge>
                {f.status === "draft" && <Button size="sm" onClick={() => submitFiling.mutate({ filingId: f.id })}>File Now</Button>}
                {f.receiptNumber && <p className="text-xs text-muted-foreground">{f.receiptNumber}</p>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Tax Return</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Tax Type</Label>
              <Select value={form.taxType} onValueChange={v => setForm(p => ({ ...p, taxType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="VAT">VAT</SelectItem><SelectItem value="WHT">WHT</SelectItem><SelectItem value="CIT">CIT</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} placeholder="e.g. April 2026" /></div>
            <div className="space-y-2"><Label>Taxable Amount (kobo)</Label><Input type="number" value={form.taxableAmount} onChange={e => setForm(p => ({ ...p, taxableAmount: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createFiling.mutate({ taxType: form.taxType, period: form.period, taxableAmount: parseInt(form.taxableAmount) })} disabled={createFiling.isPending}>{createFiling.isPending ? "Creating..." : "Create Filing"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
