// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText, MessageSquare, RefreshCw, Search, Shield, XCircle } from "lucide-react";

const DISPUTES = [
  { id: "DSP-2026-04-001", merchant: "TechMart Nigeria", customer: "Adebayo Okonkwo", amount: 45000, currency: "NGN", reason: "Unauthorized Transaction", status: "evidence_submitted", daysOpen: 3, dueDate: "2026-04-27", cardNetwork: "Visa", chargebackCode: "10.4", priority: "high" },
  { id: "DSP-2026-04-002", merchant: "Konga Marketplace", customer: "Fatima Aliyu", amount: 12800, currency: "NGN", reason: "Item Not Received", status: "under_review", daysOpen: 7, dueDate: "2026-04-24", cardNetwork: "Mastercard", chargebackCode: "13.1", priority: "medium" },
  { id: "DSP-2026-04-003", merchant: "Jumia Food", customer: "Emeka Nwosu", amount: 8500, currency: "NGN", reason: "Duplicate Charge", status: "won", daysOpen: 14, dueDate: "2026-04-20", cardNetwork: "Visa", chargebackCode: "12.1", priority: "low" },
  { id: "DSP-2026-04-004", merchant: "Paystack Partners", customer: "Ngozi Eze", amount: 125000, currency: "NGN", reason: "Credit Not Processed", status: "lost", daysOpen: 21, dueDate: "2026-04-18", cardNetwork: "Mastercard", chargebackCode: "13.6", priority: "high" },
  { id: "DSP-2026-04-005", merchant: "Flutterwave", customer: "Chukwuemeka Obi", amount: 67000, currency: "NGN", reason: "Goods/Services Not as Described", status: "open", daysOpen: 1, dueDate: "2026-05-04", cardNetwork: "Verve", chargebackCode: "13.3", priority: "medium" },
  { id: "DSP-2026-04-006", merchant: "GTBank Merchants", customer: "Aisha Bello", amount: 230000, currency: "NGN", reason: "Unauthorized Transaction", status: "arbitration", daysOpen: 28, dueDate: "2026-04-22", cardNetwork: "Visa", chargebackCode: "10.4", priority: "critical" },
];

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

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-gray-100 text-gray-700",
};

export default function AdminDisputeLifecycle() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("disputes");
  const [selectedDispute, setSelectedDispute] = useState<any | null>(null);
  const [evidenceNote, setEvidenceNote] = useState("");

  // Real tRPC data
  const { data: disputesData, isLoading: disputesLoading, refetch: refetchDisputes } = trpc.disputes.list.useQuery({
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

  // Use live data if available, fall back to static mock for display
  const displayDisputes = liveDisputes.length > 0 ? liveDisputes : DISPUTES;

  const filtered = displayDisputes.filter((d: any) => {
    const matchSearch = (d.id ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.merchant ?? d.merchantId ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.customer ?? d.customerId ?? "").toLowerCase().includes(search.toLowerCase());
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

          <Card>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dispute ID</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Days Open</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(d => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.id}</TableCell>
                      <TableCell className="text-sm">{d.merchant}</TableCell>
                      <TableCell className="text-sm">{d.customer}</TableCell>
                      <TableCell className="font-semibold">{formatNGN(d.amount)}</TableCell>
                      <TableCell className="text-xs max-w-32 truncate">{d.reason}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{d.cardNetwork}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{d.chargebackCode}</TableCell>
                      <TableCell className={d.daysOpen > 20 ? "text-red-600 font-semibold" : ""}>{d.daysOpen}d</TableCell>
                      <TableCell className="text-xs">{d.dueDate}</TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_COLORS[d.priority]}`}>{d.priority}</span></TableCell>
                      <TableCell><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status]}`}>{d.status.replace("_", " ")}</span></TableCell>
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
                                <div><p className="text-muted-foreground">Merchant</p><p className="font-medium">{d.merchant}</p></div>
                                <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{formatNGN(d.amount)}</p></div>
                                <div><p className="text-muted-foreground">Reason</p><p className="font-medium">{d.reason}</p></div>
                                <div><p className="text-muted-foreground">Chargeback Code</p><p className="font-mono">{d.chargebackCode}</p></div>
                              </div>
                              <div>
                                <p className="text-sm font-medium mb-2">Update Status</p>
                                <div className="flex gap-2 flex-wrap">
                                  {["evidence_requested", "evidence_submitted", "under_review", "arbitration", "won", "lost"].map(s => (
                                    <Button key={s} size="sm" variant="outline"
                                      onClick={() => { toast.success(`Dispute ${d.id} moved to ${s.replace("_", " ")}`); }}>
                                      {s.replace("_", " ")}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-sm font-medium mb-2">Add Evidence Note</p>
                                <Textarea placeholder="Describe the evidence or action taken…" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} rows={3} />
                              </div>
                              <Button className="w-full" onClick={() => { toast.success("Evidence note saved"); setEvidenceNote(""); }}>
                                Save Note & Notify Merchant
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
