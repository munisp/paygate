import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type CartItem = { sku: string; name: string; quantity: number; unitPriceKobo: number; discount: number };

export default function SmartRetailPOS() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sku, setSku] = useState("");
  const [itemName, setItemName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "qr" | "wallet" | "split">("card");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [lastSale, setLastSale] = useState<{ saleId: string; totalAmountKobo: number; receiptUrl: string; loyaltyPointsEarned: number } | null>(null);

  const { data: config } = trpc4.smartRetailPOS.getRetailConfig.useQuery();
  const { data: alerts } = trpc4.smartRetailPOS.getInventoryAlerts.useQuery();
  const { data: dailySummary } = trpc4.smartRetailPOS.getDailySalesSummary.useQuery({ date: selectedDate });

  const saleMutation = trpc4.smartRetailPOS.processRetailSale.useMutation({
    onSuccess: (d) => { toast.success(`Sale ${d.saleId} — ${formatKobo(d.totalAmountKobo)}`); setLastSale(d); setCart([]); },
    onError: (e) => toast.error(e.message),
  });
  const printMutation = trpc4.smartRetailPOS.printReceipt.useMutation({
    onSuccess: (d) => { if (d.receiptUrl) window.open(d.receiptUrl, "_blank"); toast.success("Receipt sent to printer"); },
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const addToCart = () => {
    if (!sku || !itemName || !unitPrice) return;
    setCart(prev => [...prev, { sku, name: itemName, quantity: 1, unitPriceKobo: Math.round(parseFloat(unitPrice) * 100), discount: 0 }]);
    setSku(""); setItemName(""); setUnitPrice("");
  };

  const updateQty = (i: number, qty: number) => setCart(prev => prev.map((item, idx) => idx === i ? { ...item, quantity: Math.max(1, qty) } : item));
  const removeItem = (i: number) => setCart(prev => prev.filter((_, idx) => idx !== i));

  const cartTotal = cart.reduce((sum, item) => sum + item.unitPriceKobo * item.quantity * (1 - item.discount / 100), 0);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Smart Retail POS</h1>

      {/* Config Status */}
      {config && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant={config.enabled ? "default" : "secondary"}>POS {config.enabled ? "Active" : "Inactive"}</Badge>
          {config.printerConnected && <Badge variant="outline">🖨️ Printer</Badge>}
          {config.barcodeScanner && <Badge variant="outline">📷 Scanner</Badge>}
          {config.weighingScale && <Badge variant="outline">⚖️ Scale</Badge>}
          {config.loyaltyIntegration && <Badge variant="outline">🎁 Loyalty</Badge>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cart */}
        <Card>
          <CardHeader><CardTitle>Cart</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Input placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} />
              <Input placeholder="Product Name" value={itemName} onChange={e => setItemName(e.target.value)} />
              <Input placeholder="Price (₦)" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} />
            </div>
            <Button size="sm" variant="outline" onClick={addToCart}>+ Add Item</Button>

            {cart.length > 0 && (
              <>
                <div className="space-y-2">
                  {cart.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.sku} · {formatKobo(item.unitPriceKobo)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateQty(i, item.quantity - 1)}>-</Button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => updateQty(i, item.quantity + 1)}>+</Button>
                      </div>
                      <p className="text-sm font-bold w-20 text-right">{formatKobo(item.unitPriceKobo * item.quantity)}</p>
                      <Button size="sm" variant="ghost" className="text-red-500 h-6 px-2" onClick={() => removeItem(i)}>×</Button>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-3">
                  <div className="flex justify-between font-bold text-lg mb-3">
                    <span>Total</span>
                    <span>{formatKobo(cartTotal)}</span>
                  </div>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {(["cash", "card", "transfer", "qr", "wallet"] as const).map(m => (
                      <Button key={m} size="sm" variant={paymentMethod === m ? "default" : "outline"} onClick={() => setPaymentMethod(m)} className="capitalize">{m}</Button>
                    ))}
                  </div>
                  <Button className="w-full" disabled={saleMutation.isPending}
                    onClick={() => saleMutation.mutate({ items: cart, paymentMethod, applyLoyalty: config?.loyaltyIntegration ?? false })}>
                    {saleMutation.isPending ? "Processing..." : `Process Sale — ${formatKobo(cartTotal)}`}
                  </Button>
                </div>
              </>
            )}
            {cart.length === 0 && <p className="text-muted-foreground text-sm text-center py-4">Cart is empty. Add items to start a sale.</p>}
          </CardContent>
        </Card>

        {/* Right Panel */}
        <div className="space-y-4">
          {/* Last Sale */}
          {lastSale && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2"><CardTitle className="text-base text-green-700">Last Sale</CardTitle></CardHeader>
              <CardContent>
                <p className="font-bold text-xl text-green-700">{formatKobo(lastSale.totalAmountKobo)}</p>
                <p className="text-xs text-muted-foreground">Sale ID: {lastSale.saleId}</p>
                {lastSale.loyaltyPointsEarned > 0 && <p className="text-xs text-purple-600">+{lastSale.loyaltyPointsEarned} loyalty points</p>}
                <Button size="sm" variant="outline" className="mt-2" disabled={printMutation.isPending}
                  onClick={() => printMutation.mutate({ saleId: lastSale.saleId })}>
                  Print Receipt
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Daily Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Daily Summary</CardTitle>
                <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-36 h-8 text-xs" />
              </div>
            </CardHeader>
            <CardContent>
              {dailySummary ? (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div><p className="text-xs text-muted-foreground">Total Sales</p><p className="text-xl font-bold">{formatKobo(dailySummary.totalSalesKobo)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Transactions</p><p className="text-xl font-bold">{dailySummary.totalTransactions}</p></div>
                    <div><p className="text-xs text-muted-foreground">Avg Transaction</p><p className="font-semibold">{formatKobo(dailySummary.avgTransactionKobo)}</p></div>
                  </div>
                  {dailySummary.topProducts?.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Top Products</p>
                      {dailySummary.topProducts.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex justify-between text-xs py-1 border-b">
                          <span>{p.name}</span>
                          <span>{p.quantity} units · {formatKobo(p.revenueKobo)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : <p className="text-muted-foreground text-sm">No sales data for this date</p>}
            </CardContent>
          </Card>

          {/* Inventory Alerts */}
          {alerts && alerts.alerts?.length > 0 && (
            <Card className="border-orange-200">
              <CardHeader className="pb-2"><CardTitle className="text-base text-orange-600">Inventory Alerts ({alerts.alerts.length})</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {alerts.alerts.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div>
                        <p className="font-medium">{a.productName}</p>
                        <p className="text-xs text-muted-foreground">{a.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-orange-600 font-semibold">{a.currentStock} left</p>
                        <p className="text-xs text-muted-foreground">Reorder at {a.reorderLevel}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
