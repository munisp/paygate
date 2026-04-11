import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Plus, Trash2, Send, FileText } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

type LineItem = { description: string; quantity: number; unitPriceKobo: number; taxPct: number };

export default function InvoiceBuilder() {
  const [showCreate, setShowCreate] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dueDays, setDueDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitPriceKobo: 0, taxPct: 7.5 }]);

  const { data: invoices, isLoading, refetch } = trpc.tier1to5.invoiceBuilder.getInvoices.useQuery({ limit: 50 });

  const createMutation = trpc.tier1to5.invoiceBuilder.createInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice created and sent via Dapr pub/sub."); setShowCreate(false); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const sendMutation = trpc.tier1to5.invoiceBuilder.sendInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice sent to customer."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const cancelMutation = trpc.tier1to5.invoiceBuilder.cancelInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice cancelled."); refetch(); },
    onError: (err: any) => toast.error(err.message),
  });

  const addItem = () => setItems(i => [...i, { description: "", quantity: 1, unitPriceKobo: 0, taxPct: 7.5 }]);
  const removeItem = (idx: number) => setItems(i => i.filter((_, j) => j !== idx));
  const updateItem = (idx: number, field: keyof LineItem, value: any) =>
    setItems(i => i.map((item, j) => j === idx ? { ...item, [field]: value } : item));

  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unitPriceKobo, 0);
  const tax = items.reduce((acc, i) => acc + i.quantity * i.unitPriceKobo * (i.taxPct / 100), 0);
  const total = subtotal + tax;

  const statusColor: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    cancelled: "bg-red-50 text-red-600",
  };

  if (!isLoading && !invoices) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Smart Invoice Builder</h1>
            <p className="text-muted-foreground text-sm mt-1">Create, send, and track invoices with automated reminders via Dapr</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
            <Button size="sm" onClick={() => setShowCreate(v => !v)}><Plus className="w-4 h-4 mr-2" />New Invoice</Button>
          </div>
        </div>

        {/* Create Invoice */}
        {showCreate && (
          <Card className="border-primary/30">
            <CardHeader><CardTitle>Create Invoice</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Email</Label>
                  <Input placeholder="customer@example.com" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Customer Name</Label>
                  <Input placeholder="Acme Corp" value={customerName} onChange={e => setCustomerName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Due In (Days)</Label>
                  <Input type="number" value={dueDays} onChange={e => setDueDays(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input placeholder="Payment terms, bank details..." value={notes} onChange={e => setNotes(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line Items</Label>
                  <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" />Add Item</Button>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 bg-muted/20 rounded">
                    <div className="col-span-4">
                      <Label className="text-xs">Description</Label>
                      <Input placeholder="Service description" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 1)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Unit Price (₦)</Label>
                      <Input type="number" value={item.unitPriceKobo / 100 || ""} onChange={e => updateItem(idx, "unitPriceKobo", Math.round((parseFloat(e.target.value) || 0) * 100))} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">VAT %</Label>
                      <Input type="number" value={item.taxPct} onChange={e => updateItem(idx, "taxPct", parseFloat(e.target.value) || 0)} className="mt-1 h-8 text-sm" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => removeItem(idx)} disabled={items.length === 1} className="h-8 w-8 p-0">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-muted/30 rounded-lg space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatNGN(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{formatNGN(tax)}</span></div>
                <div className="flex justify-between font-bold"><span>Total</span><span>{formatNGN(total)}</span></div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => createMutation.mutate({ customerEmail, customerName, dueDays: parseInt(dueDays), notes, lineItems: items })} disabled={createMutation.isPending || !customerEmail || items.some(i => !i.description)}>
                  {createMutation.isPending ? "Creating..." : "Create & Send Invoice"}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoice List */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Invoices</h2>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Card key={i} className="animate-pulse h-16" />)}</div>
          ) : !invoices?.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground"><FileText className="w-10 h-10 mx-auto mb-3 opacity-30" /><p>No invoices yet.</p></CardContent></Card>
          ) : (
            <div className="space-y-2">
              {invoices.map((inv: any) => (
                <Card key={inv.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{inv.invoiceNumber}</span>
                        <Badge className={statusColor[inv.status] ?? "bg-gray-100 text-gray-800"}>{inv.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{inv.customerEmail} · Due: {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "—"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold">{formatNGN(inv.totalKobo)}</span>
                      {inv.status === "draft" && (
                        <Button size="sm" variant="outline" onClick={() => sendMutation.mutate({ invoiceId: inv.id })}>
                          <Send className="w-3 h-3 mr-1" />Send
                        </Button>
                      )}
                      {["draft", "sent"].includes(inv.status) && (
                        <Button size="sm" variant="ghost" className="text-red-500" onClick={() => cancelMutation.mutate({ invoiceId: inv.id, reason: 'Cancelled by merchant' })}>Cancel</Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
