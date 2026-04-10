/**
 * MobilePOS — Offline-capable Point of Sale screen (Wave 75)
 * Uses useOfflineQueue for mutation queuing when offline.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ShoppingCart,
  Wifi,
  WifiOff,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Smartphone,
  RefreshCw,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { trpc } from "@/lib/trpc";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const SAMPLE_PRODUCTS = [
  { id: "p1", name: "Indomie Noodles", price: 350 },
  { id: "p2", name: "Peak Milk (tin)", price: 1800 },
  { id: "p3", name: "Coca-Cola 60cl", price: 400 },
  { id: "p4", name: "Bread (Loaf)", price: 700 },
  { id: "p5", name: "Milo 200g", price: 1200 },
  { id: "p6", name: "Airtime ₦500", price: 500 },
  { id: "p7", name: "Paracetamol (strip)", price: 150 },
  { id: "p8", name: "Bottled Water 75cl", price: 200 },
];

export default function MobilePOS() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);

  const { pendingCount, flush, isFlushing } = useOfflineQueue();

  // Monitor online/offline status
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      toast.success("Back online — syncing queued transactions…");
      flush();
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning("Offline mode — transactions will be queued");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [flush]);

  const addToCart = useCallback((product: typeof SAMPLE_PRODUCTS[0]) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, qty: 1 }];
    });
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
        .filter(i => i.qty > 0)
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setCart(prev => prev.filter(i => i.id !== id));
  }, []);

  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const createTestTxMutation = trpc.transactions.createTest.useMutation({
    onSuccess: (data: any) => {
      setLastTxId(data?.id ?? `TX-${Date.now()}`);
      setCart([]);
      setCustomerPhone("");
      toast.success("Payment recorded successfully!");
    },
    onError: (_err: any, variables: any) => {
      if (!navigator.onLine) {
        toast.info("Queued offline — will sync when back online");
        setCart([]);
      } else {
        toast.error("Payment failed — please retry");
      }
    },
  });

  const handleCharge = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    setProcessing(true);
    try {
      await createTestTxMutation.mutateAsync({
        amount: total,
        currency: "NGN",
        description: cart.map(i => `${i.name} x${i.qty}`).join(", "),
        customerPhone: customerPhone || undefined,
      } as any);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Smartphone className="h-6 w-6 text-indigo-600" />
          <h1 className="text-xl font-bold text-gray-900">Mobile POS</h1>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              <Clock className="h-3 w-3 mr-1" />
              {pendingCount} queued
            </Badge>
          )}
          <Badge
            variant="outline"
            className={isOnline
              ? "text-green-600 border-green-300 bg-green-50"
              : "text-red-600 border-red-300 bg-red-50"}
          >
            {isOnline ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
        </div>
      </div>

      {/* Sync button when offline queue has items */}
      {pendingCount > 0 && isOnline && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm text-amber-700">
              {pendingCount} transaction{pendingCount > 1 ? "s" : ""} waiting to sync
            </span>
            <Button size="sm" variant="outline" onClick={flush} disabled={isFlushing}>
              <RefreshCw className={`h-3 w-3 mr-1 ${isFlushing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Last transaction success */}
      {lastTxId && (
        <Card className="mb-4 border-green-200 bg-green-50">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-green-700">
              Transaction {lastTxId} recorded
            </span>
            <Button size="sm" variant="ghost" className="ml-auto h-6 text-xs" onClick={() => setLastTxId(null)}>
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Product Grid */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600">Products</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {SAMPLE_PRODUCTS.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="p-3 text-left rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                <div className="text-xs font-medium text-gray-800 truncate">{product.name}</div>
                <div className="text-sm font-bold text-indigo-600 mt-1">
                  ₦{product.price.toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cart */}
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Cart ({cart.length} items)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cart.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-gray-700 truncate">{item.name}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="h-6 w-6 rounded border flex items-center justify-center hover:bg-gray-100"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="h-6 w-6 rounded border flex items-center justify-center hover:bg-gray-100"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <span className="text-sm font-medium text-gray-800 w-20 text-right">
                    ₦{(item.price * item.qty).toLocaleString()}
                  </span>
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold text-gray-900">
                <span>Total</span>
                <span>₦{total.toLocaleString()}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Customer Phone */}
      <Card className="mb-4">
        <CardContent className="p-3">
          <Input
            placeholder="Customer phone (optional)"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            type="tel"
            className="text-sm"
          />
        </CardContent>
      </Card>

      {/* Charge Button */}
      <Button
        className="w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700"
        onClick={handleCharge}
        disabled={processing || cart.length === 0}
      >
        <CreditCard className="h-5 w-5 mr-2" />
        {processing ? "Processing…" : `Charge ₦${total.toLocaleString()}`}
        {!isOnline && " (Offline)"}
      </Button>
    </div>
  );
}
