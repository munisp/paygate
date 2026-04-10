import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type CollectionItem = { customerName: string; customerPhone: string; customerEmail: string; amountKobo: number; reference: string };

export default function BulkCollections() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<CollectionItem[]>([{ customerName: "", customerPhone: "", customerEmail: "", amountKobo: 0, reference: `ref_${Date.now()}` }]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  const { data: collections, refetch } = trpc4.bulkCollections.listCollections.useQuery({ page: 1, status: "all" });
  const { data: details } = trpc4.bulkCollections.getCollectionDetails.useQuery(
    { collectionId: selectedCollection ?? "" },
    { enabled: !!selectedCollection }
  );

  const createMutation = trpc4.bulkCollections.createCollection.useMutation({
    onSuccess: (d) => { toast.success(`Collection "${d.collectionId}" created`); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const remindersMutation = trpc4.bulkCollections.sendReminders.useMutation({
    onSuccess: (d) => { toast.success(`${d.sent} reminders sent`); },
    onError: (e) => toast.error(e.message),
  });
  const exportMutation = trpc4.bulkCollections.exportReport.useMutation({
    onSuccess: (d) => { toast.success("Report ready"); window.open(d.downloadUrl, "_blank"); },
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const statusColors: Record<string, string> = { active: "bg-blue-100 text-blue-700", completed: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700", draft: "bg-gray-100 text-gray-700" };

  const addItem = () => setItems(prev => [...prev, { customerName: "", customerPhone: "", customerEmail: "", amountKobo: 0, reference: `ref_${Date.now()}` }]);
  const updateItem = (i: number, field: keyof CollectionItem, value: string | number) =>
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Bulk Collections</h1>

      {/* Create Collection */}
      <Card>
        <CardHeader><CardTitle className="text-base">Create New Collection</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">Title</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. School Fees Q1" /></div>
            <div><label className="text-xs text-muted-foreground">Description</label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" /></div>
            <div><label className="text-xs text-muted-foreground">Due Date</label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-sm font-medium">Collection Items</p>
              <Button variant="outline" size="sm" onClick={addItem}>+ Add Row</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-4 gap-2">
                  <Input placeholder="Name" value={item.customerName} onChange={e => updateItem(i, "customerName", e.target.value)} />
                  <Input placeholder="Email" value={item.customerEmail} onChange={e => updateItem(i, "customerEmail", e.target.value)} />
                  <Input placeholder="Phone" value={item.customerPhone} onChange={e => updateItem(i, "customerPhone", e.target.value)} />
                  <Input placeholder="Amount (₦)" type="number" value={item.amountKobo / 100 || ""} onChange={e => updateItem(i, "amountKobo", Math.round(parseFloat(e.target.value) * 100))} />
                </div>
              ))}
            </div>
          </div>
          <Button disabled={createMutation.isPending}
            onClick={() => createMutation.mutate({ name: title, description, expiryDate: dueDate || undefined, items })}>
            {createMutation.isPending ? "Creating..." : `Create Collection (${items.length} items)`}
          </Button>
        </CardContent>
      </Card>

      {/* Collections List */}
      <Card>
        <CardHeader><CardTitle>Collections</CardTitle></CardHeader>
        <CardContent>
          {!collections?.collections?.length ? <p className="text-muted-foreground text-sm">No collections yet</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Title</th><th className="text-right py-2">Total</th><th className="text-right py-2">Collected</th><th className="text-right py-2">Progress</th><th className="text-right py-2">Status</th><th className="text-right py-2">Actions</th></tr></thead>
              <tbody>
                {collections.collections.map(c => (
                  <tr key={c.collectionId} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedCollection(c.collectionId)}>
                    <td className="py-2">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.totalItems} items</p>
                    </td>
                    <td className="text-right">{formatKobo(c.totalAmountKobo)}</td>
                    <td className="text-right text-green-600">{formatKobo(c.collectedAmountKobo)}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${c.totalAmountKobo > 0 ? (c.collectedAmountKobo / c.totalAmountKobo) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs">{c.totalAmountKobo > 0 ? ((c.collectedAmountKobo / c.totalAmountKobo) * 100).toFixed(0) : 0}%</span>
                      </div>
                    </td>
                    <td className="text-right"><span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[c.status] ?? "bg-gray-100 text-gray-700"}`}>{c.status}</span></td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end" onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="outline" disabled={remindersMutation.isPending}
                          onClick={() => remindersMutation.mutate({ collectionId: c.collectionId, channel: "email" })}>Remind</Button>
                        <Button size="sm" variant="outline" disabled={exportMutation.isPending}
                          onClick={() => exportMutation.mutate({ collectionId: c.collectionId, format: "csv" })}>Export</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>

      {/* Details */}
      {selectedCollection && details && (
        <Card>
          <CardHeader><CardTitle>Collection Details: {details.name}</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Name</th><th className="text-left py-2">Email</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Status</th><th className="text-right py-2">Paid At</th></tr></thead>
              <tbody>
                {details.items?.map((item, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30">
                    <td className="py-2">{item.customerName}</td>
                    <td>{item.reference}</td>
                    <td className="text-right">{formatKobo(item.amountKobo)}</td>
                    <td className="text-right"><Badge variant={item.status === "paid" ? "default" : "secondary"}>{item.status}</Badge></td>
                    <td className="text-right text-muted-foreground">{item.paidAt ? new Date(item.paidAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
