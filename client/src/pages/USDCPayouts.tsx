/**
 * USDC Payouts Page
 * =================
 * Full USDC payout management: initiate payouts, view history, track status,
 * and monitor incoming deposits.
 */

import { useState, useEffect } from "react";
import {
  Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw,
  CheckCircle2, Clock, XCircle, AlertCircle, ExternalLink,
  Copy, Zap, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAdaptiveInterval } from "@/lib/networkQuality";

// ── Status Badge ──────────────────────────────────────────────────────────────

type PayoutStatus = "pending" | "reserved" | "broadcasting" | "confirming" | "settled" | "failed" | "voided";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:      { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "Pending" },
    reserved:     { cls: "bg-blue-50 text-blue-700 border-blue-200", label: "Reserved" },
    broadcasting: { cls: "bg-purple-50 text-purple-700 border-purple-200", label: "Broadcasting" },
    confirming:   { cls: "bg-indigo-50 text-indigo-700 border-indigo-200", label: "Confirming" },
    settled:      { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Settled" },
    failed:       { cls: "bg-red-50 text-red-700 border-red-200", label: "Failed" },
    voided:       { cls: "bg-gray-50 text-gray-600 border-gray-200", label: "Voided" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "settled") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (status === "failed" || status === "voided") return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === "confirming" || status === "broadcasting") return <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
}

function truncate(addr: string) {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

function formatUsdc(lamports: number) {
  return (lamports / 1_000_000).toFixed(6).replace(/\.?0+$/, "");
}

// ── Initiate Payout Form ──────────────────────────────────────────────────────

function InitiatePayoutForm({ onSuccess }: { onSuccess: () => void }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [network, setNetwork] = useState<"mainnet" | "devnet">("mainnet");
  const [expanded, setExpanded] = useState(false);

  const initiatePayout = trpc.usdc.initiatePayout.useMutation({
    onSuccess: (data) => {
      toast.success(`Payout initiated — ID: ${data.payoutId}`);
      setRecipient("");
      setAmount("");
      setReference("");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (!recipient.trim()) { toast.error("Enter recipient wallet address"); return; }
    if (isNaN(amountNum) || amountNum <= 0) { toast.error("Enter a valid USDC amount"); return; }
    if (amountNum < 0.000001) { toast.error("Minimum payout is 0.000001 USDC"); return; }
    initiatePayout.mutate({
      recipientWallet: recipient.trim(),
      amountUsdc: amountNum,
      reference: reference.trim() || undefined,
      network,
    });
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v: any) => !v)}
      >
        <div className="flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Initiate USDC Payout</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <form onSubmit={handleSubmit} className="p-4 pt-0 space-y-3 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Recipient Solana Wallet Address</Label>
              <Input
                placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
                value={recipient}
                onChange={(e: any) => setRecipient(e.target.value)}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount (USDC)</Label>
              <Input
                type="number"
                step="0.000001"
                min="0.000001"
                placeholder="0.00"
                value={amount}
                onChange={(e: any) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Network</Label>
              <Select value={network} onValueChange={(v: any) => setNetwork(v as "mainnet" | "devnet")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mainnet">Mainnet</SelectItem>
                  <SelectItem value="devnet">Devnet (testing)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1">
              <Label className="text-xs">Reference (optional)</Label>
              <Input
                placeholder="e.g. order-12345 or seller-payout-q1"
                value={reference}
                onChange={(e: any) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              type="submit"
              disabled={initiatePayout.isPending}
              className="gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              {initiatePayout.isPending ? "Initiating..." : "Send USDC"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Settles in ~2–5 seconds on mainnet via Temporal workflow
            </p>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Payout Row ────────────────────────────────────────────────────────────────

function PayoutRow({ payout }: { payout: any }) {
  const usdcPayoutsInterval = useAdaptiveInterval(3000);
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  // Auto-poll for in-flight payouts
  const { data: latest } = trpc.usdc.getPayoutStatus.useQuery(
    { payoutId: payout.id },
    {
      enabled: ["pending", "reserved", "broadcasting", "confirming"].includes(payout.status, { staleTime: 30_000 }),
      refetchInterval: usdcPayoutsInterval,
    }
  );

  const current = latest ?? payout;

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success("Copied");
  };

  return (
    <div className="border-b border-border last:border-0">
      <div
        className="flex items-center gap-3 p-3 hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={() => setExpanded((v: any) => !v)}
      >
        <StatusIcon status={current.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-mono truncate">{truncate(current.recipientWallet)}</p>
            <StatusBadge status={current.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(current.initiatedAt).toLocaleString()} · {current.network}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatUsdc(current.amountLamports)} USDC</p>
          {current.reference && (
            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{current.reference}</p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 bg-muted/10 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-muted-foreground">Payout ID</p>
              <p className="font-mono">{current.id}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Recipient</p>
              <div className="flex items-center gap-1">
                <p className="font-mono truncate">{truncate(current.recipientWallet)}</p>
                <button onClick={() => copyAddress(current.recipientWallet)}>
                  <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
            {current.solanaSignature && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Solana Signature</p>
                <div className="flex items-center gap-1">
                  <p className="font-mono truncate">{truncate(current.solanaSignature)}</p>
                  <button onClick={() => copyAddress(current.solanaSignature)}>
                    <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </button>
                  <a
                    href={`https://explorer.solana.com/tx/${current.solanaSignature}${current.network === "devnet" ? "?cluster=devnet" : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                  </a>
                </div>
              </div>
            )}
            {current.temporalWorkflowId && (
              <div>
                <p className="text-muted-foreground">Temporal Workflow</p>
                <p className="font-mono truncate">{current.temporalWorkflowId}</p>
              </div>
            )}
            {current.failureReason && (
              <div className="col-span-2">
                <p className="text-muted-foreground">Failure Reason</p>
                <p className="text-red-600">{current.failureReason}</p>
              </div>
            )}
            {current.fraudScore != null && (
              <div>
                <p className="text-muted-foreground">Fraud Score</p>
                <p className={current.fraudScore > 70 ? "text-red-600 font-semibold" : "text-foreground"}>
                  {current.fraudScore}/100
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Deposits Tab ──────────────────────────────────────────────────────────────

function DepositsTab() {
  const { data, isLoading, refetch } = trpc.usdc.listDeposits.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
      </div>
    );
  }

  const deposits = data?.deposits ?? [];

  if (!deposits.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <ArrowDownLeft className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No deposits detected yet</p>
        <p className="text-xs mt-1">Incoming USDC transfers to your registered wallet will appear here</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <p className="text-sm font-medium">{deposits.length} deposit{deposits.length !== 1 ? "s" : ""}</p>
        <Button variant="ghost" size="sm" aria-label="Refresh" onClick={() => refetch()} className="h-7 text-xs gap-1"><RefreshCw/> Refresh
        </Button>
      </div>
      {deposits.map((d: any) => (
        <div key={d.id} className="flex items-center gap-3 p-3 border-b border-border last:border-0 hover:bg-muted/20">
          <ArrowDownLeft className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono truncate">{truncate(d.walletAddress)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(d.detectedAt).toLocaleString()} · {d.network}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-emerald-600">+{formatUsdc(d.amountLamports)} USDC</p>
            {d.solanaSignature && (
              <a
                href={`https://explorer.solana.com/tx/${d.solanaSignature}${d.network === "devnet" ? "?cluster=devnet" : ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 justify-end"
              >
                View <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function USDCPayouts() {
  const [activeTab, setActiveTab] = useState<"payouts" | "deposits">("payouts");
  const utils = trpc.useUtils();

  const { data: balance, isLoading: balanceLoading } = trpc.usdc.getBalance.useQuery();
  const { data: payoutsData, isLoading: payoutsLoading, refetch: refetchPayouts } = trpc.usdc.listPayouts.useQuery();

  const payouts = payoutsData?.payouts ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">USDC Payouts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Native Solana SPL token payouts — no intermediaries, settles in seconds
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh" onClick={() => {
            refetchPayouts();
            utils.usdc.getBalance.invalidate();
          }}
          className="gap-1.5"
        ><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Balance card */}
      {balanceLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : balance?.hasWallet ? (
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-indigo-200">Available Balance</p>
              <p className="text-3xl font-bold mt-1">${balance.balanceUsdc} <span className="text-lg font-normal">USDC</span></p>
              <p className="text-xs text-indigo-200 mt-1 font-mono">{truncate(balance.walletAddress ?? "")}</p>
            </div>
            <div className="text-right">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                balance.network === "mainnet"
                  ? "bg-white/20 text-white"
                  : "bg-amber-400/30 text-amber-200"
              }`}>
                {balance.network}
              </span>
              <p className="text-xs text-indigo-200 mt-2">Solana SPL</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-dashed border-border p-6 text-center">
          <Wallet className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm font-medium">No wallet registered</p>
          <p className="text-xs text-muted-foreground mt-1">
            Go to <strong>Settings → USDC Payout Wallet</strong> to register a Solana wallet
          </p>
        </div>
      )}

      {/* Initiate payout form */}
      {balance?.hasWallet && (
        <InitiatePayoutForm onSuccess={() => {
          refetchPayouts();
          utils.usdc.getBalance.invalidate();
        }} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["payouts", "deposits"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "payouts" ? "Payout History" : "Incoming Deposits"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "payouts" ? (
        payoutsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : payouts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <ArrowUpRight className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No payouts yet</p>
            <p className="text-xs mt-1">Initiate your first USDC payout above</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-border">
              <p className="text-sm font-medium">{payouts.length} payout{payouts.length !== 1 ? "s" : ""}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Settled
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block animate-pulse" /> In-flight
                </span>
              </div>
            </div>
            {payouts.map((p: any) => <PayoutRow key={p.id} payout={p} />)}
          </div>
        )
      ) : (
        <DepositsTab />
      )}
    </div>
  );
}
