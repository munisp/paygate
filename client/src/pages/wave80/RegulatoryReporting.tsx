import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, CheckCircle, AlertCircle, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function RegulatoryReporting() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ reportType: "CBN_RETURNS", period: "", regulator: "CBN" });

  const { data, isLoading, refetch } = trpc.wave80.regulatoryReporting.listReports.useQuery({});
  const { data: stats } = trpc.wave80.regulatoryReporting.getStats.useQuery();

  const createReport = trpc.wave80.regulatoryReporting.createReport.useMutation({
    onSuccess: () => { toast.success("Report created"); setCreateOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const submitReport = trpc.wave80.regulatoryReporting.submitReport.useMutation({
    onSuccess: () => { toast.success("Report submitted"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const reports = data?.reports ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Regulatory Reporting</h1><p className="text-muted-foreground">CBN, NDIC, and FIRS regulatory submissions</p></div>
        <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" />New Report</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><FileText className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Reports</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.submitted ?? 0}</p><p className="text-sm text-muted-foreground">Submitted</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><AlertCircle className="w-8 h-8 text-orange-500" /><div><p className="text-2xl font-bold">{stats?.pending ?? 0}</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Reports</CardTitle></CardHeader><CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        reports.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No regulatory reports yet.</p></div> : (
          <div className="space-y-3">{reports.map(r => (
            <div key={r.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium">{r.reportType} - {r.period}</p><p className="text-sm text-muted-foreground">{r.regulator} | Submitted: {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "Pending"}</p></div>
              <div className="flex items-center gap-3">
                <Badge variant={r.status === "submitted" ? "default" : r.status === "overdue" ? "destructive" : "secondary"}>{r.status}</Badge>
                {r.status === "draft" && <Button size="sm" onClick={() => submitReport.mutate({ reportId: r.id })}>Submit</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Regulatory Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Report Type</Label>
              <Select value={form.reportType} onValueChange={v => setForm(p => ({ ...p, reportType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CBN_RETURNS">CBN Returns</SelectItem>
                  <SelectItem value="NDIC_DEPOSIT">NDIC Deposit</SelectItem>
                  <SelectItem value="FIRS_VAT">FIRS VAT</SelectItem>
                  <SelectItem value="AML_STR">AML STR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Period</Label><Input value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))} placeholder="e.g. Q1 2026" /></div>
            <div className="space-y-2"><Label>Regulator</Label>
              <Select value={form.regulator} onValueChange={v => setForm(p => ({ ...p, regulator: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CBN">CBN</SelectItem>
                  <SelectItem value="NDIC">NDIC</SelectItem>
                  <SelectItem value="FIRS">FIRS</SelectItem>
                  <SelectItem value="NFIU">NFIU</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createReport.mutate({ reportType: form.reportType, period: form.period, regulator: form.regulator })} disabled={createReport.isPending}>{createReport.isPending ? "Creating..." : "Create Report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
