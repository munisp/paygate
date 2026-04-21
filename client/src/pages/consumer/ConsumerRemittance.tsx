import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Globe, Send, Clock, ArrowRight } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const CORRIDORS = [
  { id: "NG-GH", label: "Nigeria → Ghana", currency: "GHS", flag: "🇬🇭", feePercent: 1.5 },
  { id: "NG-KE", label: "Nigeria → Kenya", currency: "KES", flag: "🇰🇪", feePercent: 1.5 },
  { id: "NG-UK", label: "Nigeria → UK", currency: "GBP", flag: "🇬🇧", feePercent: 2.0 },
  { id: "NG-US", label: "Nigeria → USA", currency: "USD", flag: "🇺🇸", feePercent: 2.0 },
  { id: "NG-CA", label: "Nigeria → Canada", currency: "CAD", flag: "🇨🇦", feePercent: 2.5 },
];

const statusColor = (s: string) => {
  if (s === "completed") return "default";
  if (s === "failed") return "destructive";
  if (s === "processing") return "secondary";
  return "outline";
};

export default function ConsumerRemittance() {
  const [sendDialog, setSendDialog] = useState(false);
  const [corridorId, setCorridorId] = useState(CORRIDORS[0].id);
  const [amount, setAmount] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [recipientBank, setRecipientBank] = useState("");
  const [purpose, setPurpose] = useState("family_support");

  const { data: transferData, refetch } = trpc.consumerFinancial.remittance.getHistory.useQuery();

  const sendMutation = trpc.consumerFinancial.remittance.initiate.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Transfer ${d.transferId} initiated — tracking: ${d.trackingCode}`);
      setSendDialog(false);
      setAmount("");
      setRecipientName("");
      setRecipientAccount("");
      setRecipientBank("");
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const corridor = CORRIDORS.find(c => c.id === corridorId) ?? CORRIDORS[0];
  const feeKobo = amount ? Math.round(Number(amount) * 100 * corridor.feePercent / 100) : 0;
  const totalKobo = amount ? Math.round(Number(amount) * 100) + feeKobo : 0;
  const transfers = (transferData as any)?.transfers ?? [];

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold flex items-center gap-2">
        <Globe className="w-5 h-5 text-teal-500" /> International Transfers
      </h1>

      {/* Send Button */}
      <Button className="w-full" onClick={() => setSendDialog(true)}>
        <Send className="w-4 h-4 mr-2" /> Send Money Abroad
      </Button>

      {/* Corridors */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Available Corridors</h2>
        <div className="grid grid-cols-2 gap-2">
          {CORRIDORS.map((c) => (
            <Card key={c.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => { setCorridorId(c.id); setSendDialog(true); }}>
              <CardContent className="p-3 flex items-center gap-2">
                <span className="text-2xl">{c.flag}</span>
                <div>
                  <p className="text-xs font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">Fee: {c.feePercent}%</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Transfer History */}
      {transfers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" /> Transfer History
          </CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {transfers.slice(0, 10).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{t.recipientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.recipientCountry} · {new Date(t.createdAt).toLocaleDateString()}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground">{t.trackingCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatKobo(t.amountKobo ?? 0)}</p>
                    <Badge variant={statusColor(t.status)} className="text-xs">{t.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Send Dialog */}
      <Dialog open={sendDialog} onOpenChange={setSendDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send Money Abroad</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Destination</label>
              <Select value={corridorId} onValueChange={setCorridorId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.flag} {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input type="number" placeholder="e.g. 50000" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" />
              {amount && (
                <div className="mt-2 text-xs space-y-1 bg-muted p-2 rounded">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transfer amount</span>
                    <span>{formatKobo(Number(amount) * 100)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee ({corridor.feePercent}%)</span>
                    <span>{formatKobo(feeKobo)}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Total deducted</span>
                    <span>{formatKobo(totalKobo)}</span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-sm font-medium">Recipient Name</label>
              <Input placeholder="Full name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Account / IBAN</label>
              <Input placeholder="Account number or IBAN" value={recipientAccount} onChange={(e) => setRecipientAccount(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Bank Name</label>
              <Input placeholder="Recipient's bank" value={recipientBank} onChange={(e) => setRecipientBank(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Purpose</label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="family_support">Family Support</SelectItem>
                  <SelectItem value="education">Education</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="medical">Medical</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(false)}>Cancel</Button>
            <Button
              disabled={!amount || !recipientName || !recipientAccount || !recipientBank || sendMutation.isPending}
              onClick={() => sendMutation.mutate({
                corridorId,
                amountKobo: Math.round(Number(amount) * 100),
                recipientName,
                recipientAccount,
                recipientBank,
                recipientCountry: corridorId.split("-")[1],
                purpose,
              })}
            >
              {sendMutation.isPending ? "Sending..." : "Send Money"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
