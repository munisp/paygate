// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Smartphone, ArrowDownLeft, ArrowUpRight, RefreshCw,
  CheckCircle2, Clock, XCircle, AlertCircle,
} from "lucide-react";

// ─── Provider logos / metadata ────────────────────────────────────────────────

const PROVIDERS = [
  { id: "mtn_momo", name: "MTN MoMo", country: "NG/GH/CM", color: "#FFCC00", textColor: "#000" },
  { id: "airtel_money", name: "Airtel Money", country: "NG/KE/UG", color: "#E40000", textColor: "#fff" },
  { id: "mpesa", name: "M-Pesa", country: "KE/TZ/GH", color: "#00A651", textColor: "#fff" },
  { id: "orange_money", name: "Orange Money", country: "SN/CI/CM", color: "#FF6600", textColor: "#fff" },
  { id: "wave", name: "Wave", country: "SN/CI", color: "#1A73E8", textColor: "#fff" },
  { id: "opay", name: "OPay", country: "NG", color: "#1FC16B", textColor: "#fff" },
  { id: "palmpay", name: "PalmPay", country: "NG", color: "#0E6E4E", textColor: "#fff" },
  { id: "kuda", name: "Kuda", country: "NG", color: "#400080", textColor: "#fff" },
];

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  pending: { color: "bg-amber-500/15 text-amber-700", icon: <Clock className="w-3 h-3" />, label: "Pending" },
  processing: { color: "bg-blue-500/15 text-blue-700", icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: "Processing" },
  completed: { color: "bg-emerald-500/15 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" />, label: "Completed" },
  failed: { color: "bg-red-500/15 text-red-700", icon: <XCircle className="w-3 h-3" />, label: "Failed" },
  reversed: { color: "bg-slate-500/15 text-slate-600", icon: <AlertCircle className="w-3 h-3" />, label: "Reversed" },
};

function formatAmount(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(amount);
}

// ─── Provider Selector ────────────────────────────────────────────────────────

function ProviderGrid({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {PROVIDERS.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p.id)}
          className={`rounded-xl border-2 p-3 text-left transition-all hover:shadow-md ${
            selected === p.id
              ? "border-primary shadow-md ring-2 ring-primary/20"
              : "border-border hover:border-primary/40"
          }`}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center mb-2 text-xs font-bold"
            style={{ background: p.color, color: p.textColor }}
          >
            {p.name.slice(0, 2)}
          </div>
          <p className="text-sm font-medium leading-tight">{p.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{p.country}</p>
        </button>
      ))}
    </div>
  );
}

// ─── Initiate Collection Form ─────────────────────────────────────────────────

function CollectionForm({ merchantId }: { merchantId: string }) {
  const [provider, setProvider] = useState("mtn_momo");
  const [form, setForm] = useState({
    phoneNumber: "", amount: "", currency: "NGN", description: "", reference: "",
  });

  const initiate = trpc.mobileMoney.initiateCollection.useMutation({
    onSuccess: (data) => {
      toast.success(`Collection initiated — ref: ${data.reference}`);
      setForm({ phoneNumber: "", amount: "", currency: "NGN", description: "", reference: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Select Provider</Label>
        <ProviderGrid selected={provider} onSelect={setProvider} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Customer Phone Number *</Label>
          <Input
            placeholder="+234 800 000 0000"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
          />
        </div>
        <div>
          <Label>Amount *</Label>
          <div className="flex gap-2">
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NGN", "GHS", "KES", "TZS", "UGX", "XOF"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input
            placeholder="Payment for order #123"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div>
          <Label>Your Reference (optional)</Label>
          <Input
            placeholder="Auto-generated if blank"
            value={form.reference}
            onChange={(e) => setForm({ ...form, reference: e.target.value })}
          />
        </div>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={!form.phoneNumber || !form.amount || initiate.isPending}
        onClick={() => initiate.mutate({
          merchantId,
          provider,
          phoneNumber: form.phoneNumber,
          amount: parseFloat(form.amount),
          currency: form.currency,
          description: form.description || undefined,
          reference: form.reference || undefined,
        })}
      >
        <ArrowDownLeft className="w-4 h-4 mr-2" />
        {initiate.isPending ? "Initiating…" : "Initiate Collection"}
      </Button>
    </div>
  );
}

// ─── Initiate Disbursement Form ───────────────────────────────────────────────

function DisbursementForm({ merchantId }: { merchantId: string }) {
  const [provider, setProvider] = useState("mtn_momo");
  const [form, setForm] = useState({
    phoneNumber: "", amount: "", currency: "NGN", description: "", reference: "",
  });

  const disburse = trpc.mobileMoney.initiateDisbursement.useMutation({
    onSuccess: (data) => {
      toast.success(`Disbursement initiated — ref: ${data.reference}`);
      setForm({ phoneNumber: "", amount: "", currency: "NGN", description: "", reference: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <Label className="mb-2 block">Select Provider</Label>
        <ProviderGrid selected={provider} onSelect={setProvider} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Recipient Phone Number *</Label>
          <Input
            placeholder="+234 800 000 0000"
            value={form.phoneNumber}
            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
          />
        </div>
        <div>
          <Label>Amount *</Label>
          <div className="flex gap-2">
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["NGN", "GHS", "KES", "TZS", "UGX", "XOF"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Label>Description / Narration</Label>
          <Input
            placeholder="Vendor payout — July 2026"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
      </div>
      <Button
        className="w-full sm:w-auto"
        disabled={!form.phoneNumber || !form.amount || disburse.isPending}
        onClick={() => disburse.mutate({
          merchantId,
          provider,
          phoneNumber: form.phoneNumber,
          amount: parseFloat(form.amount),
          currency: form.currency,
          description: form.description || undefined,
          reference: form.reference || undefined,
        })}
      >
        <ArrowUpRight className="w-4 h-4 mr-2" />
        {disburse.isPending ? "Processing…" : "Send Disbursement"}
      </Button>
    </div>
  );
}

// ─── Transaction History ──────────────────────────────────────────────────────

function MomoHistory({ merchantId }: { merchantId: string }) {
  const [type, setType] = useState<"collection" | "disbursement" | undefined>(undefined);
  const [provider, setProvider] = useState<string | undefined>(undefined);

  const historyQ = trpc.mobileMoney.list.useQuery({
    type,
    providerCode: provider,
    pageSize: 30,
  });

  const txns = historyQ.data?.transactions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={type ?? "all"} onValueChange={(v) => setType(v === "all" ? undefined : v as any)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="collection">Collections</SelectItem>
            <SelectItem value="disbursement">Disbursements</SelectItem>
          </SelectContent>
        </Select>
        <Select value={provider ?? "all"} onValueChange={(v) => setProvider(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All providers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => historyQ.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" />Refresh
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : txns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                  No mobile money transactions found
                </TableCell>
              </TableRow>
            ) : txns.map((tx: any) => {
              const sc = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.pending;
              const prov = PROVIDERS.find((p) => p.id === tx.provider);
              return (
                <TableRow key={tx.id}>
                  <TableCell className="font-mono text-xs">{tx.reference}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs">
                      {tx.type === "collection"
                        ? <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                        : <ArrowUpRight className="w-3 h-3 text-blue-500" />
                      }
                      {tx.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded"
                      style={{ background: prov?.color ?? "#ccc", color: prov?.textColor ?? "#000" }}
                    >
                      {prov?.name ?? tx.provider}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">{tx.phoneNumber}</TableCell>
                  <TableCell className="text-sm font-medium">
                    {formatAmount(tx.amount, tx.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] flex items-center gap-1 w-fit ${sc.color}`}>
                      {sc.icon}{sc.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobileMoneyPage() {
  const { user } = useAuth();
  const merchantId = user?.id ?? "demo_merchant";

  const statsQ = trpc.mobileMoney.stats.useQuery({ merchantId, days: 30 });
  const stats = statsQ.data;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Mobile Money</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Collect payments and disburse funds across MTN MoMo, M-Pesa, Airtel Money, and more
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Collections (30d)", value: (stats?.totalCollections ?? 0).toLocaleString(), icon: <ArrowDownLeft className="w-4 h-4 text-emerald-500" /> },
          { label: "Disbursements (30d)", value: (stats?.totalDisbursements ?? 0).toLocaleString(), icon: <ArrowUpRight className="w-4 h-4 text-blue-500" /> },
          { label: "Collection Volume", value: formatAmount(stats?.collectionVolume ?? 0), icon: <Smartphone className="w-4 h-4" /> },
          { label: "Disbursement Volume", value: formatAmount(stats?.disbursementVolume ?? 0), icon: <Smartphone className="w-4 h-4" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                {s.icon}
                <span className="text-xs">{s.label}</span>
              </div>
              <p className="text-lg font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="collect">
            <TabsList className="mb-6">
              <TabsTrigger value="collect">
                <ArrowDownLeft className="w-4 h-4 mr-1" />Collect Payment
              </TabsTrigger>
              <TabsTrigger value="disburse">
                <ArrowUpRight className="w-4 h-4 mr-1" />Send Money
              </TabsTrigger>
              <TabsTrigger value="history">Transaction History</TabsTrigger>
            </TabsList>

            <TabsContent value="collect">
              <CollectionForm merchantId={merchantId} />
            </TabsContent>

            <TabsContent value="disburse">
              <DisbursementForm merchantId={merchantId} />
            </TabsContent>

            <TabsContent value="history">
              <MomoHistory merchantId={merchantId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Provider coverage note */}
      <Card className="bg-muted/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Coverage & Supported Providers</CardTitle>
          <CardDescription className="text-xs">
            PayGate connects to mobile money operators via direct API integrations and GSMA-compliant MM4W gateways.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map((p) => (
              <span
                key={p.id}
                className="text-xs px-2 py-1 rounded-full font-medium"
                style={{ background: p.color + "22", color: p.color, border: `1px solid ${p.color}44` }}
              >
                {p.name} · {p.country}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
