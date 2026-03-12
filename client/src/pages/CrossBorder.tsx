import { useState } from "react";
import { Globe, ArrowRight, Plus, RefreshCw, TrendingUp, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const CORRIDORS = [
  { value: "NGN-KES", label: "Nigeria → Kenya (NGN → KES)", from: "NGN", to: "KES" },
  { value: "NGN-GHS", label: "Nigeria → Ghana (NGN → GHS)", from: "NGN", to: "GHS" },
  { value: "NGN-ZAR", label: "Nigeria → South Africa (NGN → ZAR)", from: "NGN", to: "ZAR" },
  { value: "NGN-USD", label: "Nigeria → USA (NGN → USD)", from: "NGN", to: "USD" },
  { value: "NGN-GBP", label: "Nigeria → UK (NGN → GBP)", from: "NGN", to: "GBP" },
  { value: "NGN-CNY", label: "Nigeria → China (NGN → CNY)", from: "NGN", to: "CNY" },
  { value: "KES-NGN", label: "Kenya → Nigeria (KES → NGN)", from: "KES", to: "NGN" },
  { value: "ZAR-NGN", label: "South Africa → Nigeria (ZAR → NGN)", from: "ZAR", to: "NGN" },
  { value: "INR-NGN", label: "India → Nigeria (INR → NGN)", from: "INR", to: "NGN" },
  { value: "BRL-USD", label: "Brazil → USA (BRL → USD)", from: "BRL", to: "USD" },
];

const RAILS = [
  { value: "mojaloop", label: "Mojaloop (FSPIOP)", desc: "Open-source interoperable payments" },
  { value: "brics_pay", label: "BRICS Pay", desc: "23-currency BRICS settlement" },
  { value: "swift", label: "SWIFT GPI", desc: "Traditional correspondent banking" },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "committed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed": case "aborted": return <XCircle className="w-4 h-4 text-red-400" />;
    case "pending": case "quoted": case "reserved": return <Clock className="w-4 h-4 text-amber-400" />;
    default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    committed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    aborted: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    quoted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    reserved: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? colors.pending}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

function InitiateTransferDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    receiverId: "",
    receiverIdType: "MSISDN",
    corridor: "NGN-KES",
    amount: "",
    receiverName: "",
    rail: "mojaloop",
  });

  const corridorInfo = CORRIDORS.find(c => c.value === form.corridor);

  const initiate = trpc.crossBorder.initiate.useMutation({
    onSuccess: (data) => {
      toast.success(`Transfer initiated! ID: ${data.transferId}`);
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.receiverId || !form.amount) {
      toast.error("Receiver ID and amount are required");
      return;
    }
    initiate.mutate({
      receiverId: form.receiverId,
      receiverIdType: form.receiverIdType,
      sourceCurrency: corridorInfo?.from ?? "NGN",
      targetCurrency: corridorInfo?.to ?? "KES",
      amount: form.amount,
      corridor: form.corridor,
      receiverName: form.receiverName || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          New Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Initiate Cross-Border Transfer
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="text-slate-300">Payment Corridor</Label>
            <Select value={form.corridor} onValueChange={v => setForm(f => ({ ...f, corridor: v }))}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {CORRIDORS.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-white">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-slate-300">Payment Rail</Label>
            <Select value={form.rail} onValueChange={v => setForm(f => ({ ...f, rail: v }))}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {RAILS.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-white">
                    <div>
                      <div className="font-medium">{r.label}</div>
                      <div className="text-xs text-slate-400">{r.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Receiver ID Type</Label>
              <Select value={form.receiverIdType} onValueChange={v => setForm(f => ({ ...f, receiverIdType: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="MSISDN" className="text-white">Phone (MSISDN)</SelectItem>
                  <SelectItem value="ACCOUNT_ID" className="text-white">Account ID</SelectItem>
                  <SelectItem value="IBAN" className="text-white">IBAN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Receiver ID</Label>
              <Input
                value={form.receiverId}
                onChange={e => setForm(f => ({ ...f, receiverId: e.target.value }))}
                placeholder="+254712345678"
                className="bg-slate-800 border-slate-600 text-white mt-1"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Receiver Name (optional)</Label>
            <Input
              value={form.receiverName}
              onChange={e => setForm(f => ({ ...f, receiverName: e.target.value }))}
              placeholder="John Doe"
              className="bg-slate-800 border-slate-600 text-white mt-1"
            />
          </div>

          <div>
            <Label className="text-slate-300">
              Amount ({corridorInfo?.from ?? "NGN"})
            </Label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="10000"
              min="1"
              className="bg-slate-800 border-slate-600 text-white mt-1"
              required
            />
          </div>

          {corridorInfo && (
            <div className="bg-slate-800/50 rounded-lg p-3 flex items-center gap-3 text-sm">
              <span className="font-semibold text-white">{corridorInfo.from}</span>
              <ArrowRight className="w-4 h-4 text-indigo-400" />
              <span className="font-semibold text-white">{corridorInfo.to}</span>
              <span className="text-slate-400 ml-auto">via {form.rail}</span>
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            disabled={initiate.isPending}
          >
            {initiate.isPending ? "Initiating..." : "Initiate Transfer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CrossBorder() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: transfers, isLoading, refetch } = trpc.crossBorder.list.useQuery({
    limit: 50,
    offset: 0,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const stats = {
    total: transfers?.length ?? 0,
    committed: transfers?.filter(t => t.status === "committed").length ?? 0,
    pending: transfers?.filter(t => ["pending", "quoted", "reserved"].includes(t.status)).length ?? 0,
    failed: transfers?.filter(t => ["failed", "aborted"].includes(t.status)).length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 bg-[#0a0f1e] min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-indigo-400" />
            Cross-Border Transfers
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Mojaloop FSPIOP · BRICS Pay · SWIFT GPI corridors
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <InitiateTransferDialog onSuccess={() => utils.crossBorder.list.invalidate()} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Transfers", value: stats.total, icon: Globe, color: "text-indigo-400" },
          { label: "Committed", value: stats.committed, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-400" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "pending", "committed", "failed"].map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s
              ? "bg-indigo-600 text-white border-indigo-600"
              : "border-slate-700 text-slate-300 hover:text-white bg-transparent"}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Transfers Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-base text-slate-200">Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-slate-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex gap-4">
                  <Skeleton className="h-4 w-32 bg-slate-700" />
                  <Skeleton className="h-4 w-24 bg-slate-700" />
                  <Skeleton className="h-4 w-20 bg-slate-700" />
                </div>
              ))}
            </div>
          ) : !transfers || transfers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No transfers yet</p>
              <p className="text-sm mt-1">Initiate your first cross-border transfer above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-4 text-slate-400 font-medium">Transfer ID</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Corridor</th>
                    <th className="text-right p-4 text-slate-400 font-medium">Source</th>
                    <th className="text-right p-4 text-slate-400 font-medium">Target</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Rail</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Status</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 font-mono text-xs text-slate-300">{t.transferId.slice(0, 20)}...</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-white">
                          <span className="font-medium">{t.sourceCurrency}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="font-medium">{t.targetCurrency}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{t.corridor}</div>
                      </td>
                      <td className="p-4 text-right text-white font-medium">
                        {parseFloat(t.sourceAmount).toLocaleString()} {t.sourceCurrency}
                      </td>
                      <td className="p-4 text-right text-emerald-400 font-medium">
                        {parseFloat(t.targetAmount).toLocaleString()} {t.targetCurrency}
                      </td>
                      <td className="p-4">
                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-medium">
                          {t.rail}
                        </span>
                      </td>
                      <td className="p-4"><StatusBadge status={t.status} /></td>
                      <td className="p-4 text-xs text-slate-400">
                        {new Date(t.createdAt).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
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
