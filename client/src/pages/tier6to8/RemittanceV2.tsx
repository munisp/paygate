import { useState } from "react";
import { trpc3 } from "@/lib/trpc3";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Globe, ArrowRight, Clock, RefreshCw } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function RemittanceV2() {
  const { user } = useAuth();
  const [step, setStep] = useState<"quote" | "send">("quote");
  const [quoteId, setQuoteId] = useState("");
  const [fromCountry, setFromCountry] = useState("NG");
  const [toCountry, setToCountry] = useState("GH");
  const [sendAmount, setSendAmount] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"bank_account" | "mobile_money" | "cash_pickup" | "wallet">("bank_account");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBankCode, setRecipientBankCode] = useState("");
  const [purpose, setPurpose] = useState("FAMILY_SUPPORT");

  const corridorsQuery = trpc3.remittanceV2.getCorridors.useQuery();
  const historyQuery = trpc3.remittanceV2.getRemittanceHistory.useQuery({ limit: 20 }, { enabled: !!user });

  const quoteQuery = trpc3.remittanceV2.getQuote.useQuery(
    { fromCountry, toCountry, sendAmountKobo: Math.round(parseFloat(sendAmount || "0") * 100), deliveryMethod },
    { enabled: !!user && !!sendAmount && parseFloat(sendAmount) > 0 }
  );

  const sendMutation = trpc3.remittanceV2.sendRemittance.useMutation({
    onSuccess: (data) => {
      toast("Remittance sent", { description: `Tracking: ${data.trackingCode}` });
      historyQuery.refetch();
      setStep("quote");
      setSendAmount("");
      setRecipientName("");
      setRecipientPhone("");
      setRecipientAccount("");
    },
    onError: (e: any) => toast("Remittance failed", { description: e.message }),
  });

  const corridors = (corridorsQuery.data as any)?.corridors ?? [];
  const history = (historyQuery.data as any)?.remittances ?? [];
  const quote = quoteQuery.data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cross-Border Remittance v2</h1>
          <p className="text-muted-foreground">Send money globally with real-time FX rates and instant settlement</p>
        </div>
        <Button onClick={() => corridorsQuery.refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh Rates
        </Button>
      </div>

      {/* Active Corridors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" /> Active Corridors
          </CardTitle>
        </CardHeader>
        <CardContent>
          {corridorsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading corridors...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {corridors.map((c: any) => (
                <div
                  key={`${c.from}-${c.to}`}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${fromCountry === c.from && toCountry === c.to ? "border-primary bg-primary/5" : "hover:bg-muted/30"}`}
                  onClick={() => { setFromCountry(c.from); setToCountry(c.to); }}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <span>{c.from}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span>{c.to}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Rate: {c.fxRate?.toFixed(4)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{c.estimatedMinutes}min</Badge>
                    <span className="text-xs text-muted-foreground">via {c.provider}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Send Remittance */}
      <Card>
        <CardHeader>
          <CardTitle>Send Remittance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "quote" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Send Amount (NGN)</label>
                  <Input type="number" placeholder="e.g. 50000" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Delivery Method</label>
                  <select
                    className="w-full mt-1 border rounded-md px-3 py-2 text-sm bg-background"
                    value={deliveryMethod}
                    onChange={(e) => setDeliveryMethod(e.target.value as any)}
                  >
                    <option value="bank_account">Bank Account</option>
                    <option value="mobile_money">Mobile Money</option>
                    <option value="cash_pickup">Cash Pickup</option>
                    <option value="wallet">Wallet</option>
                  </select>
                </div>
              </div>
              {quote && (
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recipient gets:</span>
                    <span className="font-bold">{quote.receiveAmount?.toLocaleString()} {quote.receiveCurrency}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Exchange rate:</span>
                    <span>{quote.fxRate?.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fee:</span>
                    <span>₦{((quote.feeKobo ?? 0) / 100).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium border-t pt-2">
                    <span>Total debit:</span>
                    <span>₦{((quote.totalDebitKobo ?? 0) / 100).toLocaleString()}</span>
                  </div>
                  <Button onClick={() => { setQuoteId(quote.quoteId); setStep("send"); }} className="w-full mt-2">
                    Continue to Send
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { key: "recipientName", label: "Recipient Name", placeholder: "John Doe", value: recipientName, set: setRecipientName },
                  { key: "recipientPhone", label: "Recipient Phone", placeholder: "+233501234567", value: recipientPhone, set: setRecipientPhone },
                  { key: "recipientAccount", label: "Account Number", placeholder: "1234567890", value: recipientAccount, set: setRecipientAccount },
                  { key: "recipientBankCode", label: "Bank Code", placeholder: "GCB", value: recipientBankCode, set: setRecipientBankCode },
                ].map(({ key, label, placeholder, value, set }) => (
                  <div key={key}>
                    <label className="text-sm font-medium">{label}</label>
                    <Input placeholder={placeholder} value={value} onChange={(e) => set(e.target.value)} className="mt-1" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => sendMutation.mutate({ quoteId, recipientName, recipientPhone, recipientAccount, recipientBankCode, purpose })}
                  disabled={!recipientName || !recipientPhone || sendMutation.isPending}
                >
                  {sendMutation.isPending ? "Sending..." : "Send Money"}
                </Button>
                <Button variant="outline" onClick={() => setStep("quote")}>Back</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Remittance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <p className="text-muted-foreground text-center py-8">Loading history...</p>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No remittances yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">ID</th>
                    <th className="text-right py-2 px-3">Send Amount</th>
                    <th className="text-right py-2 px-3">Receive Amount</th>
                    <th className="text-left py-2 px-3">Recipient</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-left py-2 px-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r: any) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs">{r.id?.slice(0, 8)}...</td>
                      <td className="py-2 px-3 text-right font-mono">₦{((r.sendAmountKobo ?? 0) / 100).toLocaleString()}</td>
                      <td className="py-2 px-3 text-right font-mono">{r.receiveAmount?.toLocaleString()} {r.receiveCurrency}</td>
                      <td className="py-2 px-3 text-muted-foreground">{r.recipientName}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant={r.status === "completed" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>
                          {r.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
