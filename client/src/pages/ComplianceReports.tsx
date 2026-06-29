import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Send } from "lucide-react";

const REPORT_TYPES = ["aml", "cft", "pep_screening", "transaction_monitoring", "risk_assessment", "regulatory_filing"];
const STATUSES = ["pending", "draft", "submitted", "approved", "rejected"] as const;

type StatusType = typeof STATUSES[number];

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "submitted") return "secondary";
  return "outline";
};

export default function ComplianceReports() {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.orphaned.complianceReports.list.useQuery({ limit: 50, offset: 0 }, { staleTime: 30_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [period, setPeriod] = useState("");

  const createMutation = trpc.orphaned.complianceReports.create.useMutation({
    onSuccess: () => {
      utils.orphaned.complianceReports.list.invalidate();
      setShowCreate(false);
      setPeriod("");
      toast.success("Compliance report created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.orphaned.complianceReports.updateStatus.useMutation({
    onSuccess: () => {
      utils.orphaned.complianceReports.list.invalidate();
      toast.success("Report status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
    </div>
  );

  if (error) return <BridgeEmptyState title="Compliance Reports Unavailable" description={error.message} onRetry={() => utils.orphaned.complianceReports.list.invalidate()} />;

  const reports = data?.rows ?? [];

  return (
    <div className="p-6 space-y-6" role="main" aria-label="Compliance reports">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> Compliance Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Generate and track regulatory compliance reports</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" /> New Report</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STATUSES.map(s => (
          <Card key={s}>
            <CardContent className="py-3 text-center">
              <p className="text-2xl font-bold">{reports.filter((r: { status: string | null }) => r.status === s).length}</p>
              <p className="text-xs text-muted-foreground capitalize">{s}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {reports.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No compliance reports yet. Create your first report.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {reports.map((report: { reportId: string; reportType: string; status: string | null; riskLevel: string | null; findings: string | null; createdAt: Date }) => (
            <Card key={report.reportId}>
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm capitalize">{report.reportType.replace(/_/g, " ")}</span>
                    <Badge variant={statusVariant(report.status ?? "pending")}>{report.status ?? "pending"}</Badge>
                    {report.riskLevel && <Badge variant="outline">{report.riskLevel} risk</Badge>}
                  </div>
                  {report.findings && <p className="text-xs text-muted-foreground mt-1 truncate">{report.findings}</p>}
                  <p className="text-xs text-muted-foreground">Created: {new Date(report.createdAt).toLocaleDateString()}</p>
                </div>
                {(report.status === "draft" || report.status === "pending") && (
                  <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ reportId: report.reportId, status: "submitted" })}>
                    <Send className="w-3 h-3 mr-1" /> Submit
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Compliance Report</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ").toUpperCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reporting Period</Label>
              <Input placeholder="e.g. Q1 2026, Jan 2026" value={period} onChange={e => setPeriod(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!period || createMutation.isPending} onClick={() => createMutation.mutate({ reportType, period })}>
              {createMutation.isPending ? "Creating..." : "Create Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
