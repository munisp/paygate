import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { UtensilsCrossed, Plus, Trash2, Edit, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";

export default function MenuManagement() {
  const { user } = useAuth();
  const merchantQuery = trpc.auth.me.useQuery();
  const merchantId = (merchantQuery.data as any)?.merchant?.id ?? "";

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);

  const [catForm, setCatForm] = useState({ name: "", displayOrder: "0" });
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    priceKobo: "",
    imageUrl: "",
    categoryId: "",
  });

  const { isLoading: statsLoading } = trpc.menuMgmt.getMenuStats.useQuery(
    { merchantId },
    { enabled: !!merchantId , staleTime: 30_000 })
  const categoriesQuery = trpc.menuMgmt.listCategories.useQuery(
    { merchantId },
    { enabled: !!merchantId , staleTime: 30_000 })
  const itemsQuery = trpc.menuMgmt.listItems.useQuery(
    { merchantId, categoryId: selectedCategoryId },
    { enabled: !!merchantId , staleTime: 30_000 })

  const createCatMutation = trpc.menuMgmt.createCategory.useMutation({
    onSuccess: () => {
      toast.success("Category created");
      categoriesQuery.refetch();
      statsQuery.refetch();
      setCatDialogOpen(false);
      setCatForm({ name: "", displayOrder: "0" });
      setEditingCat(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCatMutation = trpc.menuMgmt.updateCategory.useMutation({
    onSuccess: () => {
      toast.success("Category updated");
      categoriesQuery.refetch();
      setCatDialogOpen(false);
      setEditingCat(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCatMutation = trpc.menuMgmt.deleteCategory.useMutation({
    onSuccess: () => {
      toast.success("Category deleted");
      categoriesQuery.refetch();
      statsQuery.refetch();
      if (selectedCategoryId === editingCat?.id) setSelectedCategoryId(undefined);
    },
    onError: (e) => toast.error(e.message),
  });

  const createItemMutation = trpc.menuMgmt.createItem.useMutation({
    onSuccess: () => {
      toast.success("Item created");
      itemsQuery.refetch();
      statsQuery.refetch();
      setItemDialogOpen(false);
      setItemForm({ name: "", description: "", priceKobo: "", imageUrl: "", categoryId: "" });
      setEditingItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItemMutation = trpc.menuMgmt.updateItem.useMutation({
    onSuccess: () => {
      toast.success("Item updated");
      itemsQuery.refetch();
      setItemDialogOpen(false);
      setEditingItem(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteItemMutation = trpc.menuMgmt.deleteItem.useMutation({
    onSuccess: () => {
      toast.success("Item deleted");
      itemsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleItemMutation = trpc.menuMgmt.toggleItemAvailability.useMutation({
    onSuccess: () => {
      itemsQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, displayOrder: String(cat.displayOrder) });
    setCatDialogOpen(true);
  };

  const openEditItem = (item: any) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description ?? "",
      priceKobo: String(item.priceKobo),
      imageUrl: item.imageUrl ?? "",
      categoryId: item.categoryId,
    });
    setItemDialogOpen(true);
  };

  const handleCatSubmit = () => {
    if (editingCat) {
      updateCatMutation.mutate({
        id: editingCat.id,
        merchantId,
        name: catForm.name,
        displayOrder: parseInt(catForm.displayOrder) || 0,
      });
    } else {
      createCatMutation.mutate({
        merchantId,
        name: catForm.name,
        displayOrder: parseInt(catForm.displayOrder) || 0,
      });
    }
  };

  const handleItemSubmit = () => {
    const categoryId = itemForm.categoryId || selectedCategoryId || (categoriesQuery.data?.[0]?.id ?? "");
    if (editingItem) {
      updateItemMutation.mutate({
        id: editingItem.id,
        merchantId,
        name: itemForm.name,
        description: itemForm.description || undefined,
        priceKobo: parseInt(itemForm.priceKobo) || 0,
        imageUrl: itemForm.imageUrl || undefined,
      });
    } else {
      createItemMutation.mutate({
        merchantId,
        categoryId,
        name: itemForm.name,
        description: itemForm.description || undefined,
        priceKobo: parseInt(itemForm.priceKobo) || 0,
        imageUrl: itemForm.imageUrl || undefined,
      });
    }
  };

  const stats = statsQuery.data;
  const categories = categoriesQuery.data ?? [];
  const items = itemsQuery.data ?? [];

  if (!merchantId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading merchant data...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="w-6 h-6 text-orange-600" />
            Menu Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your restaurant menu categories and items
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{stats.totalCategories}</div><div className="text-xs text-muted-foreground">Categories</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold">{stats.totalItems}</div><div className="text-xs text-muted-foreground">Total Items</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-green-600">{stats.availableItems}</div><div className="text-xs text-muted-foreground">Available</div></CardContent></Card>
          <Card><CardContent className="pt-4"><div className="text-2xl font-bold text-red-500">{stats.unavailableItems}</div><div className="text-xs text-muted-foreground">Unavailable</div></CardContent></Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Categories Panel */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Categories</h2>
            <Dialog open={catDialogOpen} onOpenChange={(o) => { setCatDialogOpen(o); if (!o) { setEditingCat(null); setCatForm({ name: "", displayOrder: "0" }); } }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Starters" />
                  </div>
                  <div>
                    <Label>Display Order</Label>
                    <Input type="number" value={catForm.displayOrder} onChange={e => setCatForm(p => ({ ...p, displayOrder: e.target.value }))} />
                  </div>
                  <Button className="w-full" disabled={!catForm.name} onClick={handleCatSubmit}>
                    {editingCat ? "Update" : "Create"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => setSelectedCategoryId(undefined)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${!selectedCategoryId ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              All Items
            </button>
            {categories.map(cat => (
              <div
                key={cat.id}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedCategoryId === cat.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                <span className="text-sm">{cat.name}</span>
                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEditCat(cat)} className="p-1 hover:opacity-70">
                    <Edit className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("Delete this category?")) deleteCatMutation.mutate({ id: cat.id, merchantId });
                    }}
                    className="p-1 hover:opacity-70 text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">No categories yet</div>
            )}
          </div>
        </div>

        {/* Items Panel */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {selectedCategoryId
                ? `Items in "${categories.find(c => c.id === selectedCategoryId)?.name ?? ""}"`
                : "All Items"}
            </h2>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Refresh" onClick={() => itemsQuery.refetch()}><RefreshCw/>
              </Button>
              <Dialog open={itemDialogOpen} onOpenChange={(o) => { setItemDialogOpen(o); if (!o) { setEditingItem(null); setItemForm({ name: "", description: "", priceKobo: "", imageUrl: "", categoryId: "" }); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1" disabled={categories.length === 0}>
                    <Plus className="w-3 h-3" /> Add Item
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingItem ? "Edit Item" : "New Menu Item"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {!editingItem && (
                      <div>
                        <Label>Category</Label>
                        <Select
                          value={itemForm.categoryId || selectedCategoryId || ""}
                          onValueChange={v => setItemForm(p => ({ ...p, categoryId: v }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                          <SelectContent>
                            {categories.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <Label>Name</Label>
                      <Input value={itemForm.name} onChange={e => setItemForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Jollof Rice" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Input value={itemForm.description} onChange={e => setItemForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
                    </div>
                    <div>
                      <Label>Price (Kobo)</Label>
                      <Input type="number" value={itemForm.priceKobo} onChange={e => setItemForm(p => ({ ...p, priceKobo: e.target.value }))} placeholder="e.g. 250000 for ₦2,500" />
                      {itemForm.priceKobo && (
                        <div className="text-xs text-muted-foreground mt-1">
                          = ₦{(parseInt(itemForm.priceKobo) / 100).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div>
                      <Label>Image URL (optional)</Label>
                      <Input value={itemForm.imageUrl} onChange={e => setItemForm(p => ({ ...p, imageUrl: e.target.value }))} placeholder="https://..." />
                    </div>
                    <Button className="w-full" disabled={!itemForm.name || !itemForm.priceKobo} onClick={handleItemSubmit}>
                      {editingItem ? "Update Item" : "Create Item"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="space-y-2">
            {items.map(item => (
              <Card key={item.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{item.name}</span>
                          <Badge variant={item.available ? "default" : "secondary"} className="text-xs">
                            {item.available ? "Available" : "Unavailable"}
                          </Badge>
                        </div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground">{item.description}</div>
                        )}
                        <div className="text-sm font-semibold text-green-700 mt-0.5">
                          ₦{(item.priceKobo / 100).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => toggleItemMutation.mutate({ id: item.id, merchantId })}
                        className="p-1.5 hover:bg-muted rounded"
                        title={item.available ? "Mark unavailable" : "Mark available"}
                      >
                        {item.available
                          ? <ToggleRight className="w-4 h-4 text-green-600" />
                          : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button onClick={() => openEditItem(item)} className="p-1.5 hover:bg-muted rounded">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this item?")) deleteItemMutation.mutate({ id: item.id, merchantId });
                        }}
                        className="p-1.5 hover:bg-muted rounded text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {items.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No items found. Add your first menu item above.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
