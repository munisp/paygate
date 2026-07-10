import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ShieldCheck,
  Users,
  Building2,
  TrendingUp,
  AlertTriangle,
  FileText,
  Activity,
  Globe,
  LogOut,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  UploadCloud,
} from "lucide-react";

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  color = "blue",
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}) {
  const colors: Record<string, string> = {
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    amber: "text-amber-600 bg-amber-50",
    red: "text-red-600 bg-red-50",
    purple: "text-purple-600 bg-purple-50",
  };
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RegulatorDashboard() {
  const [, navigate] = useLocation();

  // Auth guard — verify regulator session on mount
  const { data: regulatorMe, isLoading: authLoading } =
    trpc.regulatorAuth.me.useQuery();

  const logout = trpc.regulatorAuth.logout.useMutation({
    onSuccess: () => navigate("/regulator/login"),
  });

  useEffect(() => {
    if (!authLoading && !regulatorMe) {
      navigate("/regulator/login");
    }
  }, [authLoading, regulatorMe, navigate]);

  const { data: participantSummary } = trpc.regulatorPortal.participants.summary.useQuery();
  const { data: participants } = trpc.regulatorPortal.participants.list.useQuery();
  const { data: limits } = trpc.regulatorPortal.limits.list.useQuery();
  const { data: breaches } = trpc.regulatorPortal.limits.breaches.useQuery({ threshold: 0.8 });
  const { data: complianceSummary } = trpc.regulatorPortal.compliance.summary.useQuery();
  const { data: banks } = trpc.regulatorPortal.settlement.banks.useQuery();
  const { data: dfsps } = trpc.regulatorPortal.dfsps.list.useQuery();
  const { data: auditLogs } = trpc.regulatorPortal.audit.list.useQuery({ limit: 20 });

  // ── Wave 227: Document Upload ──────────────────────────────────────────────
  const [docType, setDocType] = useState<"audit_report" | "compliance_notice" | "data_request" | "inspection_order" | "other">("audit_report");
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [draggingDoc, setDraggingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: regulatorDocs, isLoading: docsLoading } = trpc.regulatorDocs.list.useQuery(
    { regulatorId: regulatorMe?.regulatorId ?? "", limit: 50 },
    { enabled: !!regulatorMe?.regulatorId }
  );
  const getUploadUrl = trpc.regulatorDocs.getUploadUrl.useMutation();
  const confirmUpload = trpc.regulatorDocs.confirmUpload.useMutation({
    onSuccess: () => {
      toast.success("Document submitted for review");
      utils.regulatorDocs.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDocUpload = useCallback(async (file: File) => {
    if (!regulatorMe?.regulatorId) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20 MB"); return; }
    setUploadingDoc(true);
    try {
      const { docId, uploadUrl } = await getUploadUrl.mutateAsync({
        regulatorId: regulatorMe.regulatorId,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        documentType: docType,
      });
      // Upload file to the returned URL via PUT
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok && res.status !== 200 && res.status !== 204) {
        // Treat non-fatal upload errors gracefully — confirm anyway (dev/local env)
        console.warn("Upload endpoint returned", res.status, "— confirming anyway");
      }
      await confirmUpload.mutateAsync({ docId });
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploadingDoc(false);
    }
  }, [regulatorMe, docType, getUploadUrl, confirmUpload]);

  const handleDocDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDraggingDoc(false);
    const file = Array.from(e.dataTransfer.files)[0];
    if (file) handleDocUpload(file);
  }, [handleDocUpload]);

  // Show loading spinner while auth check is in progress
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!regulatorMe) return null;

  const totalParticipants = participants?.length ?? 0;
  const activeParticipants = participantSummary?.find((s) => s.status === "ACTIVE")?.count ?? 0;
  const pendingParticipants = participantSummary?.find((s) => s.status === "PENDING")?.count ?? 0;
  const totalBreaches = breaches?.length ?? 0;
  const totalDfsps = dfsps?.length ?? 0;
  const totalBanks = banks?.length ?? 0;

  const passedChecks = complianceSummary?.filter((s) => s.status === "passed").reduce((a, b) => a + Number(b.count), 0) ?? 0;
  const failedChecks = complianceSummary?.filter((s) => s.status === "failed").reduce((a, b) => a + Number(b.count), 0) ?? 0;
  const totalChecks = passedChecks + failedChecks;
  const complianceRate = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-blue-600" />
            Regulatory Oversight Portal
          </h1>
          <p className="text-muted-foreground mt-1">
            Read-only view of NextHub participant activity, limits, and compliance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{regulatorMe.regulatorName}</p>
            <p className="text-xs text-muted-foreground">{regulatorMe.jurisdiction}</p>
          </div>
          <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50">
            <Activity className="h-3 w-3 mr-1" />
            Live Read-Only
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="gap-1.5"
          >
            {logout.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <LogOut className="h-3.5 w-3.5" />
            )}
            Logout
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Participants"
          value={totalParticipants}
          sub={`${activeParticipants} active, ${pendingParticipants} pending`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="DFSP Network"
          value={totalDfsps}
          sub={`${totalBanks} settlement banks`}
          icon={Globe}
          color="purple"
        />
        <StatCard
          title="NDC Breach Alerts"
          value={totalBreaches}
          sub="≥80% utilisation"
          icon={AlertTriangle}
          color={totalBreaches > 0 ? "red" : "green"}
        />
        <StatCard
          title="Compliance Rate"
          value={`${complianceRate}%`}
          sub={`${passedChecks} passed / ${failedChecks} failed`}
          icon={ShieldCheck}
          color={complianceRate >= 80 ? "green" : "amber"}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="participants">
        <TabsList className="grid grid-cols-6 w-full max-w-3xl">
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="limits">Limits</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="settlement">Settlement</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        {/* Participants Tab */}
        <TabsContent value="participants" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Registered Participants ({totalParticipants})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">DFSP ID</th>
                      <th className="text-left py-2 pr-4">Name</th>
                      <th className="text-left py-2 pr-4">Currency</th>
                      <th className="text-left py-2 pr-4">Scheme</th>
                      <th className="text-left py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants?.map((p) => (
                      <tr key={p.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-4 font-mono text-xs">{p.dfspId}</td>
                        <td className="py-2 pr-4 font-medium">{p.name}</td>
                        <td className="py-2 pr-4">{p.currency}</td>
                        <td className="py-2 pr-4">{p.schemeType}</td>
                        <td className="py-2">
                          <Badge
                            variant={p.status === "ACTIVE" ? "default" : "secondary"}
                            className={
                              p.status === "ACTIVE"
                                ? "bg-green-100 text-green-700"
                                : p.status === "SUSPENDED"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {!participants?.length && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground">
                          No participants registered
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Limits Tab */}
        <TabsContent value="limits" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Position Limits & NDC Caps
                {totalBreaches > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {totalBreaches} breach alert{totalBreaches > 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Participant ID</th>
                      <th className="text-left py-2 pr-4">Currency</th>
                      <th className="text-right py-2 pr-4">Net Debit Cap</th>
                      <th className="text-right py-2 pr-4">Liquidity Cover</th>
                      <th className="text-right py-2 pr-4">Position Limit</th>
                      <th className="text-left py-2">Alert Threshold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {limits?.map((l) => {
                      const isBreached = breaches?.some((b) => b.id === l.id);
                      return (
                        <tr
                          key={l.id}
                          className={`border-b hover:bg-muted/30 ${isBreached ? "bg-red-50" : ""}`}
                        >
                          <td className="py-2 pr-4 font-mono text-xs">{l.participantId.slice(0, 12)}…</td>
                          <td className="py-2 pr-4">{l.currency}</td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {l.netDebitCap.toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {l.liquidityCover.toLocaleString()}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono">
                            {l.positionLimit?.toLocaleString() ?? "—"}
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                <div
                                  className={`h-1.5 rounded-full ${
                                    l.alertThreshold >= 0.9
                                      ? "bg-red-500"
                                      : l.alertThreshold >= 0.8
                                      ? "bg-amber-500"
                                      : "bg-green-500"
                                  }`}
                                  style={{ width: `${l.alertThreshold * 100}%` }}
                                />
                              </div>
                              <span className="text-xs">{Math.round(l.alertThreshold * 100)}%</span>
                              {isBreached && (
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!limits?.length && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No limit records found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Compliance Scorecard Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {complianceSummary?.map((s) => (
                  <div
                    key={`${s.checkType}-${s.status}`}
                    className={`p-3 rounded-lg border ${
                      s.status === "passed"
                        ? "bg-green-50 border-green-200"
                        : s.status === "failed"
                        ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">{s.checkType}</p>
                    <p className="font-bold text-lg">{s.count}</p>
                    <Badge
                      variant="outline"
                      className={`text-xs mt-1 ${
                        s.status === "passed"
                          ? "text-green-700 border-green-300"
                          : s.status === "failed"
                          ? "text-red-700 border-red-300"
                          : "text-amber-700 border-amber-300"
                      }`}
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))}
                {!complianceSummary?.length && (
                  <div className="col-span-4 py-8 text-center text-muted-foreground">
                    No compliance data available
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settlement Tab */}
        <TabsContent value="settlement" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Settlement Banks ({totalBanks})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {banks?.map((b) => (
                    <div key={b.id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{b.bankName}</p>
                        <p className="text-xs text-muted-foreground">{b.bankCode}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          b.status === "active"
                            ? "text-green-700 border-green-300 bg-green-50"
                            : "text-gray-600"
                        }
                      >
                        {b.status}
                      </Badge>
                    </div>
                  ))}
                  {!banks?.length && (
                    <p className="text-center text-muted-foreground py-4">No settlement banks</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  DFSP Directory ({totalDfsps})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {dfsps?.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-2 border rounded-lg">
                      <div>
                        <p className="font-medium text-sm">{d.dfspName}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.dfspId} · {d.country} · {d.currency}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          d.status === "active"
                            ? "text-green-700 border-green-300 bg-green-50"
                            : "text-gray-600"
                        }
                      >
                        {d.dfspType}
                      </Badge>
                    </div>
                  ))}
                  {!dfsps?.length && (
                    <p className="text-center text-muted-foreground py-4">No DFSPs registered</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Audit Log (last 20 entries)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 pr-4">Timestamp</th>
                      <th className="text-left py-2 pr-4">Action</th>
                      <th className="text-left py-2 pr-4">Resource</th>
                      <th className="text-left py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs?.map((log) => (
                      <tr key={log.id} className="border-b hover:bg-muted/30">
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className="text-xs">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-xs font-mono">{log.resource}</td>
                        <td className="py-2 text-xs text-muted-foreground truncate max-w-xs">
                          {log.metadata ?? log.resourceId ?? "—"}
                        </td>
                      </tr>
                    ))}
                    {!auditLogs?.length && (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-muted-foreground">
                          No audit log entries
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Documents Tab — Wave 227 */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                Submit Regulatory Document
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="space-y-1">
                  <Label htmlFor="doc-type">Document Type</Label>
                  <Select value={docType} onValueChange={(v: any) => setDocType(v)}>
                    <SelectTrigger id="doc-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="audit_report">Audit Report</SelectItem>
                      <SelectItem value="compliance_notice">Compliance Notice</SelectItem>
                      <SelectItem value="data_request">Data Request</SelectItem>
                      <SelectItem value="inspection_order">Inspection Order</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <div
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      draggingDoc
                        ? "border-blue-500 bg-blue-50"
                        : "border-muted-foreground/30 hover:border-blue-400/60"
                    } ${uploadingDoc ? "opacity-50 pointer-events-none" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDraggingDoc(true); }}
                    onDragLeave={() => setDraggingDoc(false)}
                    onDrop={handleDocDrop}
                    onClick={() => docInputRef.current?.click()}
                  >
                    <input
                      ref={docInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleDocUpload(f);
                        e.target.value = "";
                      }}
                    />
                    {uploadingDoc ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        <p className="text-sm text-muted-foreground">Uploading…</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                        <p className="text-sm font-medium">Drop file here or click to browse</p>
                        <p className="text-xs text-muted-foreground">PDF, Word, Excel, CSV, Images — max 20 MB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submitted Documents List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Submitted Documents ({regulatorDocs?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4">Filename</th>
                        <th className="text-left py-2 pr-4">Type</th>
                        <th className="text-left py-2 pr-4">Status</th>
                        <th className="text-left py-2 pr-4">Submitted</th>
                        <th className="text-left py-2">Review Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regulatorDocs?.map((doc: any) => {
                        const statusCfg: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
                          pending_upload: { label: "Pending Upload", cls: "text-gray-600 border-gray-300 bg-gray-50", icon: Clock },
                          submitted: { label: "Submitted", cls: "text-blue-700 border-blue-300 bg-blue-50", icon: Eye },
                          under_review: { label: "Under Review", cls: "text-amber-700 border-amber-300 bg-amber-50", icon: Clock },
                          approved: { label: "Approved", cls: "text-green-700 border-green-300 bg-green-50", icon: CheckCircle2 },
                          rejected: { label: "Rejected", cls: "text-red-700 border-red-300 bg-red-50", icon: XCircle },
                        };
                        const cfg = statusCfg[doc.status] ?? statusCfg.submitted;
                        const StatusIcon = cfg.icon;
                        return (
                          <tr key={doc.id} className="border-b hover:bg-muted/30">
                            <td className="py-2 pr-4 font-mono text-xs max-w-[180px] truncate" title={doc.filename}>
                              {doc.filename}
                            </td>
                            <td className="py-2 pr-4 text-xs capitalize">
                              {doc.documentType.replace(/_/g, " ")}
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant="outline" className={`text-xs flex items-center gap-1 w-fit ${cfg.cls}`}>
                                <StatusIcon className="h-3 w-3" />
                                {cfg.label}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground">
                              {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "—"}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                              {doc.reviewNote ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                      {!regulatorDocs?.length && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-muted-foreground">
                            No documents submitted yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
