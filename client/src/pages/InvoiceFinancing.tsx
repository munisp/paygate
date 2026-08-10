import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FileText, Plus, RefreshCw, CheckCircle, XCircle } from "lucide-react";

export default function InvoiceFinancing() {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ invoiceAmount: 0, requestedAmount: 0, interestRate: "3.5", tenorDays: 30 });

  const { data, isLoading, refetch } = trpc.invoiceFinV2.list.useQuery({ page, limit: 20, status }, { staleTime: 30_000 });
  const applyMutation = trpc.invoiceFinV2.submitApplication.useMutation({
    onSuccess: () => { toast.success("Application submitted"); setApplyOpen(false); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const approveMutation = trpc.invoiceFinV2.approve.useMutation({
    onSuccess: () => { toast.success("Application approved"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const disburseMutation = trpc.invoiceFinV2.disburse.useMutation({
    onSuccess: () => { toast.success("Funds disbursed"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const applications = data?.applications ?? [];
  const total = data?.total ?? 0;
  const statusColors: Record<string, any> = {
    pending: "outline", approved: "default", rejected: "destructive", disbursed: "secondary", repaid: "secondary"
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoice Financing</h1>
          <p className="text-sm text-muted-foreground mt-1">Apply for working capital financing against outstanding invoices</p>
        </div>
        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Apply for Financing</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Invoice Financing Application</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Invoice Amount (₦)</Label>
                <Input type="number" value={form.invoiceAmount} onChange={e => setForm(f => ({ ...f, invoiceAmount: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Requested Amount (₦)</Label>
                <Input type="number" value={form.requestedAmount} onChange={e => setForm(f => ({ ...f, requestedAmount: Number(e.target.value) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Interest Rate (%)</Label>
                  <Input value={form.interestRate} onChange={e => setForm(f => ({ ...f, interestRate: e.target.value }))} />
                </div>
                <div>
                  <Label>Tenor (days)</Label>
                  <Input type="number" value={form.tenorDays} onChange={e => setForm(f => ({ ...f, tenorDays: Number(e.target.value) }))} />
                </div>
              </div>
              <Button className="w-full" onClick={() => applyMutation.mutate({
                ...form,
                invoiceAmount: form.invoiceAmount * 100,
                requestedAmount: form.requestedAmount * 100,
              })} disabled={applyMutation.isPending}>
                {applyMutation.isPending ? "Submitting…" : "Submit Application"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Applications", value: total },
          { label: "Pending Review", value: applications.filter((a: any) => a.status === "pending").length },
          { label: "Approved / Disbursed", value: applications.filter((a: any) => a.status === "approved" || a.status === "disbursed").length },
        ].map(s => (
          <Card key={s.label}><CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="pt-4">
        <div className="flex gap-3">
          <Select value={status ?? "all"} onValueChange={v => { setStatus(v === "all" ? undefined : v); setPage(1); }}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {["pending", "approved", "rejected", "disbursed", "repaid"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/></Button>
        </div>
      </CardContent></Card>

      <Card>
        <CardHeader><CardTitle>Applications ({total})</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}</div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No financing applications found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-3 px-2">ID</th>
                    <th className="text-right py-3 px-2">Invoice Amount</th>
                    <th className="text-right py-3 px-2">Requested</th>
                    <th className="text-right py-3 px-2">Rate</th>
                    <th className="text-right py-3 px-2">Tenor</th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Applied</th>
                    <th className="text-right py-3 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map((a: any) => (
                    <tr key={a.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-2 font-mono text-xs">{a.id?.slice(0, 10)}…</td>
                      <td className="py-3 px-2 text-right">₦{((a.invoiceAmount ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right">₦{((a.requestedAmount ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-3 px-2 text-right">{a.interestRate}%</td>
                      <td className="py-3 px-2 text-right">{a.tenorDays}d</td>
                      <td className="py-3 px-2"><Badge variant={statusColors[a.status] ?? "outline"}>{a.status}</Badge></td>
                      <td className="py-3 px-2 text-sm">{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</td>
                      <td className="py-3 px-2 text-right">
                        {a.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="text-green-600" onClick={() => approveMutation.mutate({ id: a.id, approvedAmount: a.requestedAmount })}>
                              <CheckCircle className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="text-blue-600" onClick={() => disburseMutation.mutate({ id: a.id })}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
