import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { DomainTableToolbar } from "@/components/DomainTableToolbar";
import { SortableTableHeader } from "@/components/SortableTableHeader";
import { useDomainTable } from "@/hooks/useDomainTable";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Plus, TrendingUp, DollarSign, Clock, CheckCircle } from "lucide-react";
import { DomainProtocolBanner } from "@/components/ProtocolBadge";

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-100 text-blue-800",
  TOKENIZED: "bg-purple-100 text-purple-800",
  DISCOUNTED: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
};

export default function SupplyChainFinance() {
  const [page, setPage] = useState(1);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [form, setForm] = useState({
    invoiceNumber: "", supplierId: "", supplierFsp: "", supplierAccount: "",
    buyerId: "", buyerFsp: "", buyerAccount: "", amount: "", currency: "NGN", dueDate: "",
  });
  const [discountForm, setDiscountForm] = useState({ invoiceId: "", discountRate: "", paymentDate: "" });

  const { data: invoices, refetch } = trpc.scf.listInvoices.useQuery({ page: 1, pageSize: 200 });
  const allInvoices = invoices?.invoices ?? [];
  const {
    filters, setFilter, sortKey, sortDir, toggleSort,
    filtered, paginated, page: tPage, setPage: setTPage, totalPages, exportCSV,
  } = useDomainTable(allInvoices, ["id", "invoice_number", "buyer_id", "supplier_id", "status"], "created_at");
  const CSV_COLS = [
    { key: "id", label: "ID" }, { key: "invoice_number", label: "Invoice #" },
    { key: "buyer_id", label: "Buyer" }, { key: "supplier_id", label: "Supplier" },
    { key: "invoice_amount", label: "Amount" }, { key: "currency", label: "Currency" },
    { key: "status", label: "Status" }, { key: "created_at", label: "Date" },
  ];
  const { data: stats } = trpc.scf.getSCFStats.useQuery();
  const submitMut = trpc.scf.submitInvoice.useMutation({
    onSuccess: (d) => { toast.success(`Invoice tokenized: ${d.tokenId}`); setShowInvoiceDialog(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const discountMut = trpc.scf.requestDiscount.useMutation({
    onSuccess: (d) => {
      toast.success(`Discount: ₦${d.discountAmount?.toLocaleString()} saved (${d.daysEarly} days early)`);
      setShowDiscountDialog(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalValue = stats?.reduce((sum: number, s: Record<string, unknown>) => sum + Number(s.total_amount), 0) ?? 0;
  const paidCount = stats?.find((s: Record<string, unknown>) => s.status === "PAID")?.count ?? 0;

  return (
    <div className="p-6 space-y-6">
          <DomainProtocolBanner domain="scf" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-orange-600" /> Supply Chain Finance
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Wave 214 — Dynamic discounting, invoice tokenisation, and early payment</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2"><TrendingUp className="w-4 h-4" /> Request Discount</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request Early Payment Discount</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Invoice ID</Label><Input value={discountForm.invoiceId} onChange={e => setDiscountForm(p => ({ ...p, invoiceId: e.target.value }))} placeholder="INV-..." /></div>
                <div><Label>Discount Rate (% annual)</Label><Input type="number" step="0.1" value={discountForm.discountRate} onChange={e => setDiscountForm(p => ({ ...p, discountRate: e.target.value }))} placeholder="5.0" /></div>
                <div><Label>Early Payment Date</Label><Input type="date" value={discountForm.paymentDate} onChange={e => setDiscountForm(p => ({ ...p, paymentDate: e.target.value }))} /></div>
                <Button className="w-full" onClick={() => discountMut.mutate({ ...discountForm, discountRate: parseFloat(discountForm.discountRate) })} disabled={discountMut.isPending}>
                  {discountMut.isPending ? "Calculating..." : "Calculate & Request"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="w-4 h-4" /> Submit Invoice</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Submit Invoice for Financing</DialogTitle></DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Invoice Number *</Label><Input value={form.invoiceNumber} onChange={e => setForm(p => ({ ...p, invoiceNumber: e.target.value }))} /></div>
                  <div><Label>Amount (₦) *</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} /></div>
                  <div><Label>Supplier ID *</Label><Input value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))} /></div>
                  <div><Label>Supplier FSP *</Label><Input value={form.supplierFsp} onChange={e => setForm(p => ({ ...p, supplierFsp: e.target.value }))} /></div>
                  <div><Label>Supplier Account *</Label><Input value={form.supplierAccount} onChange={e => setForm(p => ({ ...p, supplierAccount: e.target.value }))} /></div>
                  <div><Label>Buyer ID *</Label><Input value={form.buyerId} onChange={e => setForm(p => ({ ...p, buyerId: e.target.value }))} /></div>
                  <div><Label>Buyer FSP *</Label><Input value={form.buyerFsp} onChange={e => setForm(p => ({ ...p, buyerFsp: e.target.value }))} /></div>
                  <div><Label>Buyer Account *</Label><Input value={form.buyerAccount} onChange={e => setForm(p => ({ ...p, buyerAccount: e.target.value }))} /></div>
                  <div><Label>Due Date *</Label><Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
                </div>
                <Button className="w-full" onClick={() => submitMut.mutate({ ...form, amount: parseFloat(form.amount) })} disabled={submitMut.isPending}>
                  {submitMut.isPending ? "Submitting..." : "Submit & Tokenize Invoice"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Package className="w-4 h-4 text-orange-500" /><span className="text-sm text-muted-foreground">Total Invoices</span></div>
          <div className="text-2xl font-bold mt-1">{invoices?.total ?? 0}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-muted-foreground">Paid</span></div>
          <div className="text-2xl font-bold mt-1">{paidCount as number}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-500" /><span className="text-sm text-muted-foreground">Total Value</span></div>
          <div className="text-2xl font-bold mt-1">₦{totalValue.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-500" /><span className="text-sm text-muted-foreground">Pending</span></div>
          <div className="text-2xl font-bold mt-1">0</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Invoice Pipeline</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 pr-4">Invoice #</th>
                  <th className="text-left py-2 pr-4">Token ID</th>
                  <th className="text-left py-2 pr-4">Supplier</th>
                  <th className="text-left py-2 pr-4">Buyer</th>
                  <th className="text-right py-2 pr-4">Amount</th>
                  <th className="text-left py-2 pr-4">Due Date</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.invoices?.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No invoices yet</td></tr>
                )}
                {invoices?.invoices?.map((inv: Record<string, unknown>) => (
                  <tr key={inv.id as string} className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => { setSelectedInvoiceId(inv.id as string); setDiscountForm(p => ({ ...p, invoiceId: inv.id as string })); }}>
                    <td className="py-2 pr-4 font-medium">{inv.invoice_number as string}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-purple-600">{(inv.token_id as string)?.slice(0, 16)}...</td>
                    <td className="py-2 pr-4">{inv.supplier_id as string}</td>
                    <td className="py-2 pr-4">{inv.buyer_id as string}</td>
                    <td className="py-2 pr-4 text-right font-medium">₦{(inv.amount as number)?.toLocaleString()}</td>
                    <td className="py-2 pr-4 text-muted-foreground text-xs">{inv.due_date as string}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status as string] || "bg-gray-100 text-gray-800"}`}>
                        {inv.status as string}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
