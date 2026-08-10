import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, FileText, DollarSign, TrendingUp, AlertTriangle, Plus, Send } from "lucide-react";

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600 border-slate-200",
  ISSUED: "bg-blue-100 text-blue-700 border-blue-200",
  PAID: "bg-emerald-100 text-emerald-700 border-emerald-200",
  OVERDUE: "bg-red-100 text-red-700 border-red-200",
};

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function BillingHub() {
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<string>("ALL");
  const [invoiceDfspFilter, setInvoiceDfspFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [generateDfspId, setGenerateDfspId] = useState("");
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());
  const [generateMonth, setGenerateMonth] = useState(new Date().getMonth() + 1);

  const { data: stats, refetch: refetchStats } = trpc.nexthubBilling.getStats.useQuery();

  const { data, isLoading, refetch } = trpc.nexthubBilling.listInvoices.useQuery({
    page,
    pageSize: 20,
    status: invoiceStatusFilter as any,
    dfspId: invoiceDfspFilter || undefined,
  });

  const generateMutation = trpc.nexthubBilling.generateMonthlyInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice generated successfully"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const issueMutation = trpc.nexthubBilling.issueInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice issued"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const markPaidMutation = trpc.nexthubBilling.markInvoicePaid.useMutation({
    onSuccess: () => { toast.success("Invoice marked as paid"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing Hub</h1>
          <p className="text-sm text-slate-500 mt-1">DFSP fee management, invoicing, and billing statements</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" /> Generate Invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate Monthly Invoice</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">DFSP ID</label>
                  <Input className="mt-1" placeholder="e.g. ACCESS_BANK_NG" value={generateDfspId} onChange={e => setGenerateDfspId(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Year</label>
                    <Input className="mt-1" type="number" min={2024} max={2099} value={generateYear} onChange={e => setGenerateYear(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Month</label>
                    <Select value={String(generateMonth)} onValueChange={v => setGenerateMonth(Number(v))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {months.map((m, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => generateMutation.mutate({ dfspId: generateDfspId, billingYear: generateYear, billingMonth: generateMonth })}
                  disabled={generateMutation.isPending || !generateDfspId.trim()}>
                  {generateMutation.isPending ? "Generating..." : "Generate Invoice"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg"><DollarSign className="w-4 h-4 text-indigo-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Billed</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalBilledKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Paid</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalPaidKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><FileText className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Outstanding</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalOutstandingKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Overdue</p>
                <p className="text-xl font-bold text-red-700">{stats?.overdueInvoices ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="summary">Billing Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <Select value={invoiceStatusFilter} onValueChange={setInvoiceStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["ALL", "DRAFT", "ISSUED", "PAID", "OVERDUE"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Filter by DFSP ID" className="w-48" value={invoiceDfspFilter} onChange={e => setInvoiceDfspFilter(e.target.value)} />
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-slate-400">Loading invoices...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice ID</TableHead>
                      <TableHead>DFSP</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Scheme Fees</TableHead>
                      <TableHead className="text-right">Interchange</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.invoices ?? []).map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-xs text-slate-500">{inv.id.slice(0, 10)}…</TableCell>
                        <TableCell className="font-medium text-sm">{inv.dfspName}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {new Date(inv.billingPeriodStart).toLocaleDateString("en-NG", { month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${INVOICE_STATUS_COLORS[inv.status] ?? ""}`}>
                            {inv.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{koboToNaira(inv.totalSchemeFeesKobo ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{koboToNaira(inv.totalInterchangeKobo ?? 0)}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-bold">{koboToNaira(inv.totalAmountKobo ?? 0)}</TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {inv.status === "DRAFT" && (
                              <Button size="sm" className="text-xs h-7 bg-blue-600 hover:bg-blue-700"
                                onClick={() => issueMutation.mutate({ invoiceId: inv.id })}
                                disabled={issueMutation.isPending}>
                                <Send className="w-3 h-3 mr-1" /> Issue
                              </Button>
                            )}
                            {inv.status === "ISSUED" && (
                              <Button size="sm" variant="outline" className="text-xs h-7 text-emerald-600 border-emerald-300"
                                onClick={() => markPaidMutation.mutate({ invoiceId: inv.id })}
                                disabled={markPaidMutation.isPending}>
                                Mark Paid
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(data?.invoices ?? []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-slate-400 py-8">No invoices found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {(data?.total ?? 0) > 20 && (
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data?.total ?? 0)} of {data?.total ?? 0}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader><CardTitle className="text-base">Fee Category Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Scheme Fees", key: "totalBilledKobo", color: "indigo" },
                  { label: "Interchange", key: "totalPaidKobo", color: "emerald" },
                  { label: "FX Markup", key: "totalOutstandingKobo", color: "amber" },
                  { label: "Penalties", key: "draftInvoices", color: "red" },
                ].map((item) => (
                  <div key={item.label} className={`p-4 bg-${item.color}-50 rounded-xl border border-${item.color}-100`}>
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <p className="text-lg font-bold text-slate-900">
                      {item.key === "draftInvoices" ? stats?.draftInvoices ?? 0 : koboToNaira((stats as any)?.[item.key] ?? 0)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-4">
                Note: Detailed per-category breakdowns require fee posting aggregation. Use the DFSP Statement endpoint for per-DFSP breakdowns.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
