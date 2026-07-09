/**
 * CBNReportsDashboard.tsx
 *
 * Full CBN regulatory report submission dashboard:
 *   - Upcoming filing deadlines with countdown timers
 *   - Report generation (Form A / B / C) with period selectors
 *   - Submission history table with regulator reference numbers
 *   - Retry failed submissions
 *   - Acknowledge submissions with CBN portal reference
 *   - Download generated PDF/CSV reports
 */

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Download,
  ChevronRight,
  Calendar,
  Building2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    generating: "secondary",
    generated: "outline",
    submitted: "default",
    acknowledged: "default",
    failed: "destructive",
    retrying: "secondary",
  };
  return <Badge variant={map[status] ?? "secondary"}>{status.toUpperCase()}</Badge>;
}

function CountdownTimer({ dueDate }: { dueDate: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(dueDate).getTime() - Date.now();
      if (diff <= 0) { setRemaining("OVERDUE"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${d}d ${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [dueDate]);

  const isUrgent = new Date(dueDate).getTime() - Date.now() < 3 * 86400000;
  return (
    <span className={isUrgent ? "text-destructive font-semibold" : "text-muted-foreground"}>
      {remaining}
    </span>
  );
}

// ─── Generate Form Dialog ─────────────────────────────────────────────────────

function GenerateFormDialog({
  open,
  formType,
  onClose,
}: {
  open: boolean;
  formType: "form_a" | "form_b" | "form_c" | null;
  onClose: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const utils = trpc.useUtils();

  const generateA = trpc.regulatoryReports.generateFormA.useMutation({
    onSuccess: () => { toast.success("Form A queued for generation"); utils.regulatoryReports.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const generateB = trpc.regulatoryReports.generateFormB.useMutation({
    onSuccess: () => { toast.success("Form B queued for generation"); utils.regulatoryReports.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  const generateC = trpc.regulatoryReports.generateFormC.useMutation({
    onSuccess: () => { toast.success("Form C queued for generation"); utils.regulatoryReports.list.invalidate(); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = generateA.isPending || generateB.isPending || generateC.isPending;

  const handleSubmit = () => {
    if (!merchantId) { toast.error("Merchant ID is required"); return; }
    if (!period) { toast.error("Period is required"); return; }
    if (formType === "form_a") generateA.mutate({ merchantId, period });
    else if (formType === "form_b") generateB.mutate({ merchantId, quarter: period });
    else if (formType === "form_c") generateC.mutate({ merchantId, year: parseInt(period) });
  };

  const periodLabel = formType === "form_a" ? "Period (YYYY-MM)" : formType === "form_b" ? "Quarter (YYYY-Q1/Q2/Q3/Q4)" : "Year (YYYY)";
  const periodPlaceholder = formType === "form_a" ? "2025-06" : formType === "form_b" ? "2025-Q2" : "2025";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate CBN {formType?.replace("_", " ").toUpperCase()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Merchant ID</Label>
            <Input value={merchantId} onChange={e => setMerchantId(e.target.value)} placeholder="merchant-uuid" className="mt-1" />
          </div>
          <div>
            <Label>{periodLabel}</Label>
            <Input value={period} onChange={e => setPeriod(e.target.value)} placeholder={periodPlaceholder} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Acknowledge Dialog ───────────────────────────────────────────────────────

function AcknowledgeDialog({
  submissionId,
  onClose,
}: {
  submissionId: string | null;
  onClose: () => void;
}) {
  const [regulatorRef, setRegulatorRef] = useState("");
  const utils = trpc.useUtils();

  const ack = trpc.regulatoryReports.acknowledgeSubmission.useMutation({
    onSuccess: () => {
      toast.success("Submission acknowledged");
      utils.regulatoryReports.listSubmissions.invalidate();
      utils.regulatoryReports.list.invalidate();
      onClose();
      setRegulatorRef("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={!!submissionId} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record CBN Acknowledgement</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label>CBN Portal Reference Number</Label>
          <Input
            value={regulatorRef}
            onChange={e => setRegulatorRef(e.target.value)}
            placeholder="CBN/REG/2025/XXXXXX"
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Enter the reference number from the CBN regulatory portal after successful submission.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submissionId && ack.mutate({ submissionId, regulatorRef })}
            disabled={!regulatorRef || ack.isPending}
          >
            {ack.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CBNReportsDashboard() {
  const [generateForm, setGenerateForm] = useState<"form_a" | "form_b" | "form_c" | null>(null);
  const [ackSubmissionId, setAckSubmissionId] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: reportsData, isLoading: reportsLoading } = trpc.regulatoryReports.list.useQuery({
    page: 1,
    limit: 50,
    reportType: reportFilter !== "all" ? reportFilter : undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });

  const { data: submissionsData, isLoading: submissionsLoading } = trpc.regulatoryReports.listSubmissions.useQuery({
    limit: 100,
  });

  const { data: deadlinesData } = trpc.regulatoryReports.upcomingDeadlines.useQuery({ daysAhead: 30 });

  const utils = trpc.useUtils();

  const retryMutation = trpc.regulatoryReports.retrySubmission.useMutation({
    onSuccess: () => { toast.success("Retry queued"); utils.regulatoryReports.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  // Compute stats
  const reports = reportsData?.reports ?? [];
  const submissions = submissionsData?.submissions ?? [];
  const pending = reports.filter(r => r.status === "pending" || r.status === "generating").length;
  const submitted = reports.filter(r => r.status === "submitted" || r.status === "acknowledged").length;
  const failed = reports.filter(r => r.status === "failed").length;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto" aria-label="CBN Regulatory Reports Dashboard">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              CBN Regulatory Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage CBN Form A/B/C submissions, track acknowledgements, and monitor filing deadlines.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setGenerateForm("form_a")}>
              <FileText className="w-3 h-3 mr-1" /> Form A
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGenerateForm("form_b")}>
              <FileText className="w-3 h-3 mr-1" /> Form B
            </Button>
            <Button size="sm" variant="outline" onClick={() => setGenerateForm("form_c")}>
              <FileText className="w-3 h-3 mr-1" /> Form C
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Reports</p>
              <p className="text-2xl font-bold">{reportsData?.total ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending / Generating</p>
              <p className="text-2xl font-bold text-amber-500">{pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Submitted / Acknowledged</p>
              <p className="text-2xl font-bold text-green-600">{submitted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-destructive">{failed}</p>
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Deadlines */}
        {deadlinesData && deadlinesData.length > 0 && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                Upcoming Filing Deadlines
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {deadlinesData.map((d: any) => (
                <div key={d.form_type} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 text-amber-600" />
                    <span className="font-medium">{d.form_type.replace("_", " ")}</span>
                    <span className="text-muted-foreground">— {d.description}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">Due: {d.due_date}</span>
                    <CountdownTimer dueDate={d.due_date + "T23:59:59Z"} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="reports">
          <TabsList>
            <TabsTrigger value="reports">
              <FileText className="w-3 h-3 mr-1" /> Reports ({reportsData?.total ?? 0})
            </TabsTrigger>
            <TabsTrigger value="submissions">
              <Clock className="w-3 h-3 mr-1" /> Submission History ({submissions.length})
            </TabsTrigger>
          </TabsList>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <div className="flex gap-3 items-center">
              <Select value={reportFilter} onValueChange={setReportFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="CBN_FORM_A">Form A</SelectItem>
                  <SelectItem value="CBN_FORM_B">Form B</SelectItem>
                  <SelectItem value="CBN_FORM_C">Form C</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No reports found. Use the buttons above to generate CBN Form A, B, or C.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Regulator Ref</TableHead>
                      <TableHead>Generated</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reports.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.reportType.replace("CBN_", "").replace("_", " ")}</TableCell>
                        <TableCell>{r.period}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {r.regulatorRef ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {r.fileUrl && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={r.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="w-3 h-3" />
                                </a>
                              </Button>
                            )}
                            {(r.status === "failed" || r.status === "pending") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => retryMutation.mutate({ reportId: r.id })}
                                disabled={retryMutation.isPending}
                                title="Retry submission"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Submission History Tab */}
          <TabsContent value="submissions" className="space-y-4">
            {submissionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No submission attempts recorded yet.</p>
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Form</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Regulator Ref</TableHead>
                      <TableHead>Submitted At</TableHead>
                      <TableHead>Acknowledged At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.formType?.replace("CBN_", "").replace("_", " ")}</TableCell>
                        <TableCell>{s.period}</TableCell>
                        <TableCell className="text-xs capitalize">{s.submissionMethod ?? "api"}</TableCell>
                        <TableCell>{statusBadge(s.status)}</TableCell>
                        <TableCell className="text-xs font-mono">
                          {s.regulatorRef ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {s.acknowledgedAt ? new Date(s.acknowledgedAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            {s.status === "submitted" && !s.acknowledgedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setAckSubmissionId(s.id)}
                                className="text-xs"
                              >
                                <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge
                              </Button>
                            )}
                            {s.fileUrl && (
                              <Button size="sm" variant="ghost" asChild>
                                <a href={s.fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Download className="w-3 h-3" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialogs */}
      <GenerateFormDialog
        open={!!generateForm}
        formType={generateForm}
        onClose={() => setGenerateForm(null)}
      />
      <AcknowledgeDialog
        submissionId={ackSubmissionId}
        onClose={() => setAckSubmissionId(null)}
      />
    </DashboardLayout>
  );
}
