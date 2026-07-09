// @ts-nocheck
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, Search, Filter, Tag, Package, Star, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function fmt(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Storefront() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "name" | "priceKobo">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [cartId, setCartId] = useState<string | null>(() => localStorage.getItem("paygate_cart_id"));
  const [addingId, setAddingId] = useState<string | null>(null);

  const { data, isLoading } = trpc.ecommerce.products.list.useQuery({
    status: "active",
    search: search || undefined,
    category: category !== "all" ? category : undefined,
    sortBy,
    sortDir,
    limit: 48,
    offset: 0,
  }, { staleTime: 30_000 });

  const createCartMutation = trpc.ecommerce.cart.create.useMutation();
  const addItemMutation = trpc.ecommerce.cart.addItem.useMutation();

  const handleAddToCart = useCallback(async (productId: string, productName: string) => {
    setAddingId(productId);
    try {
      let currentCartId = cartId;
      if (!currentCartId) {
        const cart = await createCartMutation.mutateAsync({
          merchantId: "default",
          tenantId: "default",
          currency: "NGN",
        });
        currentCartId = cart.id;
        setCartId(cart.id);
        localStorage.setItem("paygate_cart_id", cart.id);
      }

      await addItemMutation.mutateAsync({ cartId: currentCartId, productId, quantity: 1 });
      toast.success(`${productName} added to cart`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add item to cart");
    } finally {
      setAddingId(null);
    }
  }, [cartId, createCartMutation, addItemMutation]);

  const categories = ["all", "Electronics", "Fashion", "Food & Beverages", "Health & Beauty", "Home & Garden", "Sports", "Books", "Services"];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Product Catalogue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data?.total ?? 0} products available
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/cart")}>
            <ShoppingCart className="w-4 h-4 mr-1.5" />
            Cart
          </Button>
          <Button size="sm" onClick={() => navigate("/products/new")}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <Tag className="w-3 h-3 mr-1" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c === "all" ? "All Categories" : c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Newest</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="priceKobo">Price</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
          <SelectTrigger className="w-28 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Ascending</SelectItem>
            <SelectItem value="desc">Descending</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border overflow-hidden">
              <Skeleton className="h-48 w-full" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : !data?.products?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">No products found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {search ? `No results for "${search}"` : "Add your first product to get started"}
          </p>
          <Button onClick={() => navigate("/products/new")}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Product
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.products.map((product: any) => (
            <div key={product.id} className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow group">
              {/* Product image */}
              <div className="relative h-48 bg-muted overflow-hidden">
                {(product.imageUrls as string[])?.[0] ? (
                  <img
                    src={(product.imageUrls as string[])[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                )}
                {product.comparePriceKobo && product.comparePriceKobo > product.priceKobo && (
                  <Badge className="absolute top-2 left-2 bg-rose-500 text-white text-xs">
                    {Math.round((1 - product.priceKobo / product.comparePriceKobo) * 100)}% OFF
                  </Badge>
                )}
                {product.trackInventory && product.inventoryQty === 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Badge variant="secondary" className="text-sm">Out of Stock</Badge>
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="p-4">
                {product.category && (
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{product.category}</p>
                )}
                <h3 className="font-semibold text-sm leading-tight mb-1 line-clamp-2">{product.name}</h3>
                {product.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{product.description}</p>
                )}
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-base font-bold font-mono">{fmt(Number(product.priceKobo))}</span>
                  {product.comparePriceKobo && Number(product.comparePriceKobo) > Number(product.priceKobo) && (
                    <span className="text-xs text-muted-foreground line-through font-mono">{fmt(Number(product.comparePriceKobo))}</span>
                  )}
                </div>
                {product.tags && (product.tags as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {(product.tags as string[]).slice(0, 3).map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs px-1.5 py-0">{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => handleAddToCart(product.id, product.name)}
                    disabled={addingId === product.id || (product.trackInventory && product.inventoryQty === 0)}
                  >
                    <ShoppingCart className="w-3 h-3 mr-1" />
                    {addingId === product.id ? "Adding..." : "Add to Cart"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-2"
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
