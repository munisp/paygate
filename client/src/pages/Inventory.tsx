import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, RefreshCw, Package, AlertTriangle, TrendingDown } from "lucide-react";

export default function Inventory() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", unit: "kg", currentStock: "0", reorderLevel: "10", costPerUnitKobo: "0" });
  const [adjustForm, setAdjustForm] = useState({ delta: "", reason: "purchase" });

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.inventory.listItems.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const upsertItem = trpc.inventory.upsertItem.useMutation({
    onSuccess: () => {
      utils.inventory.listItems.invalidate();
      setOpen(false);
      setForm({ name: "", unit: "kg", currentStock: "0", reorderLevel: "10", costPerUnitKobo: "0" });
      toast.success("Inventory item saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustStock = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      utils.inventory.listItems.invalidate();
      setAdjustOpen(false);
      setAdjustForm({ delta: "", reason: "purchase" });
      toast.success("Stock adjusted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const items: any[] = data ?? [];
  const lowStock = items.filter((i: any) => i.currentStock <= i.reorderLevel);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inventory Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Track stock levels, costs, and reorder points</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Inventory Item</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Item name (e.g. Tomatoes)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <Input placeholder="Unit (kg, litres, pieces…)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                <Input type="number" placeholder="Current stock" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
                <Input type="number" placeholder="Reorder level" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
                <Input type="number" placeholder="Cost per unit (₦)" value={form.costPerUnitKobo} onChange={(e) => setForm({ ...form, costPerUnitKobo: e.target.value })} />
                <Button
                  className="w-full"
                  disabled={!form.name}
                  onClick={() => upsertItem.mutate({
                    name: form.name,
                    unit: form.unit,
                    currentStock: parseFloat(form.currentStock) || 0,
                    reorderLevel: parseFloat(form.reorderLevel) || 10,
                    costPerUnit: Math.round(parseFloat(form.costPerUnitKobo) * 100) || 0,
                  })}
                >
                  Save Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="flex items-center gap-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-yellow-800">{lowStock.length} item{lowStock.length > 1 ? "s" : ""} below reorder level:</span>
            <span className="text-yellow-700 ml-1">{lowStock.map((i: any) => i.name).join(", ")}</span>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Total Items</span>
            </div>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Low Stock</span>
            </div>
            <div className="text-2xl font-bold text-yellow-600">{lowStock.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Inventory Value</span>
            </div>
            <div className="text-2xl font-bold">
              ₦{(items.reduce((s: number, i: any) => s + (i.currentStock * (i.costPerUnitKobo ?? 0)), 0) / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Item table */}
      <Card>
        <CardHeader><CardTitle>Stock Levels</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading inventory…</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No inventory items yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Item</th>
                    <th className="text-left py-2 pr-4">Unit</th>
                    <th className="text-right py-2 pr-4">Stock</th>
                    <th className="text-right py-2 pr-4">Reorder At</th>
                    <th className="text-right py-2 pr-4">Cost / Unit</th>
                    <th className="text-left py-2 pr-4">Status</th>
                    <th className="text-left py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{item.name}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{item.unit}</td>
                      <td className="py-3 pr-4 text-right font-mono">{item.currentStock}</td>
                      <td className="py-3 pr-4 text-right font-mono text-muted-foreground">{item.reorderLevel}</td>
                      <td className="py-3 pr-4 text-right font-mono">₦{((item.costPerUnitKobo ?? 0) / 100).toFixed(2)}</td>
                      <td className="py-3 pr-4">
                        {item.currentStock <= item.reorderLevel ? (
                          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Low Stock</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">OK</Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => { setSelectedItem(item); setAdjustOpen(true); }}
                        >
                          Adjust
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjust stock dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Stock — {selectedItem?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="text-sm text-muted-foreground">
              Current stock: <span className="font-medium text-foreground">{selectedItem?.currentStock} {selectedItem?.unit}</span>
            </div>
            <Input
              type="number"
              placeholder="Adjustment (positive = add, negative = remove)"
              value={adjustForm.delta}
              onChange={(e) => setAdjustForm({ ...adjustForm, delta: e.target.value })}
            />
            <Select value={adjustForm.reason} onValueChange={(v) => setAdjustForm({ ...adjustForm, reason: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Purchase / Delivery</SelectItem>
                <SelectItem value="usage">Kitchen Usage</SelectItem>
                <SelectItem value="waste">Waste / Spoilage</SelectItem>
                <SelectItem value="correction">Stock Correction</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="w-full"
              disabled={!adjustForm.delta}
              onClick={() => {
                const qty = parseFloat(adjustForm.delta);
                const typeMap: Record<string, "restock" | "consume" | "waste" | "adjust"> = {
                  purchase: "restock",
                  usage: "consume",
                  waste: "waste",
                  correction: "adjust",
                };
                adjustStock.mutate({
                  itemId: selectedItem.id,
                  quantity: qty,
                  type: typeMap[adjustForm.reason] ?? "adjust",
                  note: adjustForm.reason,
                });
              }}
            >
              Apply Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
