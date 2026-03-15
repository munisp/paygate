import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Globe, Copy, ExternalLink, ShoppingCart, CheckCircle2,
  Package, Truck, Clock, AlertCircle,
} from "lucide-react";

// ─── Public storefront (no auth required) ─────────────────────────────────────
export function PublicOrderPage({ slug }: { slug: string }) {
  const { data: menu, isLoading, error } = trpc.restaurant.getPublicMenu.useQuery({ slug });
  const placeOrder = trpc.restaurant.placeOnlineOrder.useMutation();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading menu…</p>
      </div>
    </div>
  );

  if (error || !menu) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-gray-600">Restaurant not found or menu unavailable.</p>
      </div>
    </div>
  );

  const cartItems = menu.items.filter((i: any) => (cart[i.id] ?? 0) > 0).map((i: any) => ({
    menuItemId: i.id,
    name: i.name,
    qty: cart[i.id],
    unitPriceKobo: i.priceKobo,
  }));
  const totalKobo = cartItems.reduce((s: number, i: any) => s + i.qty * i.unitPriceKobo, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) { toast.error("Add at least one item to your order."); return; }
    if (!customerName.trim() || !customerPhone.trim()) { toast.error("Name and phone are required."); return; }
    try {
      await placeOrder.mutateAsync({ slug, customerName, customerPhone, deliveryAddress, notes, items: cartItems });
      setSubmitted(true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to place order. Please try again.");
    }
  };

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm">
        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h2>
        <p className="text-gray-500 mb-4">Thank you, {customerName}. {menu.merchantName} will prepare your order shortly.</p>
        <Button variant="outline" onClick={() => { setSubmitted(false); setCart({}); }}>Place Another Order</Button>
      </div>
    </div>
  );

  const categorised = menu.categories.map((cat: any) => ({
    ...cat,
    items: menu.items.filter((i: any) => i.categoryId === cat.id),
  }));
  const uncategorised = menu.items.filter((i: any) => !menu.categories.some((c: any) => c.id === i.categoryId));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-emerald-700 text-white py-8 px-4 text-center">
        <h1 className="text-3xl font-bold">{menu.merchantName}</h1>
        <p className="text-emerald-200 mt-1 text-sm">Online Ordering</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Menu */}
        {categorised.map((cat: any) => cat.items.length > 0 && (
          <div key={cat.id}>
            <h3 className="font-semibold text-gray-700 mb-3 uppercase text-xs tracking-widest">{cat.name}</h3>
            <div className="space-y-2">
              {cat.items.map((item: any) => (
                <MenuItemRow key={item.id} item={item} qty={cart[item.id] ?? 0}
                  onAdd={() => setCart(c => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                  onRemove={() => setCart(c => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))} />
              ))}
            </div>
          </div>
        ))}
        {uncategorised.length > 0 && (
          <div>
            <h3 className="font-semibold text-gray-700 mb-3 uppercase text-xs tracking-widest">Other Items</h3>
            <div className="space-y-2">
              {uncategorised.map((item: any) => (
                <MenuItemRow key={item.id} item={item} qty={cart[item.id] ?? 0}
                  onAdd={() => setCart(c => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }))}
                  onRemove={() => setCart(c => ({ ...c, [item.id]: Math.max(0, (c[item.id] ?? 0) - 1) }))} />
              ))}
            </div>
          </div>
        )}
        {menu.items.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-2" />
            <p>No menu items available yet.</p>
          </div>
        )}

        {/* Cart summary */}
        {cartItems.length > 0 && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-emerald-800 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Your Order
                </span>
                <span className="font-bold text-emerald-700">
                  ₦{(totalKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </span>
              </div>
              {cartItems.map((i: any) => (
                <div key={i.menuItemId} className="flex justify-between text-sm text-emerald-700">
                  <span>{i.qty}× {i.name}</span>
                  <span>₦{((i.qty * i.unitPriceKobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Checkout form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Your Details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input id="name" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" required />
                </div>
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input id="phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="08012345678" required />
                </div>
              </div>
              <div>
                <Label htmlFor="address" className="flex items-center gap-1"><Truck className="w-3 h-3" /> Delivery Address (optional)</Label>
                <Input id="address" value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} placeholder="Leave blank for pickup" />
              </div>
              <div>
                <Label htmlFor="notes" className="flex items-center gap-1"><Clock className="w-3 h-3" /> Special Instructions</Label>
                <Input id="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, preferences…" />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={placeOrder.isPending}>
                {placeOrder.isPending ? "Placing Order…" : `Place Order${totalKobo > 0 ? ` — ₦${(totalKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : ""}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MenuItemRow({ item, qty, onAdd, onRemove }: { item: any; qty: number; onAdd: () => void; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-lg px-4 py-3 shadow-sm border border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
        {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
        <p className="text-sm font-semibold text-emerald-700 mt-0.5">
          ₦{(item.priceKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {qty > 0 && (
          <>
            <Button size="sm" variant="outline" className="w-7 h-7 p-0 text-base" onClick={onRemove}>−</Button>
            <span className="w-5 text-center text-sm font-semibold">{qty}</span>
          </>
        )}
        <Button size="sm" className="w-7 h-7 p-0 text-base bg-emerald-600 hover:bg-emerald-700" onClick={onAdd}>+</Button>
      </div>
    </div>
  );
}

// ─── Merchant management panel ─────────────────────────────────────────────────
export default function RestaurantOnlineOrdering() {
  const { user } = useAuth();
  const { data: linkData, isLoading } = trpc.restaurant.getOnlineOrderingLink.useQuery(undefined, { enabled: !!user });

  const orderingUrl = linkData ? `${window.location.origin}/order/${linkData.slug}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(orderingUrl);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Online Ordering</h1>
        <p className="text-gray-500 text-sm mt-1">Share your ordering link with customers to receive orders directly.</p>
      </div>

      {/* Link card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="w-4 h-4 text-emerald-600" /> Your Ordering Link
            {linkData?.active && <Badge className="bg-emerald-100 text-emerald-700 text-xs">Active</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="h-9 bg-gray-100 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <Input value={orderingUrl} readOnly className="font-mono text-sm bg-gray-50" />
              <Button variant="outline" size="sm" onClick={copyLink}><Copy className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => window.open(orderingUrl, "_blank")}>
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Customers can browse your menu and place orders without creating an account.
            Orders appear in the <strong>Restaurant Orders</strong> page.
          </p>
        </CardContent>
      </Card>

      <Separator />

      {/* How it works */}
      <div>
        <h2 className="font-semibold text-gray-700 mb-4">How It Works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Globe, title: "Share Link", desc: "Send your ordering URL via WhatsApp, Instagram, or your website." },
            { icon: ShoppingCart, title: "Customer Orders", desc: "Customers browse your menu and place orders with their phone number." },
            { icon: CheckCircle2, title: "You Receive", desc: "Orders appear in Restaurant Orders and you get a push notification." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center text-center p-4 bg-gray-50 rounded-lg">
              <Icon className="w-8 h-8 text-emerald-600 mb-2" />
              <p className="font-semibold text-sm text-gray-800">{title}</p>
              <p className="text-xs text-gray-500 mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>Tip:</strong> Keep your menu up to date in <strong>Restaurant → Menu</strong> to ensure customers see accurate prices and availability.
      </div>
    </div>
  );
}
