// @ts-nocheck
/**
 * MojaloopTransfers — /mojaloop/transfers
 *
 * Provides:
 *  - Party lookup (MSISDN, IBAN, account ID) across connected DFSPs
 *  - Transfer initiation dialog (quote → confirm → execute)
 *  - Transfer list with status badges, filter, and detail drawer
 *  - Real-time status polling via tRPC
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useIdempotencyKey } from "@/hooks/useIdempotencyKey";
import { toast } from "sonner";
import {
  Search, Send, RefreshCw, CheckCircle2, XCircle, Clock,
  AlertCircle, ExternalLink, ChevronRight, Globe, Loader2,
  ArrowRight, Building2, Smartphone, CreditCard, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(amount / 100);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-800" },
    completed:  { label: "Completed",  className: "bg-green-100 text-green-800" },
    failed:     { label: "Failed",     className: "bg-red-100 text-red-800" },
    expired:    { label: "Expired",    className: "bg-gray-100 text-gray-600" },
    cancelled:  { label: "Cancelled",  className: "bg-gray-100 text-gray-600" },
  };
  const s = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
}

const PARTY_ID_TYPES = [
  { value: "MSISDN", label: "Mobile Number (MSISDN)" },
  { value: "ACCOUNT_ID", label: "Account ID" },
  { value: "IBAN", label: "IBAN" },
  { value: "EMAIL", label: "Email" },
  { value: "PERSONAL_ID", label: "Personal ID / BVN" },
  { value: "BUSINESS_ID", label: "Business ID / RC Number" },
];

// ─── Party Lookup Panel ───────────────────────────────────────────────────────

function PartyLookupPanel({
  onPartyFound,
}: {
  onPartyFound: (party: any) => void;
}) {
  const [idType, setIdType] = useState("MSISDN");
  const [idValue, setIdValue] = useState("");
  const [result, setResult] = useState<any | null>(null);

  const lookupMutation = trpc.mojaloop.partyLookup.useMutation({
    onSuccess: (data) => {
      setResult(data);
      toast.success("Party found");
    },
    onError: (err) => {
      toast.error(`Party lookup failed: ${err.message}`);
      setResult(null);
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Search className="w-4 h-4 text-blue-500" />
          Party Lookup
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <Select value={idType} onValueChange={setIdType}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTY_ID_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder={idType === "MSISDN" ? "+2348012345678" : "Enter identifier"}
            value={idValue}
            onChange={(e) => { setIdValue(e.target.value); setResult(null); }}
            className="flex-1"
          />
          <Button
            onClick={() => lookupMutation.mutate({ partyIdType: idType, partyIdentifier: idValue })}
            disabled={!idValue || lookupMutation.isPending}
          >
            {lookupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Party found via Mojaloop
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div>
                <p className="text-xs text-gray-500">Name</p>
                <p className="font-medium">{result.party?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">DFSP</p>
                <p className="font-medium">{result.party?.fspId ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">ID Type</p>
                <p className="font-medium">{result.party?.partyIdInfo?.partyIdType ?? idType}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Identifier</p>
                <p className="font-mono text-sm">{result.party?.partyIdInfo?.partyIdentifier ?? idValue}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => onPartyFound(result.party)}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send Transfer
            </Button>
          </div>
        )}

        <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Mojaloop party lookup resolves identifiers across all connected DFSPs (banks, MNOs, wallets)
            using the Account Lookup Service (ALS). Supports cross-border via the Mojaloop Hub.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Transfer Initiation Dialog ───────────────────────────────────────────────

function InitiateTransferDialog({
  open,
  onClose,
  defaultParty,
}: {
  open: boolean;
  onClose: () => void;
  defaultParty?: any;
}) {
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [form, setForm] = useState({
    payeeIdType: defaultParty?.partyIdInfo?.partyIdType ?? "MSISDN",
    payeeIdentifier: defaultParty?.partyIdInfo?.partyIdentifier ?? "",
    payeeFspId: defaultParty?.fspId ?? "",
    amount: "",
    currency: "NGN",
    note: "",
    reference: `MJL-${Date.now()}`,
  });
  const [transferResult, setTransferResult] = useState<any>(null);
  const idem = useIdempotencyKey();

  const initiateMutation = trpc.mojaloop.initiateTransfer.useMutation({
    onSuccess: (data) => {
      setTransferResult(data);
      setStep("done");
      idem.reset();
      toast.success("Transfer initiated via Mojaloop");
    },
    onError: (err) => {
      idem.reset();
      toast.error(`Transfer failed: ${err.message}`);
    },
  });

  const handleSubmit = () => {
    initiateMutation.mutate({
      payeeIdType: form.payeeIdType,
      payeeIdentifier: form.payeeIdentifier,
      payeeFspId: form.payeeFspId || undefined,
      amount: Math.round(parseFloat(form.amount) * 100),
      currency: form.currency,
      note: form.note || undefined,
      reference: form.reference,
      idempotencyKey: idem.getKey(),
    });
  };

  const handleClose = () => {
    setStep("form");
    setForm({ payeeIdType: "MSISDN", payeeIdentifier: "", payeeFspId: "", amount: "", currency: "NGN", note: "", reference: `MJL-${Date.now()}` });
    setTransferResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-500" />
            Mojaloop Transfer
          </DialogTitle>
        </DialogHeader>

        {step === "form" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Payee ID Type</label>
                <Select value={form.payeeIdType} onValueChange={(v) => setForm({ ...form, payeeIdType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARTY_ID_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Payee Identifier</label>
                <Input
                  placeholder="+2348012345678"
                  value={form.payeeIdentifier}
                  onChange={(e) => setForm({ ...form, payeeIdentifier: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Payee FSP ID (optional)</label>
              <Input
                placeholder="e.g. access-bank-ng"
                value={form.payeeFspId}
                onChange={(e) => setForm({ ...form, payeeFspId: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Amount</label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Currency</label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NGN">NGN — Nigerian Naira</SelectItem>
                    <SelectItem value="GHS">GHS — Ghanaian Cedi</SelectItem>
                    <SelectItem value="KES">KES — Kenyan Shilling</SelectItem>
                    <SelectItem value="TZS">TZS — Tanzanian Shilling</SelectItem>
                    <SelectItem value="UGX">UGX — Ugandan Shilling</SelectItem>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Note (optional)</label>
              <Input
                placeholder="Payment note"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>

            <div className="flex items-start gap-2 text-xs text-gray-400 bg-blue-50 rounded-lg p-3">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-400" />
              <span>
                Transfers are routed via the Mojaloop Hub using the FSPIOP API.
                A quote is obtained before execution. Settlement is via TigerBeetle.
              </span>
            </div>
          </div>
        )}

        {step === "done" && transferResult && (
          <div className="space-y-4">
            <div className="bg-green-50 rounded-xl p-4 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
              <p className="font-semibold text-gray-900">Transfer Initiated</p>
              <p className="text-sm text-gray-500">The transfer is being processed via Mojaloop</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Transfer ID</span>
                <span className="font-mono text-xs">{transferResult.transferId ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={transferResult.status ?? "pending"} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium">{fmt(Number(form.amount) * 100, form.currency)}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={!form.payeeIdentifier || !form.amount || initiateMutation.isPending}
              >
                {initiateMutation.isPending ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Initiating…</span>
                ) : (
                  <span className="flex items-center gap-2"><Send className="w-4 h-4" /> Send Transfer</span>
                )}
              </Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer List ────────────────────────────────────────────────────────────

function TransferList() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = trpc.mojaloop.listTransfers.useQuery(
    { status: statusFilter as any, limit: 50, offset: 0 },
    { refetchInterval: 15_000 }
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (t: any) =>
        t.transferId?.toLowerCase().includes(q) ||
        t.payeeIdentifier?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Transfer History</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search transfers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 h-8 text-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No transfers found</p>
            <p className="text-xs mt-1">Initiate a transfer using the form above</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transfer ID</TableHead>
                <TableHead>Payee</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs">{t.transferId?.substring(0, 16)}…</TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{t.payeeName ?? t.payeeIdentifier ?? "—"}</p>
                      <p className="text-xs text-gray-400">{t.payeeFspId ?? ""}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {fmt(Number(t.amount ?? 0), t.currency ?? "NGN")}
                  </TableCell>
                  <TableCell><StatusBadge status={t.status ?? "pending"} /></TableCell>
                  <TableCell className="text-xs text-gray-500">
                    {t.createdAt ? new Date(t.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Analytics Summary ────────────────────────────────────────────────────────

function MojaloopAnalytics() {
  const { data } = trpc.mojaloop.getAnalytics.useQuery(
    { days: 30 },
    { staleTime: 60_000 * 5 }
  );

  const stats = [
    { label: "Total Transfers", value: data?.totalTransfers ?? 0, icon: Send },
    { label: "Completed", value: data?.completedTransfers ?? 0, icon: CheckCircle2 },
    { label: "Failed", value: data?.failedTransfers ?? 0, icon: XCircle },
    { label: "Volume (NGN)", value: data?.totalVolumeNgn ? fmt(data.totalVolumeNgn, "NGN") : "—", icon: Globe },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <s.icon className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-lg font-bold text-gray-900">{s.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MojaloopTransfers() {
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [defaultParty, setDefaultParty] = useState<any>(null);

  const handlePartyFound = (party: any) => {
    setDefaultParty(party);
    setTransferDialogOpen(true);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-500" />
            Mojaloop Transfers
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Interoperable payments across all connected DFSPs via the Mojaloop Hub
          </p>
        </div>
        <Button onClick={() => { setDefaultParty(null); setTransferDialogOpen(true); }}>
          <Send className="w-4 h-4 mr-2" />
          New Transfer
        </Button>
      </div>

      {/* Architecture note */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold mb-1">Mojaloop DFSP Integration</p>
          <p className="text-xs text-blue-700">
            PayGate connects as a DFSP via the FSPIOP API. Transfers flow: Party Lookup (ALS) →
            Quote (Quoting Service) → Transfer (Transfer Service) → Settlement (TigerBeetle).
            NIBSS NIP is the underlying Nigerian interbank rail. Mojaloop adds cross-DFSP and
            cross-border routing on top.
          </p>
        </div>
      </div>

      {/* Analytics */}
      <MojaloopAnalytics />

      {/* Tabs */}
      <Tabs defaultValue="lookup">
        <TabsList>
          <TabsTrigger value="lookup">Party Lookup</TabsTrigger>
          <TabsTrigger value="transfers">Transfer History</TabsTrigger>
        </TabsList>

        <TabsContent value="lookup" className="mt-4">
          <PartyLookupPanel onPartyFound={handlePartyFound} />
        </TabsContent>

        <TabsContent value="transfers" className="mt-4">
          <TransferList />
        </TabsContent>
      </Tabs>

      {/* Transfer Dialog */}
      <InitiateTransferDialog
        open={transferDialogOpen}
        onClose={() => setTransferDialogOpen(false)}
        defaultParty={defaultParty}
      />
    </div>
  );
}
