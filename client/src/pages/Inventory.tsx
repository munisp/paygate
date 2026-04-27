import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Building2, ChevronDown } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CheckCircle2,
  Edit2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  TrendingDown,
  ShoppingCart,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAdaptiveInterval } from "@/lib/networkQuality";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatKobo(k: number) {
  return `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

const UNITS = ["kg", "g", "litre", "ml", "unit", "pack", "box", "bag", "bottle", "piece", "dozen"];
const ADJUST_TYPES = [
  { value: "restock", label: "Restock (add)" },
  { value: "consume", label: "Consume (use)" },
  { value: "waste", label: "Waste / Spoilage" },
  { value: "adjust", label: "Manual Adjust" },
];

// ─── Stock level badge ───────────────────────────────────────────────────────
function StockBadge({ current, reorder }: { current: number; reorder: number }) {
  if (current <= 0) return <Badge variant="destructive" className="text-xs">Out of stock</Badge>;
  if (current <= reorder) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Low stock</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs">In stock</Badge>;
}

// ─── Stock bar ───────────────────────────────────────────────────────────────
function StockBar({ current, reorder }: { current: number; reorder: number }) {
  const max = Math.max(current, reorder * 2, 1);
  const pct = Math.min((current / max) * 100, 100);
  const color = current <= 0 ? "bg-red-500" : current <= reorder ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Item Form Dialog ────────────────────────────────────────────────────────
interface ItemFormProps {
  open: boolean;
  onClose: () => void;
  initial?: any;
  onSaved: () => void;
}
function ItemFormDialog({ open, onClose, initial, onSaved }: ItemFormProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    unit: initial?.unit ?? "kg",
    currentStock: String(initial?.currentStock ?? 0),
    reorderLevel: String(initial?.reorderLevel ?? 10),
    costPerUnit: String(initial?.costPerUnitKobo ? initial.costPerUnitKobo / 100 : 0),
  });

  const upsert = trpc.inventory.upsertItem.useMutation({
    onSuccess: () => {
      toast.success(isEdit ? "Item updated" : "Item added");
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error("Failed to save", { description: err.message }),
  });

  const handleSubmit = () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    upsert.mutate({
      id: initial?.id,
      name: form.name.trim(),
      unit: form.unit,
      currentStock: Number(form.currentStock),
      reorderLevel: Number(form.reorderLevel),
      costPerUnit: Math.round(Number(form.costPerUnit) * 100),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Item Name</Label>
            <Input
              placeholder="e.g. Tomatoes"
              value={form.name}
              onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={form.unit} onValueChange={(v: any) => setForm((f: any) => ({ ...f, unit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u: any) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input
                type="number"
                min={0}
                value={form.currentStock}
                onChange={(e: any) => setForm((f: any) => ({ ...f, currentStock: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input
                type="number"
                min={0}
                value={form.reorderLevel}
                onChange={(e: any) => setForm((f: any) => ({ ...f, reorderLevel: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cost per Unit (₦)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="pl-6"
                  value={form.costPerUnit}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, costPerUnit: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Adjust Stock Dialog ─────────────────────────────────────────────────────
interface AdjustProps {
  open: boolean;
  onClose: () => void;
  item: any;
  onSaved: () => void;
}
function AdjustStockDialog({ open, onClose, item, onSaved }: AdjustProps) {
  const [type, setType] = useState<"restock" | "consume" | "waste" | "adjust">("restock");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");

  const adjust = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      toast.success("Stock adjusted");
      onSaved();
      onClose();
      setQty("");
      setNote("");
    },
    onError: (err: any) => toast.error("Failed to adjust", { description: err.message }),
  });

  const handleSubmit = () => {
    if (!qty || isNaN(Number(qty)) || Number(qty) <= 0) { toast.error("Enter a valid quantity"); return; }
    adjust.mutate({ itemId: item.id, quantity: Number(qty), type, note: note || undefined });
  };

  const isAdd = type === "restock" || type === "adjust";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
            <Package className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold">{item?.name}</p>
              <p className="text-xs text-muted-foreground">Current: {item?.currentStock} {item?.unit}</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Adjustment Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUST_TYPES.map((t: any) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity ({item?.unit})</Label>
            <div className="relative">
              <span className={`absolute left-3 top-1/2 -translate-y-1/2 font-bold ${isAdd ? "text-emerald-600" : "text-red-600"}`}>
                {isAdd ? "+" : "-"}
              </span>
              <Input
                type="number"
                min={0}
                className="pl-7"
                placeholder="0"
                value={qty}
                onChange={(e: any) => setQty(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              placeholder="e.g. Weekly restock from supplier"
              value={note}
              onChange={(e: any) => setNote(e.target.value)}
            />
          </div>
          {qty && !isNaN(Number(qty)) && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${isAdd ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              {isAdd ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
              New stock: {Math.max(0, (item?.currentStock ?? 0) + (isAdd ? Number(qty) : -Number(qty)))} {item?.unit}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={adjust.isPending}>
            {adjust.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply Adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
type TabFilter = "all" | "low" | "ok" | "out";

export default function Inventory() {
  const inventoryInterval = useAdaptiveInterval(60000);
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = useState("");
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [adjustItem, setAdjustItem] = useState<any>(null);
  const [poItem, setPoItem] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: items = [], isLoading, refetch } = trpc.inventory.listItems.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: inventoryInterval }
  );

  const refresh = () => {
    utils.inventory.listItems.invalidate();
    refetch();
  };

  // ─── Derived stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const arr = items as any[];
    const total = arr.length;
    const low = arr.filter((i: any) => i.currentStock > 0 && i.currentStock <= i.reorderLevel).length;
    const out = arr.filter((i: any) => i.currentStock <= 0).length;
    const ok = total - low - out;
    const totalCostKobo = arr.reduce((s: any, i: any) => s + (i.currentStock * (i.costPerUnitKobo ?? 0)), 0);
    return { total, low, out, ok, totalCostKobo };
  }, [items]);

  // ─── Filtered list ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const arr = items as any[];
    const q = search.toLowerCase().trim();
    return arr.filter((item) => {
      if (q && !item.name.toLowerCase().includes(q)) return false;
      if (tabFilter === "low") return item.currentStock > 0 && item.currentStock <= item.reorderLevel;
      if (tabFilter === "out") return item.currentStock <= 0;
      if (tabFilter === "ok") return item.currentStock > item.reorderLevel;
      return true;
    });
  }, [items, search, tabFilter]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track stock levels, costs, and reorder alerts across all items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Item
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items", value: stats.total, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "In Stock", value: stats.ok, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Low Stock", value: stats.low, icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Out of Stock", value: stats.out, icon: TrendingDown, color: "text-red-600", bg: "bg-red-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Inventory value card */}
      <Card className="bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs opacity-70 mb-1">Total Inventory Value</p>
              <p className="text-3xl font-bold">{formatKobo(stats.totalCostKobo)}</p>
              <p className="text-xs opacity-60 mt-0.5">Based on current stock × unit cost</p>
            </div>
            <BarChart3 className="h-10 w-10 opacity-20" />
          </div>
        </CardContent>
      </Card>

      {/* Low stock alert banner */}
      {stats.low + stats.out > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">
              {stats.out > 0 && `${stats.out} item${stats.out !== 1 ? "s" : ""} out of stock`}
              {stats.out > 0 && stats.low > 0 && " · "}
              {stats.low > 0 && `${stats.low} item${stats.low !== 1 ? "s" : ""} below reorder level`}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Review and restock these items to avoid service disruptions.
            </p>
          </div>
          <button
            className="ml-auto shrink-0 text-amber-600 hover:text-amber-900"
            onClick={() => setTabFilter("low")}
          >
            <span className="text-xs font-medium underline">View low stock</span>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Tabs value={tabFilter} onValueChange={(v: any) => setTabFilter(v as TabFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="h-7 text-xs px-3">All ({stats.total})</TabsTrigger>
            <TabsTrigger value="ok" className="h-7 text-xs px-3">In Stock ({stats.ok})</TabsTrigger>
            <TabsTrigger value="low" className="h-7 text-xs px-3 text-amber-700">Low ({stats.low})</TabsTrigger>
            <TabsTrigger value="out" className="h-7 text-xs px-3 text-red-700">Out ({stats.out})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search items…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
          />
          {search && (
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Item table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            {search && ` matching "${search}"`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-14 text-center">
              <Package className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-semibold text-muted-foreground">
                {search ? "No items match your search" : "No inventory items yet"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? "Try a different search term." : "Add your first item to start tracking stock."}
              </p>
              {!search && (
                <Button size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add First Item
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Header row */}
              <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                <div className="col-span-4">Item</div>
                <div className="col-span-2 text-right">Stock</div>
                <div className="col-span-2 text-right">Reorder At</div>
                <div className="col-span-2 text-right">Unit Cost</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              {filtered.map((item: any) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 gap-2 items-center px-3 py-3 rounded-xl border transition-colors hover:bg-muted/30 ${
                    item.currentStock <= 0
                      ? "border-red-100 bg-red-50/40"
                      : item.currentStock <= item.reorderLevel
                      ? "border-amber-100 bg-amber-50/30"
                      : "border-border"
                  }`}
                >
                  {/* Name + status */}
                  <div className="col-span-12 sm:col-span-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        item.currentStock <= 0 ? "bg-red-100" : item.currentStock <= item.reorderLevel ? "bg-amber-100" : "bg-emerald-100"
                      }`}>
                        <Package className={`h-4 w-4 ${
                          item.currentStock <= 0 ? "text-red-600" : item.currentStock <= item.reorderLevel ? "text-amber-600" : "text-emerald-600"
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{item.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <StockBadge current={item.currentStock} reorder={item.reorderLevel} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 sm:hidden">
                      <StockBar current={item.currentStock} reorder={item.reorderLevel} />
                    </div>
                  </div>

                  {/* Stock */}
                  <div className="col-span-4 sm:col-span-2 text-right">
                    <p className="text-sm font-bold">{item.currentStock}</p>
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                    <div className="hidden sm:block mt-1">
                      <StockBar current={item.currentStock} reorder={item.reorderLevel} />
                    </div>
                  </div>

                  {/* Reorder level */}
                  <div className="col-span-4 sm:col-span-2 text-right">
                    <p className="text-sm">{item.reorderLevel}</p>
                    <p className="text-xs text-muted-foreground">{item.unit}</p>
                  </div>

                  {/* Unit cost */}
                  <div className="col-span-4 sm:col-span-2 text-right">
                    <p className="text-sm font-medium">{formatKobo(item.costPerUnitKobo ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">per {item.unit}</p>
                  </div>

                  {/* Actions */}
                  <div className="col-span-12 sm:col-span-2 flex items-center justify-end gap-1.5 flex-wrap">
                    {(item.currentStock <= item.reorderLevel) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => setPoItem(item)}
                      >
                        <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                        Create PO
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => setAdjustItem(item)}
                    >
                      <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                      Adjust
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditItem(item)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <ItemFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={refresh}
      />
      {editItem && (
        <ItemFormDialog
          open={!!editItem}
          onClose={() => setEditItem(null)}
          initial={editItem}
          onSaved={refresh}
        />
      )}
      {adjustItem && (
        <AdjustStockDialog
          open={!!adjustItem}
          onClose={() => setAdjustItem(null)}
          item={adjustItem}
          onSaved={refresh}
        />
      )}
      {poItem && (
        <CreatePODialog
          open={!!poItem}
          onClose={() => setPoItem(null)}
          item={poItem}
          onSaved={refresh}
        />
      )}
    </div>
  );
}

// ─── Create PO Dialog ────────────────────────────────────────────────────────
interface CreatePODialogProps {
  open: boolean;
  onClose: () => void;
  item: any;
  onSaved: () => void;
}
function CreatePODialog({ open, onClose, item, onSaved }: CreatePODialogProps) {
  const suggestedQty = Math.max(1, (item.reorderLevel ?? 10) * 2 - (item.currentStock ?? 0));
  const [form, setForm] = useState({
    vendorName: "",
    quantity: String(suggestedQty),
    unitCost: String(item.costPerUnitKobo ? item.costPerUnitKobo / 100 : 0),
    notes: "",
  });

  // Load vendor directory for dropdown
  const { data: vendorsData } = trpc.vendors.list.useQuery(undefined, { staleTime: 60_000 });
  const vendorList = vendorsData?.vendors ?? [];

  const createPO = trpc.purchaseOrders.create.useMutation({
    onSuccess: () => {
      toast.success("Purchase Order created", {
        description: `PO for ${form.quantity} ${item.unit}(s) of ${item.name} sent to owner.`,
      });
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error("Failed to create PO", { description: err.message }),
  });

  const totalKobo = Math.round(Number(form.unitCost) * 100) * Number(form.quantity);

  const handleSubmit = () => {
    if (!form.quantity || Number(form.quantity) < 1) { toast.error("Quantity must be at least 1"); return; }
    createPO.mutate({
      inventoryItemId: item.id,
      itemName: item.name,
      vendorName: form.vendorName || undefined,
      quantity: Number(form.quantity),
      unit: item.unit,
      unitCostKobo: Math.round(Number(form.unitCost) * 100),
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-amber-600" />
            Create Purchase Order
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Item summary */}
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">{item.name}</p>
                <p className="text-xs text-amber-700">
                  Current stock: <span className="font-medium">{item.currentStock} {item.unit}</span>
                  {" "}&middot; Reorder at: <span className="font-medium">{item.reorderLevel} {item.unit}</span>
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Vendor / Supplier Name</Label>
            {vendorList.length > 0 ? (
              <Select
                value={form.vendorName}
                onValueChange={(v: any) => setForm((f: any) => ({ ...f, vendorName: v === '__manual__' ? '' : v }))}
              >
                <SelectTrigger>
                  <Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Select from directory or type manually" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Enter manually —</SelectItem>
                  {vendorList.map((v: any) => (
                    <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="e.g. FreshFarm Supplies"
                value={form.vendorName}
                onChange={(e: any) => setForm((f: any) => ({ ...f, vendorName: e.target.value }))}
              />
            )}
            {vendorList.length > 0 && (form.vendorName === '' || form.vendorName === '__manual__') && (
              <Input
                placeholder="Type vendor name manually"
                value={form.vendorName === '__manual__' ? '' : form.vendorName}
                onChange={(e: any) => setForm((f: any) => ({ ...f, vendorName: e.target.value }))}
                className="mt-1.5"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Order Quantity ({item.unit})</Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e: any) => setForm((f: any) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost (₦)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₦</span>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  className="pl-7"
                  value={form.unitCost}
                  onChange={(e: any) => setForm((f: any) => ({ ...f, unitCost: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Total estimate */}
          {Number(form.quantity) > 0 && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Estimated Total</span>
              <span className="font-bold text-lg">{formatKobo(totalKobo)}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input
              placeholder="Delivery instructions, urgency, etc."
              value={form.notes}
              onChange={(e: any) => setForm((f: any) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleSubmit}
            disabled={createPO.isPending}
          >
            {createPO.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Purchase Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
