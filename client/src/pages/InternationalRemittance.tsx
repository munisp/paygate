import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type DeliveryMethod = "bank_transfer" | "mobile_money" | "cash_pickup" | "wallet";

export default function InternationalRemittance() {
  const [selectedCorridor, setSelectedCorridor] = useState<string | null>(null);
  const [sendAmount, setSendAmount] = useState("100");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("bank_transfer");
  const [quoteParams, setQuoteParams] = useState<{ corridorId: string; sendAmountUSD: number; deliveryMethod: DeliveryMethod } | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const { data: corridors } = trpc.newFeatures.internationalRemittance.getCorridors.useQuery();
  const { data: transfers } = trpc.newFeatures.internationalRemittance.getTransferHistory.useQuery({ page: 1, limit: 20 });
  const { data: quoteData } = trpc.newFeatures.internationalRemittance.getQuote.useQuery(
    quoteParams ?? { corridorId: "", sendAmountUSD: 0, deliveryMethod: "bank_transfer" },
    { enabled: !!quoteParams }
  );
  const { data: trackingData } = trpc.newFeatures.internationalRemittance.trackTransfer.useQuery(
    { trackingNumber },
    { enabled: trackingNumber.length > 5 }
  );

  const transferMutation = trpc.newFeatures.internationalRemittance.initiateTransfer.useMutation({
    onSuccess: (d: any) => { toast.success(`Transfer initiated: ${d.trackingNumber}`); setQuoteParams(null); },
    onError: (e: any) => toast.error(e.message),
  });

  const selectedCorridorData = corridors?.corridors?.find(c => c.id === selectedCorridor);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">International Remittance</h1>

      {/* Corridors */}
      <Card>
        <CardHeader><CardTitle>Available Corridors</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {corridors?.corridors?.map(c => (
              <div key={c.id}
                className={`p-3 border rounded-lg cursor-pointer transition-all ${selectedCorridor === c.id ? "ring-2 ring-primary bg-primary/5" : "hover:border-primary"}`}
                onClick={() => setSelectedCorridor(c.id)}>
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm">{c.fromCurrency} → {c.toCurrency}</p>
                  <Badge variant="outline" className="text-xs">{c.transferTime}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{c.fromCountry} → {c.toCountry}</p>
                <p className="text-xs mt-1">Rate: <strong>1 {c.fromCurrency} = {c.exchangeRate} {c.toCurrency}</strong></p>
                <p className="text-xs text-muted-foreground">Fee: ${c.fee} · Min: ${c.minAmountUSD} · Max: ${c.maxAmountUSD}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.providers?.map((p: any, i: any) => <span key={i} className="text-xs bg-muted px-1 rounded">{p}</span>)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Get Quote */}
      {selectedCorridor && (
        <Card>
          <CardHeader><CardTitle>Get Quote — {selectedCorridorData?.fromCurrency} → {selectedCorridorData?.toCurrency}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Send Amount (USD)</label>
                <Input value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="100" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Delivery Method</label>
                <select className="w-full border rounded-md px-3 py-2 text-sm mt-1 bg-background" value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value as DeliveryMethod)}>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="cash_pickup">Cash Pickup</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button className="w-full"
                  onClick={() => setQuoteParams({ corridorId: selectedCorridor, sendAmountUSD: parseFloat(sendAmount), deliveryMethod })}>
                  Get Quote
                </Button>
              </div>
            </div>

            {quoteData && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><p className="text-xs text-muted-foreground">You Send</p><p className="font-bold">${quoteData.sendAmountUSD}</p></div>
                  <div><p className="text-xs text-muted-foreground">They Receive</p><p className="font-bold text-green-600">{quoteData.receiveAmount} {quoteData.receiveCurrency}</p></div>
                  <div><p className="text-xs text-muted-foreground">Exchange Rate</p><p className="font-bold">1 USD = {quoteData.exchangeRate} {quoteData.receiveCurrency}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total Cost</p><p className="font-bold">${quoteData.totalCostUSD} (fee: ${quoteData.feeUSD})</p></div>
                </div>
                <p className="text-xs text-muted-foreground">Delivery: {quoteData.deliveryTime} · Quote expires: {new Date(quoteData.expiresAt).toLocaleString()}</p>

                <div className="border-t pt-3 space-y-3">
                  <p className="font-medium text-sm">Recipient Details</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-xs text-muted-foreground">Name</label><Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="John Doe" /></div>
                    <div><label className="text-xs text-muted-foreground">Phone</label><Input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} placeholder="+2348012345678" /></div>
                    <div><label className="text-xs text-muted-foreground">Account Number</label><Input value={recipientAccount} onChange={e => setRecipientAccount(e.target.value)} placeholder="0123456789" /></div>
                  </div>
                  <Button disabled={transferMutation.isPending}
                    onClick={() => transferMutation.mutate({ quoteId: quoteData.quoteId, recipientName, recipientPhone, recipientAccountNumber: recipientAccount || undefined, purpose: "family_support" })}>
                    {transferMutation.isPending ? "Initiating..." : "Initiate Transfer"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Track Transfer */}
      <Card>
        <CardHeader><CardTitle>Track Transfer</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Enter tracking number..." value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
          {trackingData && (
            <div className="p-3 border rounded-lg space-y-2">
              <div className="flex justify-between">
                <p className="font-semibold">{trackingData.trackingNumber}</p>
                <Badge variant={trackingData.status === "delivered" ? "default" : "secondary"}>{trackingData.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Est. Delivery: {new Date(trackingData.estimatedDelivery).toLocaleString()}</p>
              {trackingData.deliveredAt && <p className="text-xs text-green-600">Delivered: {new Date(trackingData.deliveredAt).toLocaleString()}</p>}
              <div className="space-y-1 mt-2">
                {trackingData.statusHistory?.map((h: any, i: any) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-muted-foreground w-32 shrink-0">{new Date(h.timestamp).toLocaleString()}</span>
                    <span className="font-medium">{h.status}</span>
                    <span className="text-muted-foreground">{h.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transfer History */}
      <Card>
        <CardHeader><CardTitle>Transfer History</CardTitle></CardHeader>
        <CardContent>
          {!transfers?.transfers?.length ? <p className="text-muted-foreground text-sm">No transfers yet</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Recipient</th><th className="text-right py-2">Sent</th><th className="text-right py-2">Received</th><th className="text-right py-2">Status</th><th className="text-right py-2">Date</th></tr></thead>
              <tbody>
                {transfers.transfers.map(t => (
                  <tr key={t.transferId} className="border-b hover:bg-muted/30">
                    <td className="py-2">
                      <p className="font-medium">{t.recipientName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.trackingNumber}</p>
                    </td>
                    <td className="text-right">${t.sendAmountUSD}</td>
                    <td className="text-right text-green-600">{t.receiveAmount} {t.receiveCurrency}</td>
                    <td className="text-right"><Badge variant={t.status === "delivered" ? "default" : "secondary"}>{t.status}</Badge></td>
                    <td className="text-right text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
