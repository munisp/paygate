import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Receipt, Plus, FileCheck, DollarSign, Loader2 } from "lucide-react";

export default function TaxFilingV2() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ taxType: "vat", period: "", taxableAmount: "", taxAmount: "" });

  const { data, isLoading } = trpc.taxFilingV2.list.useQuery({ page }, { staleTime: 30_000 });

  const create = trpc.taxFilingV2.create.useMutation({
    onSuccess: () => { utils.taxFilingV2.list.invalidate(); setAddOpen(false); toast({ title: "Tax filing created" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const file = trpc.taxFilingV2.file.useMutation({
    onSuccess: () => { utils.taxFilingV2.list.invalidate(); toast({ title: "Filing submitted" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const markPaid = trpc.taxFilingV2.markPaid.useMutation({
    onSuccess: () => { utils.taxFilingV2.list.invalidate(); toast({ title: "Marked as paid" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filings = data?.records ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6" /> Tax Filing V2</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage VAT, WHT, and other tax filings</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />New Filing</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Tax Filing</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Tax Type</Label>
                <Select value={form.taxType} onValueChange={v => setForm(f => ({ ...f, taxType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vat">VAT</SelectItem>
                    <SelectItem value="wht">WHT</SelectItem>
                    <SelectItem value="cit">CIT</SelectItem>
                    <SelectItem value="paye">PAYE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Period (e.g. 2025-Q1)</Label><Input value={form.period} onChange={e => setForm(f => ({ ...f, period: e.target.value }))} placeholder="2025-Q1" /></div>
              <div><Label>Taxable Amount (NGN)</Label><Input type="number" value={form.taxableAmount} onChange={e => setForm(f => ({ ...f, taxableAmount: e.target.value }))} placeholder="1000000" /></div>
              <div><Label>Tax Amount (NGN)</Label><Input type="number" value={form.taxAmount} onChange={e => setForm(f => ({ ...f, taxAmount: e.target.value }))} placeholder="75000" /></div>
              <Button className="w-full" disabled={create.isPending} onClick={() => create.mutate({ ...form, taxableAmount: Number(form.taxableAmount), taxAmount: Number(form.taxAmount) })}>
                {create.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Create Filing
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Filings</p><p className="text-2xl font-bold">{data?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold text-yellow-600">{filings.filter((f: any) => f.status === "draft").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Filed</p><p className="text-2xl font-bold text-blue-600">{filings.filter((f: any) => f.status === "filed").length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Paid</p><p className="text-2xl font-bold text-green-600">{filings.filter((f: any) => f.status === "paid").length}</p></CardContent></Card>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div> :
        filings.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No tax filings yet.</CardContent></Card> :
        <div className="space-y-2">
          {filings.map((f: any) => (
            <Card key={f.id}><CardContent className="py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline">{f.taxType?.toUpperCase()}</Badge>
                  <Badge variant={f.status === "paid" ? "default" : "secondary"}>{f.status}</Badge>
                  <span className="text-xs text-muted-foreground">{f.period}</span>
                </div>
                <p className="text-xs text-muted-foreground">Taxable: ₦{Number(f.taxableAmount ?? 0).toLocaleString()} · Tax: ₦{Number(f.taxAmount ?? 0).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                {f.status === "draft" && <Button size="sm" variant="outline" onClick={() => file.mutate({ id: f.id })}><FileCheck className="w-3.5 h-3.5 mr-1" />File</Button>}
                {f.status === "filed" && <Button size="sm" onClick={() => markPaid.mutate({ id: f.id })}><DollarSign className="w-3.5 h-3.5 mr-1" />Mark Paid</Button>}
              </div>
            </CardContent></Card>
          ))}
        </div>
      }
    </div>
  );
}
