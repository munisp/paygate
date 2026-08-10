// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, RefreshCw, UtensilsCrossed, Tag, Search,
  Pencil, Trash2, ChevronDown, ChevronUp, GripVertical,
  Link2, Copy, QrCode, ExternalLink
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── Category Form Dialog ──────────────────────────────────────────────────────
function CategoryDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial?: { id?: string; name: string; displayOrder: number };
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(initial?.name ?? "");
  const [order, setOrder] = useState(String(initial?.displayOrder ?? 0));

  const upsert = trpc.restaurant.upsertCategory.useMutation({
    onSuccess: () => {
      utils.restaurant.listMenu.invalidate();
      toast.success(initial?.id ? "Category updated" : "Category added");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name *</label>
            <Input
              placeholder="e.g. Starters, Mains, Drinks"
              value={name}
              onChange={(e: any) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Display Order</label>
            <Input
              type="number"
              min={0}
              value={order}
              onChange={(e: any) => setOrder(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name || upsert.isPending}
            onClick={() => upsert.mutate({ id: initial?.id, name, displayOrder: parseInt(order) || 0 })}
          >
            {upsert.isPending ? "Saving…" : "Save Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Item Form Dialog ──────────────────────────────────────────────────────────
function ItemDialog({
  open,
  initial,
  categories,
  onClose,
}: {
  open: boolean;
  initial?: any;
  categories: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    categoryId: initial?.categoryId ?? "",
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    priceNgn: initial?.priceKobo ? String(initial.priceKobo / 100) : "",
    available: initial?.available ?? true,
    station: initial?.station ?? "kitchen",
    calories: initial?.calories ? String(initial.calories) : "",
    tags: initial?.tags ?? "",
  });

  const upsert = trpc.restaurant.upsertMenuItem.useMutation({
    onSuccess: () => {
      utils.restaurant.listMenu.invalidate();
      toast.success(initial?.id ? "Item updated" : "Item added");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const f = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category *</label>
            <Select value={form.categoryId} onValueChange={(v: any) => f("categoryId", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Item Name *</label>
            <Input placeholder="e.g. Jollof Rice" value={form.name} onChange={(e: any) => f("name", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input placeholder="Short description" value={form.description} onChange={(e: any) => f("description", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Price (₦) *</label>
              <Input type="number" min={0} step={0.01} value={form.priceNgn} onChange={(e: any) => f("priceNgn", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Calories</label>
              <Input type="number" min={0} value={form.calories} onChange={(e: any) => f("calories", e.target.value)} placeholder="kcal" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kitchen Station</label>
            <Select value={form.station} onValueChange={(v: any) => f("station", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["kitchen", "bar", "grill", "pastry", "cold"].map((s: any) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input placeholder="vegan, gluten-free, spicy" value={form.tags} onChange={(e: any) => f("tags", e.target.value)} />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Switch checked={form.available} onCheckedChange={(v: any) => f("available", v)} />
            <span className="text-sm font-medium">{form.available ? "Available" : "86'd (unavailable)"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.name || !form.categoryId || !form.priceNgn || upsert.isPending}
            onClick={() =>
              upsert.mutate({
                id: initial?.id,
                categoryId: form.categoryId,
                name: form.name,
                description: form.description || undefined,
                priceKobo: Math.round(parseFloat(form.priceNgn) * 100),
                available: form.available,
              })
            }
          >
            {upsert.isPending ? "Saving…" : "Save Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Online Ordering Link Panel ───────────────────────────────────────────────
function OnlineOrderingPanel({ merchantSlug }: { merchantSlug: string }) {
  const [showQr, setShowQr] = useState(false);
  const orderingUrl = `${window.location.origin}/order/${merchantSlug}`;

  const copyLink = () => {
    navigator.clipboard.writeText(orderingUrl).then(() => toast.success("Link copied!"));
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-green-600" />
          <span className="text-sm font-semibold">Online Ordering Link</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowQr((v: any) => !v)}>
            <QrCode className="w-3.5 h-3.5 mr-1" />
            {showQr ? "Hide QR" : "Show QR"}
          </Button>
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="w-3.5 h-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" asChild>
            <a href={orderingUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Preview
            </a>
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground font-mono bg-muted rounded px-2 py-1.5 break-all">
        {orderingUrl}
      </p>
      {showQr && (
        <div className="flex flex-col items-center gap-2 pt-1">
          <QRCodeSVG value={orderingUrl} size={160} level="M" />
          <p className="text-xs text-muted-foreground">Scan to order from your menu</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RestaurantMenu() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [catDialog, setCatDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch } = trpc.restaurant.listMenu.useQuery(undefined, {
    staleTime: 30_000,
  });
  const { data: settingsData } = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const merchantSlug = (settingsData as any)?.businessName
    ? (settingsData as any).businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : 'my-restaurant';

  const toggleItem = trpc.restaurant.toggleItemAvailability.useMutation({
    onMutate: async ({ id }) => {
      await utils.restaurant.listMenu.cancel();
      const prev = utils.restaurant.listMenu.getData();
      utils.restaurant.listMenu.setData(undefined, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((i: any) =>
            i.id === id ? { ...i, available: !i.available } : i
          ),
        };
      });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      utils.restaurant.listMenu.setData(undefined, ctx?.prev);
      toast.error(e.message);
    },
    onSettled: () => utils.restaurant.listMenu.invalidate(),
  });

  const categories: any[] = (data as any)?.categories ?? [];
  const items: any[] = (data as any)?.items ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i: any) =>
      i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const toggleCollapse = (id: string) =>
    setCollapsed((s: Set<string>) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const totalItems = items.length;
  const availableItems = items.filter((i: any) => i.available).length;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-600 flex items-center justify-center">
            <UtensilsCrossed className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Menu Management</h1>
            <p className="text-xs text-muted-foreground">
              {availableItems}/{totalItems} items available · {categories.length} categories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCatDialog({ open: true })}>
            <Tag className="w-3.5 h-3.5 mr-1" /> Add Category
          </Button>
          <Button size="sm" onClick={() => setItemDialog({ open: true })}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {/* Online Ordering Link */}
      <OnlineOrderingPanel merchantSlug={merchantSlug} />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search menu items…"
          value={search}
          onChange={(e: any) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <UtensilsCrossed className="w-14 h-14 text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-muted-foreground">No menu yet</p>
          <p className="text-sm text-muted-foreground mt-1">Start by adding a category, then add items to it.</p>
          <Button className="mt-4" size="sm" onClick={() => setCatDialog({ open: true })}>
            <Tag className="w-3.5 h-3.5 mr-1.5" /> Add First Category
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {categories
            .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
            .map((cat: any) => {
              const catItems = filtered.filter((i: any) => i.categoryId === cat.id);
              const isCollapsed = collapsed.has(cat.id);
              return (
                <div key={cat.id} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                  {/* Category header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleCollapse(cat.id)}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground/40" />
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold">{cat.name}</span>
                      <Badge variant="secondary" className="text-xs">{catItems.length}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        aria-label="Edit" onClick={(e: any) => { e.stopPropagation(); setCatDialog({ open: true, initial: cat }); }}
                      ><Pencil/>
                      </Button>
                      {isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {/* Items */}
                  {!isCollapsed && (
                    <div className="divide-y divide-border">
                      {catItems.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-muted-foreground italic">
                          No items in this category.{" "}
                          <button
                            className="text-primary underline"
                            onClick={() => setItemDialog({ open: true, initial: { categoryId: cat.id } })}
                          >
                            Add one
                          </button>
                        </div>
                      ) : (
                        catItems.map((item: any) => (
                          <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{item.name}</span>
                                {!item.available && (
                                  <Badge variant="destructive" className="text-xs py-0">86'd</Badge>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.description}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-4 shrink-0 ml-4">
                              <span className="font-mono text-sm font-semibold">
                                ₦{((item.priceKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <Switch
                                  checked={item.available}
                                  onCheckedChange={() => toggleItem.mutate({ id: item.id })}
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                aria-label="Edit" onClick={() => setItemDialog({ open: true, initial: item })}
                              ><Pencil/>
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                      <div className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-muted-foreground"
                          onClick={() => setItemDialog({ open: true, initial: { categoryId: cat.id } })}
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add item to {cat.name}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Dialogs */}
      <CategoryDialog
        open={catDialog.open}
        initial={catDialog.initial}
        onClose={() => setCatDialog({ open: false })}
      />
      <ItemDialog
        open={itemDialog.open}
        initial={itemDialog.initial}
        categories={categories}
        onClose={() => setItemDialog({ open: false })}
      />
    </div>
  );
}
