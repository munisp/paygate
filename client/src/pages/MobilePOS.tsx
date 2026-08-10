/**
 * MobilePOS — Offline-capable Point of Sale screen (Wave 75)
 * Uses trpc.pos.processPayment for real payment processing.
 * Uses useOfflineQueue for mutation queuing when offline.
 */
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Terminal,
  Receipt,
} from "lucide-react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";
import { trpc } from "@/lib/trpc";

interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

// Fallback offline catalog — used when network is unavailable
const OFFLINE_PRODUCTS = [
  { id: "p1", name: "Indomie Noodles", priceKobo: 35000, category: "food" },
  { id: "p2", name: "Peak Milk (tin)", priceKobo: 180000, category: "food" },
  { id: "p3", name: "Coca-Cola 60cl", priceKobo: 40000, category: "beverages" },
  { id: "p4", name: "Bread (Loaf)", priceKobo: 70000, category: "food" },
  { id: "p5", name: "Milo 200g", priceKobo: 120000, category: "beverages" },
  { id: "p6", name: "Airtime ₦500", priceKobo: 50000, category: "airtime" },
  { id: "p7", name: "Paracetamol (strip)", priceKobo: 15000, category: "pharmacy" },
  { id: "p8", name: "Bottled Water 75cl", priceKobo: 20000, category: "beverages" },
];

const PAYMENT_CHANNELS = [
  { value: "qr", label: "QR Code" },
  { value: "card", label: "Card" },
  { value: "nip", label: "NIP Transfer" },
  { value: "ussd", label: "USSD" },
] as const;

export default function MobilePOS() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPhone, setCustomerPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ txId: string; posId: string; receiptUrl: string } | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState<string>("");
  const [channel, setChannel] = useState<"qr" | "card" | "nip" | "ussd">("qr");
  const { pendingCount, flush, isFlushing } = useOfflineQueue();

  // Load registered POS terminals for this merchant
  const { data: terminalsData, isLoading } = trpc.pos.list.useQuery(
    { status: "active", limit: 20 },
    { staleTime: 60_000 }
  );
  const terminals = terminalsData?.rows ?? [];

  // Load product catalog from DB (falls back to offline catalog when unavailable)
  const { data: productsData, isLoading: productsLoading } = trpc.pos["products.list"].useQuery(
    { isActive: true, limit: 200 },
    { staleTime: 5 * 60_000 }
  );
  const dbProducts = productsData?.products ?? [];
  // Use DB products when available, fall back to offline catalog
  const products = dbProducts.length > 0
    ? dbProducts.map(p => ({ id: p.id, name: p.name, priceKobo: p.priceKobo, category: p.category }))
    : OFFLINE_PRODUCTS;

  // Auto-select first terminal when loaded
  useEffect(() => {
    if (!selectedTerminalId && terminals.length > 0) {
      setSelectedTerminalId(terminals[0].id);
    }
  }, [terminals, selectedTerminalId]);

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

  const addToCart = useCallback((product: { id: string; name: string; priceKobo: number; category?: string }) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: product.id, name: product.name, price: Math.round(product.priceKobo / 100), qty: 1 }];
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
  const totalKobo = total * 100; // Convert NGN to kobo

  // Real POS payment mutation using trpc.pos.processPayment
  const processPaymentMutation = trpc.pos.processPayment.useMutation({
    onSuccess: (data) => {
      setLastReceipt({
        txId: data.transactionId,
        posId: data.posTransactionId,
        receiptUrl: data.receiptUrl,
      });
      setCart([]);
      setCustomerPhone("");
      toast.success(`Payment of ₦${total.toLocaleString()} processed! TX: ${data.transactionId}`);
    },
    onError: (err: any) => {
      if (!navigator.onLine) {
        toast.info("Queued offline — will sync when back online");
        setCart([]);
      } else {
        toast.error(`Payment failed: ${err.message}`);
      }
    },
  });

  const handleCharge = async () => {
    if (cart.length === 0) {
      toast.error("Cart is empty");
      return;
    }
    if (!selectedTerminalId) {
      toast.error("No POS terminal selected. Please register a terminal first.");
      return;
    }
    setProcessing(true);
    try {
      await processPaymentMutation.mutateAsync({
        terminalId: selectedTerminalId,
        amountKobo: totalKobo,
        channel,
      });
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

      {/* Terminal & Channel Selector */}
      <Card className="mb-4">
        <CardContent className="p-3 space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Terminal className="h-3 w-3" /> POS Terminal
            </label>
            {isLoading ? (
              <div className="h-9 bg-muted rounded animate-pulse" />
            ) : terminals.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                No active terminals found. Register a terminal in POS Terminals settings.
              </p>
            ) : (
              <Select value={selectedTerminalId} onValueChange={setSelectedTerminalId}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select terminal" />
                </SelectTrigger>
                <SelectContent>
                  {terminals.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label ?? t.serialNumber} ({t.model})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <CreditCard className="h-3 w-3" /> Payment Channel
            </label>
            <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_CHANNELS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Sync button when offline queue has items */}
      {pendingCount > 0 && isOnline && (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm text-amber-700">
              {pendingCount} transaction{pendingCount > 1 ? "s" : ""} waiting to sync
            </span>
            <Button size="sm" variant="outline" aria-label="Refresh" onClick={flush} disabled={isFlushing}><RefreshCw/>
              Sync Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Last transaction success */}
      {lastReceipt && (
        <Card className="mb-4 border-green-200 bg-green-50">
          <CardContent className="p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-green-700 font-medium">Payment successful!</p>
              <p className="text-xs text-green-600 font-mono truncate">TX: {lastReceipt.txId}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-green-300 text-green-700"
              onClick={() => window.open(lastReceipt.receiptUrl, "_blank")}
            >
              <Receipt className="h-3 w-3 mr-1" /> Receipt
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setLastReceipt(null)}>
              ✕
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
            {productsLoading && dbProducts.length === 0 && (
              <div className="col-span-2 flex items-center justify-center py-8 text-muted-foreground text-sm">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Loading catalog…
              </div>
            )}
            {!productsLoading && products.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="p-3 text-left rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
              >
                <div className="text-xs font-medium text-gray-800 truncate">{product.name}</div>
                <div className="text-sm font-bold text-indigo-600 mt-1">
                  ₦{(product.priceKobo / 100).toLocaleString()}
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
        disabled={processing || cart.length === 0 || !selectedTerminalId}
      >
        <CreditCard className="h-5 w-5 mr-2" />
        {processing ? "Processing…" : `Charge ₦${total.toLocaleString()}`}
        {!isOnline && " (Offline)"}
      </Button>
      {!selectedTerminalId && terminals.length === 0 && !isLoading && (
        <p className="text-xs text-center text-amber-600 mt-2">
          Register a POS terminal in Settings → POS Terminals to enable payments
        </p>
      )}
    </div>
  );
}
