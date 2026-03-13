import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, RefreshCw, UtensilsCrossed, Tag } from "lucide-react";

export default function RestaurantMenu() {
  const { isAuthenticated } = useAuth();
  const [catOpen, setCatOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", displayOrder: "0" });
  const [itemForm, setItemForm] = useState({ categoryId: "", name: "", description: "", priceNgn: "", available: true });

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.restaurant.listMenu.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const upsertCategory = trpc.restaurant.upsertCategory.useMutation({
    onSuccess: () => { utils.restaurant.listMenu.invalidate(); setCatOpen(false); setCatForm({ name: "", displayOrder: "0" }); toast.success("Category saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const upsertItem = trpc.restaurant.upsertMenuItem.useMutation({
    onSuccess: () => { utils.restaurant.listMenu.invalidate(); setItemOpen(false); setItemForm({ categoryId: "", name: "", description: "", priceNgn: "", available: true }); toast.success("Menu item saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleItem = trpc.restaurant.toggleItemAvailability.useMutation({
    onSuccess: () => utils.restaurant.listMenu.invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const categories: any[] = (data as any)?.categories ?? [];
  const items: any[] = (data as any)?.items ?? [];

  const itemsByCategory = (catId: string) => items.filter((i: any) => i.categoryId === catId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage categories, items, pricing, and availability</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" /> Refresh</Button>

          {/* Add Category */}
          <Dialog open={catOpen} onOpenChange={setCatOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Tag className="w-4 h-4 mr-2" /> Add Category</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Menu Category</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Input placeholder="Category name (e.g. Starters)" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                <Input type="number" placeholder="Display order" value={catForm.displayOrder} onChange={(e) => setCatForm({ ...catForm, displayOrder: e.target.value })} />
                <Button className="w-full" disabled={!catForm.name} onClick={() => upsertCategory.mutate({ name: catForm.name, displayOrder: parseInt(catForm.displayOrder) || 0 })}>Save Category</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Item */}
          <Dialog open={itemOpen} onOpenChange={setItemOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Menu Item</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <Select value={itemForm.categoryId} onValueChange={(v) => setItemForm({ ...itemForm, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Item name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
                <Input placeholder="Description (optional)" value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
                <Input type="number" placeholder="Price (₦)" value={itemForm.priceNgn} onChange={(e) => setItemForm({ ...itemForm, priceNgn: e.target.value })} />
                <div className="flex items-center gap-2">
                  <Switch checked={itemForm.available} onCheckedChange={(v) => setItemForm({ ...itemForm, available: v })} />
                  <span className="text-sm">Available now</span>
                </div>
                <Button className="w-full" disabled={!itemForm.name || !itemForm.categoryId || !itemForm.priceNgn}
                  onClick={() => upsertItem.mutate({
                    categoryId: itemForm.categoryId,
                    name: itemForm.name,
                    description: itemForm.description,
                    priceKobo: Math.round(parseFloat(itemForm.priceNgn) * 100),
                    available: itemForm.available,
                  })}>
                  Save Item
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading menu…</div>
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No menu categories yet. Start by adding a category.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat: any) => {
            const catItems = itemsByCategory(cat.id);
            return (
              <Card key={cat.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    {cat.name}
                    <span className="text-sm font-normal text-muted-foreground">({catItems.length} items)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {catItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items in this category yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {catItems.map((item: any) => (
                        <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-sm">₦{((item.priceKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                            <div className="flex items-center gap-1.5">
                              <Switch
                                checked={item.available}
                                onCheckedChange={() => toggleItem.mutate({ id: item.id })}
                              />
                              <span className="text-xs text-muted-foreground">{item.available ? "On" : "Off"}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
