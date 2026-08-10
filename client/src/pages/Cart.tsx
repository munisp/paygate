// @ts-nocheck
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ShoppingCart, Trash2, Plus, Minus, ArrowLeft, ArrowRight, Package, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function fmt(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Cart() {
  const [, navigate] = useLocation();
  const [cartId] = useState<string | null>(() => localStorage.getItem("paygate_cart_id"));
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.ecommerce.cart.get.useQuery(
    { cartId: cartId ?? undefined },
    { enabled: !!cartId, staleTime: 10_000 },
  );

  const removeItemMutation = trpc.ecommerce.cart.removeItem.useMutation({
    onSuccess: () => {
      utils.ecommerce.cart.get.invalidate();
      toast.success("Item removed from cart");
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to remove item"),
  });

  const updateQtyMutation = trpc.ecommerce.cart.updateQuantity.useMutation({
    onSuccess: () => utils.ecommerce.cart.get.invalidate(),
    onError: (err: any) => toast.error(err?.message ?? "Failed to update quantity"),
  });

  const clearCartMutation = trpc.ecommerce.cart.clear.useMutation({
    onSuccess: () => {
      utils.ecommerce.cart.get.invalidate();
      toast.success("Cart cleared");
    },
  });

  const cart = data?.cart;
  const items = data?.items ?? [];
  const isEmpty = !cart || items.length === 0;

  if (!cartId || (!isLoading && isEmpty)) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShoppingCart className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-sm text-muted-foreground mb-6">Add some products to get started</p>
          <Button onClick={() => navigate("/storefront")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Browse Products
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Shopping Cart
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${items.length} item${items.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/storefront")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Continue Shopping
          </Button>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-rose-600 border-rose-200 hover:bg-rose-50"
              onClick={() => clearCartMutation.mutate({ cartId: cartId! })}
              disabled={clearCartMutation.isPending}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Cart
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart items */}
        <div className="lg:col-span-2 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4">
                <Skeleton className="h-20 w-full" />
              </div>
            ))
          ) : (
            items.map((item: any) => (
              <div key={item.id} className="bg-card rounded-xl border border-border p-4 flex gap-4">
                {/* Product image */}
                <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0 overflow-hidden">
                  {(item.productSnapshot as any)?.imageUrl ? (
                    <img
                      src={(item.productSnapshot as any).imageUrl}
                      alt={(item.productSnapshot as any).name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                </div>

                {/* Product details */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm leading-tight mb-0.5 truncate">
                    {(item.productSnapshot as any)?.name ?? "Product"}
                  </h3>
                  {(item.productSnapshot as any)?.sku && (
                    <p className="text-xs text-muted-foreground mb-2">
                      SKU: {(item.productSnapshot as any).sku}
                    </p>
                  )}
                  <p className="text-sm font-mono font-semibold">{fmt(Number(item.unitPriceKobo))}</p>
                </div>

                {/* Quantity controls */}
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 border border-border rounded-lg overflow-hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none"
                      onClick={() => {
                        if (item.quantity <= 1) {
                          removeItemMutation.mutate({ cartItemId: item.id });
                        } else {
                          updateQtyMutation.mutate({ cartItemId: item.id, quantity: item.quantity - 1 });
                        }
                      }}
                      disabled={updateQtyMutation.isPending || removeItemMutation.isPending}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-none"
                      onClick={() => updateQtyMutation.mutate({ cartItemId: item.id, quantity: item.quantity + 1 })}
                      disabled={updateQtyMutation.isPending}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                  <p className="text-sm font-bold font-mono">{fmt(Number(item.totalPriceKobo))}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => removeItemMutation.mutate({ cartItemId: item.id })}
                    disabled={removeItemMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Order summary */}
        <div className="lg:col-span-1">
          <div className="bg-card rounded-xl border border-border p-5 sticky top-6">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Order Summary</h3>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-full mt-4" />
              </div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
                    <span className="font-mono">{fmt(Number(cart?.subtotalKobo ?? 0))}</span>
                  </div>
                  {Number(cart?.discountKobo ?? 0) > 0 && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Discount</span>
                      <span className="font-mono">-{fmt(Number(cart.discountKobo))}</span>
                    </div>
                  )}
                  {Number(cart?.shippingKobo ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="font-mono">{fmt(Number(cart.shippingKobo))}</span>
                    </div>
                  )}
                  {Number(cart?.taxKobo ?? 0) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">VAT (7.5%)</span>
                      <span className="font-mono">{fmt(Number(cart.taxKobo))}</span>
                    </div>
                  )}
                </div>

                <Separator className="my-3" />

                <div className="flex justify-between font-bold text-base mb-4">
                  <span>Total</span>
                  <span className="font-mono">{fmt(Number(cart?.totalKobo ?? 0))}</span>
                </div>

                {/* Coupon code */}
                <div className="flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Coupon code"
                      className="w-full pl-7 pr-3 h-8 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <Button variant="outline" size="sm" className="text-xs">Apply</Button>
                </div>

                <Button
                  className="w-full"
                  onClick={() => navigate(`/checkout?cartId=${cartId}`)}
                  disabled={isEmpty}
                >
                  Proceed to Checkout
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>

                <div className="mt-3 flex flex-wrap gap-1 justify-center">
                  {["Card", "Bank Transfer", "USSD", "BNPL"].map(m => (
                    <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
