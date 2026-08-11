// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, DollarSign, FileText, MessageSquare, RefreshCw, Search, XCircle } from "lucide-react";

const LIFECYCLE_STAGES = [
  { stage: "Open", description: "Dispute filed, awaiting merchant response", days: "Day 0", color: "bg-blue-100 text-blue-700" },
  { stage: "Evidence Requested", description: "Merchant notified, evidence collection window open", days: "Day 1-7", color: "bg-amber-100 text-amber-700" },
  { stage: "Evidence Submitted", description: "Merchant submitted rebuttal and supporting docs", days: "Day 7-14", color: "bg-indigo-100 text-indigo-700" },
  { stage: "Under Review", description: "Card network reviewing evidence from both parties", days: "Day 14-21", color: "bg-purple-100 text-purple-700" },
  { stage: "Arbitration", description: "Escalated to card network arbitration panel", days: "Day 21-45", color: "bg-orange-100 text-orange-700" },
  { stage: "Won", description: "Dispute resolved in merchant's favor", days: "Final", color: "bg-green-100 text-green-700" },
  { stage: "Lost", description: "Chargeback confirmed, funds returned to customer", days: "Final", color: "bg-red-100 text-red-700" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  evidence_requested: "bg-amber-100 text-amber-700",
  evidence_submitted: "bg-indigo-100 text-indigo-700",
  under_review: "bg-purple-100 text-purple-700",
  arbitration: "bg-orange-100 text-orange-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export default function AdminDisputeLifecycle() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("disputes");
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");

  // Real tRPC data — live disputes only, no static fallback.
  const { data: disputesData, isLoading: disputesLoading, isError: disputesError, error: disputesErrorObj, refetch: refetchDisputes } = trpc.disputes.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
    offset: 0,
  }, { staleTime: 30_000 });
  const liveDisputes = (disputesData?.disputes ?? (Array.isArray(disputesData) ? disputesData : [])) as any[];

  const generateReportMutation = trpc.wave27.complianceReport.generateReport.useMutation({
    onSuccess: (data) => {
      toast.success(`Dispute report generated (${data.rowCount ?? 0} records)`);
      if (data.downloadUrl) window.open(data.downloadUrl, '_blank');
    },
    onError: (err) => toast.error(`Report generation failed: ${err.message}`),
  });
  const respondMutation = trpc.disputes.respond.useMutation({
    onSuccess: () => { toast.success("Response submitted successfully"); setSelectedDispute(null); setEvidenceNote(""); refetchDisputes(); },
    onError: (e) => toast.error(`Failed to submit response: ${e.message}`),
  });

  const displayDisputes = liveDisputes;

  const filtered = displayDisputes.filter((d: any) => {
    const matchSearch = (d.id ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.reference ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.transactionId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.merchantId ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const formatNGN = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

  const stats = {
    open: displayDisputes.filter((d: any) => ["open", "evidence_requested", "evidence_submitted", "under_review"].includes(d.status)).length,
    won: displayDisputes.filter((d: any) => d.status === "won").length,
    lost: displayDisputes.filter((d: any) => d.status === "lost").length,
    totalAmount: displayDisputes.reduce((s: number, d: any) => s + (Number(d.amount) || 0), 0),
  };

  const daysOpen = (d: any) => d.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(d.createdAt).getTime()) / 86400000)) : null;

  const submitResponse = () => {
    if (!selectedDispute) return;
    if (evidenceNote.trim().length < 10) {
      toast.error("Response must be at least 10 characters");
      return;
    }
    respondMutation.mutate({ id: selectedDispute.id, merchantResponse: evidenceNote.trim() });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispute Lifecycle Manager</h1>
          <p className="text-muted-foreground text-sm mt-1">Chargeback management · Visa / Mastercard / Verve · Evidence workflows</p>
        </div>
        <Button size="sm" onClick={() => generateReportMutation.mutate({ reportType: 'fraud_incidents', period: 'monthly', startDate: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0], format: 'json' })} disabled={generateReportMutation.isPending}>
          <FileText className="w-4 h-4 mr-2" />Export Report
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Open Disputes", value: stats.open.toString(), icon: AlertTriangle, color: "text-amber-500" },
          { label: "Won (30d)", value: stats.won.toString(), icon: CheckCircle, color: "text-green-500" },
          { label: "Lost (30d)", value: stats.lost.toString(), icon: XCircle, color: "text-red-500" },
          { label: "Total Disputed", value: `₦${(stats.totalAmount / 100).toLocaleString()}`, icon: DollarSign, color: "text-indigo-500" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <m.icon className={`w-8 h-8 ${m.color}`} />
                <div><p className="text-2xl font-bold">{m.value}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-xs">
          <TabsTrigger value="disputes">All Disputes</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="disputes" className="mt-4 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search disputes…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="evidence_submitted">Evidence Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="arbitration">Arbitration</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {disputesError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-700">Could not load disputes</p>
                <p className="text-xs text-red-600 mt-0.5">{disputesErrorObj?.message}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => refetchDisputes()}>Retry</Button>
            </div>
          )}

          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispute ID</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => {
                    const open = daysOpen(d);
                    return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.id}</TableCell>
                      <TableCell className="font-mono text-xs">{d.reference ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{d.transactionId ?? "—"}</TableCell>
                      <TableCell className="font-semibold">{formatNGN(d.amount)}</TableCell>
                      <TableCell className="text-xs max-w-32 truncate">{d.reason ?? "—"}</TableCell>
                      <TableCell className={(open ?? 0) > 20 ? "text-red-600 font-semibold" : ""}>{open != null ? `${open}d` : "—"}</TableCell>
                      <TableCell className="text-xs">{d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "—"}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-700"}`}>{(d.status ?? "").replace("_", " ")}</span></TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline" onClick={() => setSelectedDispute(d)}>
                              <MessageSquare className="w-3 h-3 mr-1" />Manage
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg">
                            <DialogHeader>
                              <DialogTitle>Manage Dispute {d.id}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><p className="text-muted-foreground">Reference</p><p className="font-mono text-xs">{d.reference ?? "—"}</p></div>
                                <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{formatNGN(d.amount)}</p></div>
                                <div><p className="text-muted-foreground">Reason</p><p className="font-medium">{d.reason ?? "—"}</p></div>
                                <div><p className="text-muted-foreground">Status</p><p className="font-medium capitalize">{(d.status ?? "").replace("_", " ")}</p></div>
                              </div>
                              {d.merchantResponse && (
                                <div>
                                  <p className="text-sm font-medium mb-1">Existing Merchant Response</p>
                                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">{d.merchantResponse}</p>
                                </div>
                              )}
                              <div>
                                <p className="text-sm font-medium mb-2">Respond to Dispute</p>
                                <Textarea placeholder="Describe the evidence or response (min. 10 characters)…" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} rows={3} />
                                <p className="text-xs text-muted-foreground mt-1">Submitting moves the dispute to under review and records your response.</p>
                              </div>
                              <Button className="w-full" onClick={submitResponse} disabled={respondMutation.isPending}>
                                {respondMutation.isPending ? "Submitting…" : "Submit Response"}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!disputesLoading && !disputesError && filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">{displayDisputes.length === 0 ? "No disputes on record." : "No disputes match the current filters."}</p>
                </div>
              )}
              {disputesLoading && (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  <p className="text-sm">Loading disputes…</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lifecycle" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Dispute Lifecycle Stages</CardTitle>
              <CardDescription>Standard chargeback process per Visa/Mastercard/Verve rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {LIFECYCLE_STAGES.map((stage, i) => (
                <div key={stage.stage} className="flex items-start gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">{i + 1}</div>
                    {i < LIFECYCLE_STAGES.length - 1 && <div className="w-0.5 h-8 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stage.color}`}>{stage.stage}</span>
                      <span className="text-xs text-muted-foreground">{stage.days}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{stage.description}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
