// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, CheckCircle, XCircle, Search } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  open: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
  void: "bg-red-100 text-red-800",
  uncollectible: "bg-yellow-100 text-yellow-800",
};

export default function BillingInvoicesPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [tenantSearch, setTenantSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payRef, setPayRef] = useState("");

  const { data, refetch, isLoading } = trpc.wave32.billingInvoices.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    tenantId: tenantSearch || undefined,
  });

  const { data: invoice } = trpc.wave32.billingInvoices.get.useQuery(
    { id: selectedId! },
    { enabled: !!selectedId }
  );

  const markPaidMutation = trpc.wave32.billingInvoices.markPaid.useMutation({
    onSuccess: () => { toast({ title: "Invoice marked as paid" }); setSelectedId(null); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const voidMutation = trpc.wave32.billingInvoices.void.useMutation({
    onSuccess: () => { toast({ title: "Invoice voided" }); refetch(); },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalRevenue = data?.items?.filter(i => i.status === "paid")
    .reduce((sum, i) => sum + (i.amountUsd ?? 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Billing Invoices</h1>
          <p className="text-muted-foreground">Manage tenant billing invoices, payments, and revenue tracking.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Invoices", value: data?.total ?? 0 },
          { label: "Open", value: data?.items?.filter(i => i.status === "open").length ?? 0 },
          { label: "Paid", value: data?.items?.filter(i => i.status === "paid").length ?? 0 },
          { label: "Revenue (page)", value: `$${totalRevenue.toLocaleString()}` },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Filter by tenant ID..." className="pl-9" value={tenantSearch}
            onChange={e => { setTenantSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["draft", "open", "paid", "void", "uncollectible"].map(s => (
              <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                {["Invoice #", "Tenant", "Amount", "Period", "Status", "Due Date", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : data?.items?.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No invoices found</td></tr>
              ) : data?.items?.map(inv => (
                <tr key={inv.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber ?? inv.id.slice(0, 8)}</td>
                  <td className="px-4 py-3">{inv.tenantId}</td>
                  <td className="px-4 py-3 font-semibold">${inv.amountUsd?.toLocaleString() ?? "0"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.billingPeriod ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inv.status ?? "draft"]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.dueDate ? format(new Date(inv.dueDate), "MMM d, yyyy") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(inv.id)}>
                        <Eye className="h-3 w-3" />
                      </Button>
                      {inv.status === "open" && (
                        <>
                          <Button size="sm" variant="ghost" className="text-green-600"
                            onClick={() => setSelectedId(inv.id)}>
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => voidMutation.mutate({ id: inv.id })}>
                            <XCircle className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > 20 && (
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Page {page} of {Math.ceil(data.total / 20)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* Invoice Detail / Mark Paid Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => { setSelectedId(null); setPayRef(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice Detail</DialogTitle></DialogHeader>
          {invoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium">Invoice #:</span> {invoice.invoiceNumber ?? invoice.id.slice(0, 8)}</div>
                <div><span className="font-medium">Tenant:</span> {invoice.tenantId}</div>
                <div><span className="font-medium">Amount:</span> ${invoice.amountUsd?.toLocaleString()}</div>
                <div><span className="font-medium">Status:</span>
                  <span className={`ml-1 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[invoice.status ?? "draft"]}`}>{invoice.status}</span>
                </div>
                <div><span className="font-medium">Period:</span> {invoice.billingPeriod ?? "—"}</div>
                <div><span className="font-medium">Due:</span> {invoice.dueDate ? format(new Date(invoice.dueDate), "MMM d, yyyy") : "—"}</div>
                {invoice.paidAt && <div className="col-span-2"><span className="font-medium">Paid At:</span> {format(new Date(invoice.paidAt), "MMM d, yyyy HH:mm")}</div>}
              </div>

              {invoice.status === "open" && (
                <div className="border-t pt-4 space-y-3">
                  <Label>Stripe Payment Intent ID (optional)</Label>
                  <Input placeholder="pi_..." value={payRef} onChange={e => setPayRef(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedId(null); setPayRef(""); }}>Close</Button>
            {invoice?.status === "open" && (
              <Button className="bg-green-600 hover:bg-green-700"
                onClick={() => markPaidMutation.mutate({ id: selectedId!, stripePaymentIntentId: payRef || undefined })}
                disabled={markPaidMutation.isPending}>
                {markPaidMutation.isPending ? "Marking..." : "Mark as Paid"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
