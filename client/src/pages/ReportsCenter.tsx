import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ReportFormat = "csv" | "pdf" | "xlsx";

export default function ReportsCenter() {
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split("T")[0]);
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [scheduleEmail, setScheduleEmail] = useState("");
  const [scheduleFreq, setScheduleFreq] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [scheduleType, setScheduleType] = useState<"transactions" | "settlements" | "customers" | "tax">("transactions");

  const { data: history } = trpc4.reports.listReports.useQuery({ page: 1, limit: 20 });
  const { data: scheduled } = trpc4.reports.getScheduledReports.useQuery();

  const txReportMutation = trpc4.reports.generateTransactionReport.useMutation({
    onSuccess: (d) => { toast.success(`Report ready (${d.rowCount} rows)`); window.open(d.downloadUrl, "_blank"); },
    onError: (e) => toast.error(e.message),
  });
  const settlementReportMutation = trpc4.reports.generateSettlementReport.useMutation({
    onSuccess: (d) => { toast.success(`Settlement report ready`); window.open(d.downloadUrl, "_blank"); },
    onError: (e) => toast.error(e.message),
  });
  const taxReportMutation = trpc4.reports.generateTaxReport.useMutation({
    onSuccess: (d) => { toast.success(`Tax report ready — VAT: ₦${(d.totalVatKobo / 100).toLocaleString()}`); window.open(d.downloadUrl, "_blank"); },
    onError: (e) => toast.error(e.message),
  });
  const scheduleMutation = trpc4.reports.createScheduledReport.useMutation({
    onSuccess: (d: { scheduleId: string; nextRunAt: string; status: string }) => toast.success(`Scheduled: next run ${new Date(d.nextRunAt).toLocaleDateString()}`),
    onError: (e) => toast.error(e.message),
  });

  const formatColors: Record<string, string> = { csv: "bg-green-100 text-green-700", pdf: "bg-red-100 text-red-700", xlsx: "bg-blue-100 text-blue-700" };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Reports Center</h1>

      {/* Generate Reports */}
      <Card>
        <CardHeader><CardTitle>Generate Report</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">From</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><label className="text-xs text-muted-foreground">To</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Format</label>
              <div className="flex gap-1 mt-1">
                {(["csv", "pdf", "xlsx"] as ReportFormat[]).map(f => (
                  <Button key={f} size="sm" variant={format === f ? "default" : "outline"} onClick={() => setFormat(f)} className="uppercase text-xs">{f}</Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button disabled={txReportMutation.isPending}
              onClick={() => txReportMutation.mutate({ from, to, format })}>
              {txReportMutation.isPending ? "Generating..." : "Transaction Report"}
            </Button>
            <Button variant="outline" disabled={settlementReportMutation.isPending}
              onClick={() => settlementReportMutation.mutate({ from, to, format })}>
              {settlementReportMutation.isPending ? "Generating..." : "Settlement Report"}
            </Button>
            <Button variant="outline" disabled={taxReportMutation.isPending}
              onClick={() => taxReportMutation.mutate({ year: new Date(from).getFullYear(), format })}>
              {taxReportMutation.isPending ? "Generating..." : "Tax Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Reports */}
      <Card>
        <CardHeader><CardTitle>Schedule Automated Reports</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Report Type</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={scheduleType} onChange={e => setScheduleType(e.target.value as typeof scheduleType)}>
                <option value="transactions">Transactions</option>
                <option value="settlements">Settlements</option>
                <option value="customers">Customers</option>
                <option value="tax">Tax</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Frequency</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={scheduleFreq} onChange={e => setScheduleFreq(e.target.value as typeof scheduleFreq)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Format</label>
              <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={format} onChange={e => setFormat(e.target.value as ReportFormat)}>
                <option value="csv">CSV</option>
                <option value="pdf">PDF</option>
                <option value="xlsx">Excel</option>
              </select>
            </div>
            <div><label className="text-xs text-muted-foreground">Email</label><Input value={scheduleEmail} onChange={e => setScheduleEmail(e.target.value)} placeholder="reports@company.com" /></div>
          </div>
          <Button disabled={scheduleMutation.isPending}
            onClick={() => scheduleMutation.mutate({ reportType: scheduleType, format, frequency: scheduleFreq, email: scheduleEmail })}>
            {scheduleMutation.isPending ? "Scheduling..." : "Schedule Report"}
          </Button>

          {scheduled?.schedules?.length ? (
            <div className="space-y-2 mt-3">
              <p className="text-sm font-medium">Active Schedules</p>
              {scheduled.schedules.map(s => (
                <div key={s.scheduleId} className="flex items-center justify-between p-2 border rounded-lg text-sm">
                  <div>
                    <span className="font-medium capitalize">{s.reportType}</span>
                    <span className="text-muted-foreground"> · {s.frequency} · {s.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${formatColors[s.format] ?? "bg-gray-100 text-gray-700"}`}>{s.format}</span>
                    <Badge variant={s.enabled ? "default" : "secondary"}>{s.enabled ? "Active" : "Paused"}</Badge>
                    <span className="text-xs text-muted-foreground">Next: {new Date(s.nextRunAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Report History */}
      <Card>
        <CardHeader><CardTitle>Report History</CardTitle></CardHeader>
        <CardContent>
          {!history?.reports?.length ? <p className="text-muted-foreground text-sm">No reports generated yet</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Type</th><th className="text-left py-2">Period</th><th className="text-right py-2">Rows</th><th className="text-right py-2">Format</th><th className="text-right py-2">Created</th><th className="text-right py-2">Action</th></tr></thead>
              <tbody>
                {history.reports.map(r => (
                  <tr key={r.reportId} className="border-b hover:bg-muted/30">
                    <td className="py-2 capitalize">{r.type}</td>
                    <td className="text-muted-foreground">{new Date(r.from).toLocaleDateString()} – {new Date(r.to).toLocaleDateString()}</td>
                    <td className="text-right">{r.rowCount.toLocaleString()}</td>
                    <td className="text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${formatColors[r.format] ?? "bg-gray-100 text-gray-700"}`}>{r.format}</span></td>
                    <td className="text-right text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="text-right"><Button size="sm" variant="outline" onClick={() => window.open(r.downloadUrl, "_blank")}>Download</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
