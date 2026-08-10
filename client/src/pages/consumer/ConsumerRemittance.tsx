// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Globe, Send, ArrowRight, Clock } from "lucide-react";

export default function ConsumerRemittance() {
  const [fromCurrency, setFromCurrency] = useState("NGN");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [recipientCountry, setRecipientCountry] = useState("US");

  const { data: corridors, isLoading: corridorsLoading } = trpc.newFeatures.internationalRemittance.getCorridors.useQuery();
  const { data: history } = trpc.newFeatures.internationalRemittance.getHistory.useQuery({ page: 1, limit: 10 }, { staleTime: 30_000 });

  const sendMutation = trpc.newFeatures.internationalRemittance.send.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Transfer initiated — Ref: ${d.referenceId}`);
      setAmount("");
      setRecipientName("");
      setRecipientAccount("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatAmount = (a: number, currency: string) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(a);
  };

  const selectedCorridor = corridors?.corridors?.find(
    (c: any) => c.fromCurrency === fromCurrency && c.toCurrency === toCurrency
  );

  const estimatedReceive = amount && selectedCorridor
    ? parseFloat(amount) * (selectedCorridor.exchangeRate ?? 1) - (selectedCorridor.feeKobo ?? 0) / 100
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">International Remittance</h1>
          <p className="text-muted-foreground">Send money abroad quickly and securely</p>
        </div>
      </div>

      {/* Send Money Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" /> Send Money
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Currency Selector */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>From</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value)}
              >
                <option value="NGN">NGN — Nigerian Naira</option>
                <option value="GHS">GHS — Ghanaian Cedi</option>
                <option value="KES">KES — Kenyan Shilling</option>
              </select>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mt-5" />
            <div className="flex-1">
              <Label>To</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value)}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="EUR">EUR — Euro</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="CNY">CNY — Chinese Yuan</option>
              </select>
            </div>
          </div>

          {/* Rate Display */}
          {selectedCorridor && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <div className="flex justify-between">
                <span>Exchange Rate:</span>
                <strong>1 {fromCurrency} = {selectedCorridor.exchangeRate?.toFixed(4)} {toCurrency}</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>Transfer Fee:</span>
                <strong>₦{((selectedCorridor.feeKobo ?? 0) / 100).toLocaleString()}</strong>
              </div>
              <div className="flex justify-between mt-1">
                <span>Delivery Time:</span>
                <strong>{selectedCorridor.deliveryTime ?? "1-2 business days"}</strong>
              </div>
            </div>
          )}

          <div>
            <Label>Amount ({fromCurrency})</Label>
            <Input
              type="number"
              placeholder="e.g. 100000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="100"
            />
            {amount && estimatedReceive > 0 && (
              <p className="text-sm text-green-600 mt-1">
                Recipient gets: <strong>{formatAmount(estimatedReceive, toCurrency)}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Recipient Name</Label>
              <Input
                placeholder="Full name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            </div>
            <div>
              <Label>Recipient Country</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={recipientCountry}
                onChange={(e) => setRecipientCountry(e.target.value)}
              >
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="CA">Canada</option>
                <option value="DE">Germany</option>
                <option value="CN">China</option>
                <option value="AU">Australia</option>
              </select>
            </div>
            <div>
              <Label>Bank Name</Label>
              <Input
                placeholder="e.g. Chase Bank"
                value={recipientBank}
                onChange={(e) => setRecipientBank(e.target.value)}
              />
            </div>
            <div>
              <Label>Account / IBAN</Label>
              <Input
                placeholder="Account number or IBAN"
                value={recipientAccount}
                onChange={(e) => setRecipientAccount(e.target.value)}
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => sendMutation.mutate({
              fromCurrency,
              toCurrency,
              amountKobo: parseFloat(amount) * 100,
              recipientName,
              recipientAccount,
              recipientBank,
              recipientCountry,
            })}
            disabled={!amount || !recipientName || !recipientAccount || sendMutation.isPending}
          >
            {sendMutation.isPending ? "Processing..." : `Send ${fromCurrency} ${parseFloat(amount || "0").toLocaleString()}`}
          </Button>
        </CardContent>
      </Card>

      {/* Available Corridors */}
      {corridors?.corridors?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Corridors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {corridors.corridors.map((c: any, i: number) => (
                <div key={i} className="p-3 rounded-lg border">
                  <div className="flex justify-between items-center">
                    <div className="font-medium">{c.fromCurrency} → {c.toCurrency}</div>
                    <Badge variant="outline">{c.deliveryTime ?? "1-2 days"}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Rate: 1 {c.fromCurrency} = {c.exchangeRate?.toFixed(4)} {c.toCurrency}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Fee: ₦{((c.feeKobo ?? 0) / 100).toLocaleString()} | Min: ₦{((c.minAmountKobo ?? 0) / 100).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transfer History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.transfers?.length ? (
            <p className="text-muted-foreground text-center py-4">No transfers yet</p>
          ) : (
            <div className="space-y-2">
              {history.transfers.map((t: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{t.recipientName}</div>
                    <div className="text-sm text-muted-foreground">
                      {t.fromCurrency} → {t.toCurrency} | Ref: {t.referenceId}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{t.fromCurrency} {(t.amountKobo / 100).toLocaleString()}</div>
                    <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"}>
                      {t.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
