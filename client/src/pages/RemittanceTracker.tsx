// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, ArrowRight, Globe, Clock, CheckCircle2, AlertTriangle, RefreshCw, TrendingUp, Search } from "lucide-react";
import { toast } from "sonner";

const CORRIDORS = [
  { from: "NGN", to: "GBP", flag: "🇬🇧", country: "United Kingdom", rate: 0.000520, fee: 2_500, deliveryTime: "1-2 hours", trend: "+0.3%" },
  { from: "NGN", to: "USD", flag: "🇺🇸", country: "United States", rate: 0.000650, fee: 3_000, deliveryTime: "30 mins", trend: "-0.1%" },
  { from: "NGN", to: "EUR", flag: "🇪🇺", country: "European Union", rate: 0.000600, fee: 2_800, deliveryTime: "2-4 hours", trend: "+0.2%" },
  { from: "NGN", to: "GHS", flag: "🇬🇭", country: "Ghana", rate: 0.009500, fee: 1_000, deliveryTime: "15 mins", trend: "+1.1%" },
  { from: "NGN", to: "KES", flag: "🇰🇪", country: "Kenya", rate: 0.085000, fee: 1_200, deliveryTime: "30 mins", trend: "+0.5%" },
  { from: "NGN", to: "ZAR", flag: "🇿🇦", country: "South Africa", rate: 0.012000, fee: 1_500, deliveryTime: "1-2 hours", trend: "-0.2%" },
  { from: "NGN", to: "CAD", flag: "🇨🇦", country: "Canada", rate: 0.000890, fee: 3_500, deliveryTime: "2-4 hours", trend: "+0.4%" },
  { from: "NGN", to: "AED", flag: "🇦🇪", country: "UAE", rate: 0.002400, fee: 2_000, deliveryTime: "1 hour", trend: "+0.1%" },
];

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  completed: { label: "Completed", variant: "default", icon: CheckCircle2 },
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  processing: { label: "Processing", variant: "outline", icon: RefreshCw },
  failed: { label: "Failed", variant: "destructive", icon: AlertTriangle },
};

const MOCK_HISTORY = [
  { id: "RMT-001", to: "GBP", flag: "🇬🇧", recipient: "John Doe", amount: 500_000, destAmount: 260, status: "completed", date: "2026-04-20", trackingCode: "PG-RMT-2026-001" },
  { id: "RMT-002", to: "USD", flag: "🇺🇸", recipient: "Jane Smith", amount: 1_000_000, destAmount: 650, status: "completed", date: "2026-04-18", trackingCode: "PG-RMT-2026-002" },
  { id: "RMT-003", to: "EUR", flag: "🇪🇺", recipient: "Carlos Ruiz", amount: 750_000, destAmount: 450, status: "pending", date: "2026-04-22", trackingCode: "PG-RMT-2026-003" },
  { id: "RMT-004", to: "GHS", flag: "🇬🇭", recipient: "Kwame Mensah", amount: 200_000, destAmount: 1_900, status: "completed", date: "2026-04-15", trackingCode: "PG-RMT-2026-004" },
];

export default function RemittanceTracker() {
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedCorridor, setSelectedCorridor] = useState(CORRIDORS[0]);
  const [sendAmount, setSendAmount] = useState("100000");
  const [recipientName, setRecipientName] = useState("");
  const [recipientAccount, setRecipientAccount] = useState("");
  const [search, setSearch] = useState("");

  const { data: corridors } = trpc.remittanceMw.corridors.useQuery();
  const { data: history, refetch } = trpc.remittanceMw.history.useQuery();
  const sendMutation = trpc.remittanceMw.send.useMutation({
    onSuccess: (data) => {
      toast.success(`Transfer initiated! Tracking: ${data.trackingCode ?? "PG-RMT-" + Date.now()}`);
      setSendOpen(false);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const destAmount = useMemo(() => {
    const amt = parseFloat(sendAmount.replace(/,/g, ""));
    if (isNaN(amt)) return 0;
    return (amt * selectedCorridor.rate).toFixed(2);
  }, [sendAmount, selectedCorridor]);

  const handleSend = () => {
    const amt = parseFloat(sendAmount.replace(/,/g, ""));
    if (isNaN(amt) || amt < 1000) { toast.error("Minimum transfer is ₦1,000"); return; }
    if (!recipientName.trim()) { toast.error("Recipient name required"); return; }
    if (!recipientAccount.trim()) { toast.error("Recipient account required"); return; }
    sendMutation.mutate({
      recipientId: recipientAccount,
      amountNGN: amt,
      currency: selectedCorridor.to,
      corridor: `NGN-${selectedCorridor.to}`,
    });
  };

  const filteredHistory = (history?.transfers ?? MOCK_HISTORY).filter((h: any) =>
    !search || h.recipient?.toLowerCase().includes(search.toLowerCase()) || h.trackingCode?.includes(search)
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-600" />
            International Remittance
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Send money globally with competitive rates and real-time tracking</p>
        </div>
        <Button onClick={() => setSendOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Send className="w-4 h-4 mr-2" /> Send Money
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sent (30d)", value: "₦2.45M", sub: "+12% vs last month", color: "text-blue-600" },
          { label: "Transfers (30d)", value: "24", sub: "Avg ₦102k per transfer", color: "text-emerald-600" },
          { label: "Best Rate", value: "KES 0.085", sub: "NGN → KES corridor", color: "text-purple-600" },
          { label: "Avg Delivery", value: "1.2 hrs", sub: "Across all corridors", color: "text-amber-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="corridors">
        <TabsList>
          <TabsTrigger value="corridors">Live Rates</TabsTrigger>
          <TabsTrigger value="history">Transfer History</TabsTrigger>
        </TabsList>

        <TabsContent value="corridors">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {CORRIDORS.map((c) => (
              <Card key={c.to} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedCorridor(c); setSendOpen(true); }}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{c.flag}</span>
                      <div>
                        <p className="font-semibold text-sm">NGN → {c.to}</p>
                        <p className="text-xs text-muted-foreground">{c.country}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs ${c.trend.startsWith("+") ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200"}`}>
                      <TrendingUp className="w-3 h-3 mr-1" />{c.trend}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-mono font-semibold">1 NGN = {c.rate.toFixed(6)} {c.to}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Fee</span>
                      <span className="font-semibold">₦{c.fee.toLocaleString("en-NG")}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Delivery</span>
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />{c.deliveryTime}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white">
                    <Send className="w-3 h-3 mr-1" /> Send to {c.country}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by recipient or tracking code..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tracking Code</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Corridor</TableHead>
                    <TableHead className="text-right">Amount Sent</TableHead>
                    <TableHead className="text-right">Amount Received</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((h: any) => {
                    const st = STATUS_BADGE[h.status] ?? STATUS_BADGE.pending;
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono text-xs">{h.trackingCode}</TableCell>
                        <TableCell className="font-medium text-sm">{h.recipient}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-sm">
                            {h.flag} NGN <ArrowRight className="w-3 h-3" /> {h.to}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">₦{h.amount.toLocaleString("en-NG")}</TableCell>
                        <TableCell className="text-right text-emerald-600 font-semibold">{h.destAmount} {h.to}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{h.date}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant} className="text-xs flex items-center gap-1 w-fit">
                            <st.icon className="w-3 h-3" />{st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Send Dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCorridor.flag} Send to {selectedCorridor.country}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Corridor</Label>
              <Select value={selectedCorridor.to} onValueChange={(v) => setSelectedCorridor(CORRIDORS.find((c) => c.to === v) ?? CORRIDORS[0])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRIDORS.map((c) => (
                    <SelectItem key={c.to} value={c.to}>{c.flag} NGN → {c.to} ({c.country})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount to Send (₦)</Label>
              <Input value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} placeholder="100000" />
              <div className="p-2 bg-muted rounded text-sm flex items-center justify-between">
                <span className="text-muted-foreground">Recipient gets:</span>
                <span className="font-bold text-emerald-600">{destAmount} {selectedCorridor.to}</span>
              </div>
              <p className="text-xs text-muted-foreground">Fee: ₦{selectedCorridor.fee.toLocaleString()} · Rate: 1 NGN = {selectedCorridor.rate} {selectedCorridor.to}</p>
            </div>
            <div className="space-y-2">
              <Label>Recipient Name</Label>
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-2">
              <Label>Recipient Account / IBAN</Label>
              <Input value={recipientAccount} onChange={(e) => setRecipientAccount(e.target.value)} placeholder="Account number or IBAN" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button onClick={handleSend} disabled={sendMutation.isLoading} className="bg-blue-600 hover:bg-blue-700 text-white">
              {sendMutation.isLoading ? "Sending..." : `Send ${selectedCorridor.flag}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
