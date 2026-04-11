import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowRight, Globe, RefreshCw, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

const CORRIDORS = [
  { label: "NGN → KES (Nigeria → Kenya)", source: "NGN", target: "KES", corridor: "NG-KE" },
  { label: "NGN → GHS (Nigeria → Ghana)", source: "NGN", target: "GHS", corridor: "NG-GH" },
  { label: "NGN → ZAR (Nigeria → South Africa)", source: "NGN", target: "ZAR", corridor: "NG-ZA" },
  { label: "NGN → EUR (Nigeria → Europe)", source: "NGN", target: "EUR", corridor: "NG-EU" },
  { label: "NGN → GBP (Nigeria → UK)", source: "NGN", target: "GBP", corridor: "NG-GB" },
  { label: "NGN → USD (Nigeria → USA)", source: "NGN", target: "USD", corridor: "NG-US" },
  { label: "NGN → CNY (Nigeria → China)", source: "NGN", target: "CNY", corridor: "NG-CN" },
];

const RAILS = [
  { value: "mojaloop", label: "Mojaloop (Instant)" },
  { value: "brics_pay", label: "BRICS Pay" },
  { value: "swift", label: "SWIFT (1-3 days)" },
];

function statusBadge(status: string) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: "bg-green-100 text-green-800", icon: <CheckCircle className="w-3 h-3" /> },
    pending: { color: "bg-yellow-100 text-yellow-800", icon: <Clock className="w-3 h-3" /> },
    processing: { color: "bg-blue-100 text-blue-800", icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
    failed: { color: "bg-red-100 text-red-800", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { color: "bg-gray-100 text-gray-700", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon} {status}
    </span>
  );
}

export default function ConsumerCrossBorder() {
  useOnboardingGate();

  const [corridorIdx, setCorridorIdx] = useState(0);
  const [amount, setAmount] = useState("");
  const [rail, setRail] = useState<"mojaloop" | "brics_pay" | "swift">("mojaloop");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientIdType, setRecipientIdType] = useState("MSISDN");
  const [quoteData, setQuoteData] = useState<any>(null);
  const [step, setStep] = useState<"form" | "quote" | "confirm" | "done">("form");

  const corridor = CORRIDORS[corridorIdx];

  const getQuote = trpc.crossBorder.getQuote.useQuery(
    {
      sourceCurrency: corridor.source,
      targetCurrency: corridor.target,
      amount: amount || "0",
      rail,
    },
    { enabled: false }
  );

  const initiate = trpc.crossBorder.initiate.useMutation({
    onSuccess: () => {
      setStep("done");
      toast.success("Transfer initiated successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Transfer failed");
    },
  });

  const history = trpc.crossBorder.list.useQuery({ limit: 10 });

  const handleGetQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!recipientPhone) {
      toast.error("Please enter recipient phone/account");
      return;
    }
    const result = await getQuote.refetch();
    if (result.data) {
      setQuoteData(result.data);
      setStep("quote");
    } else {
      toast.error("Could not fetch quote. Please try again.");
    }
  };

  const handleConfirm = () => {
    initiate.mutate({
      receiverId: recipientPhone,
      receiverIdType: recipientIdType,
      sourceCurrency: corridor.source,
      targetCurrency: corridor.target,
      amount,
      corridor: corridor.corridor,
      rail,
    });
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold">International Transfer</h1>
      </div>

      {step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send Money Abroad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Corridor</Label>
              <Select
                value={String(corridorIdx)}
                onValueChange={(v: any) => { setCorridorIdx(Number(v)); setQuoteData(null); }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map((c: any, i: any) => (
                    <SelectItem key={i} value={String(i)}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Transfer Rail</Label>
              <Select value={rail} onValueChange={(v: any) => setRail(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAILS.map((r: any) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Amount ({corridor.source})</Label>
              <Input
                type="number"
                placeholder="e.g. 50000"
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
              />
            </div>

            <div>
              <Label>Recipient ID Type</Label>
              <Select value={recipientIdType} onValueChange={setRecipientIdType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MSISDN">Phone Number (MSISDN)</SelectItem>
                  <SelectItem value="ACCOUNT_ID">Account Number</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                  <SelectItem value="IBAN">IBAN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Recipient {recipientIdType === "MSISDN" ? "Phone" : recipientIdType === "EMAIL" ? "Email" : "Account"}</Label>
              <Input
                placeholder={recipientIdType === "MSISDN" ? "+254712345678" : recipientIdType === "EMAIL" ? "recipient@email.com" : "Account number"}
                value={recipientPhone}
                onChange={(e: any) => setRecipientPhone(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={handleGetQuote} disabled={getQuote.isFetching}>
              {getQuote.isFetching ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Getting Quote...</>
              ) : (
                <>Get Quote <ArrowRight className="w-4 h-4 ml-2" /></>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "quote" && quoteData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transfer Quote</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">You send</span>
                <span className="font-semibold">{amount} {corridor.source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fee</span>
                <span className="font-semibold">{quoteData.fee} {quoteData.fee_currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Exchange rate</span>
                <span className="font-semibold">1 {corridor.source} = {quoteData.exchange_rate} {corridor.target}</span>
              </div>
              <div className="border-t pt-2 flex justify-between">
                <span className="text-muted-foreground font-medium">Recipient gets</span>
                <span className="font-bold text-primary">{quoteData.target_amount} {corridor.target}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Quote expires</span>
                <span>{new Date(quoteData.expires_at).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <span className="font-medium">To:</span> {recipientPhone} ({recipientIdType})
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>Back</Button>
              <Button className="flex-1" onClick={handleConfirm} disabled={initiate.isPending}>
                {initiate.isPending ? "Processing..." : "Confirm Transfer"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-bold">Transfer Initiated!</h2>
            <p className="text-sm text-muted-foreground">
              Your transfer of {amount} {corridor.source} to {recipientPhone} has been submitted.
              You will receive a notification when it is completed.
            </p>
            <Button onClick={() => { setStep("form"); setAmount(""); setRecipientPhone(""); setQuoteData(null); history.refetch(); }}>
              New Transfer
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transfer History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Transfers</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <div className="text-sm text-muted-foreground text-center py-4">Loading...</div>
          ) : !history.data?.length ? (
            <div className="text-sm text-muted-foreground text-center py-4">No transfers yet</div>
          ) : (
            <div className="space-y-2">
              {(history.data as any[]).map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-muted rounded-lg text-sm">
                  <div>
                    <div className="font-medium">{tx.sourceCurrency} → {tx.targetCurrency}</div>
                    <div className="text-xs text-muted-foreground">{tx.receiverId} · {new Date(tx.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{tx.amount} {tx.sourceCurrency}</div>
                    <div>{statusBadge(tx.status)}</div>
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
