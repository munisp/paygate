/**
 * USDC Wallet Settings Section
 * ============================
 * Allows merchants to register, validate, and manage their Solana wallet
 * addresses for USDC payouts.
 */

import { useState } from "react";
import { Wallet, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function truncateAddress(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-6)}`;
}

export default function USDCWalletSection() {
  const [walletAddress, setWalletAddress] = useState("");
  const [label, setLabel] = useState("");
  const [network, setNetwork] = useState<"mainnet" | "devnet">("mainnet");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  const utils = trpc.useUtils();

  const { data: wallets, isLoading } = trpc.usdc.listWallets.useQuery();
  const { data: balance } = trpc.usdc.getBalance.useQuery();

  const registerWallet = trpc.usdc.registerWallet.useMutation({
    onSuccess: () => {
      toast.success("Wallet registered successfully");
      setWalletAddress("");
      setLabel("");
      setValidationResult(null);
      utils.usdc.listWallets.invalidate();
      utils.usdc.getBalance.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deactivateWallet = trpc.usdc.deactivateWallet.useMutation({
    onSuccess: () => {
      toast.success("Wallet deactivated");
      utils.usdc.listWallets.invalidate();
      utils.usdc.getBalance.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleValidate = async () => {
    if (!walletAddress.trim()) return;
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await utils.usdc.validateWallet.fetch({
        walletAddress: walletAddress.trim(),
        network,
      });
      setValidationResult(result);
      if (result.valid) {
        toast.success("Wallet address is valid and has a USDC token account");
      } else {
        toast.error(result.error ?? "Invalid wallet address");
      }
    } catch {
      toast.error("Validation failed — bridge unavailable");
      setValidationResult({ valid: false, error: "Bridge unavailable" });
    } finally {
      setValidating(false);
    }
  };

  const handleRegister = () => {
    if (!walletAddress.trim()) {
      toast.error("Enter a wallet address first");
      return;
    }
    registerWallet.mutate({
      walletAddress: walletAddress.trim(),
      label: label.trim() || undefined,
      network,
    });
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast.success("Address copied");
  };

  return (
    <div className="bg-card rounded-xl border border-border p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">USDC Payout Wallet</h3>
        <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          Solana SPL
        </span>
      </div>

      {/* Balance display */}
      {balance?.hasWallet && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Active Wallet Balance</p>
            <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
              ${balance.balanceUsdc} <span className="text-sm font-normal">USDC</span>
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5 font-mono">
              {truncateAddress(balance.walletAddress ?? "")}
            </p>
          </div>
          <div className="text-right">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              balance.network === "mainnet"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            }`}>
              {balance.network}
            </span>
          </div>
        </div>
      )}

      {/* Registered wallets */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : wallets && wallets.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Registered Wallets</p>
          {wallets.map((w) => (
            <div
              key={w.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                w.isActive
                  ? "border-primary/30 bg-primary/5"
                  : "border-border bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate font-mono">{truncateAddress(w.walletAddress)}</p>
                  {w.isActive && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                      active
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {w.label} · {w.network}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => copyAddress(w.walletAddress)}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(
                    `https://explorer.solana.com/address/${w.walletAddress}${w.network === "devnet" ? "?cluster=devnet" : ""}`,
                    "_blank"
                  )}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
                {w.isActive && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deactivateWallet.mutate({ walletId: w.id })}
                    disabled={deactivateWallet.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground">
          <Wallet className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No wallets registered yet</p>
          <p className="text-xs mt-1">Add a Solana wallet to enable USDC payouts</p>
        </div>
      )}

      {/* Register new wallet */}
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Register New Wallet</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Solana Wallet Address</Label>
            <Input
              placeholder="e.g. 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
              value={walletAddress}
              onChange={(e) => {
                setWalletAddress(e.target.value);
                setValidationResult(null);
              }}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Network</Label>
            <Select value={network} onValueChange={(v) => setNetwork(v as "mainnet" | "devnet")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mainnet">Mainnet</SelectItem>
                <SelectItem value="devnet">Devnet (testing)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Label (optional)</Label>
          <Input
            placeholder="e.g. Primary payout wallet"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Validation feedback */}
        {validationResult && (
          <div className={`flex items-center gap-2 text-sm p-2 rounded-lg ${
            validationResult.valid
              ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400"
          }`}>
            {validationResult.valid
              ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              : <AlertCircle className="w-4 h-4 flex-shrink-0" />
            }
            <span>
              {validationResult.valid
                ? "Valid — USDC token account found on-chain"
                : validationResult.error ?? "Invalid wallet address"
              }
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleValidate}
            disabled={!walletAddress.trim() || validating}
            className="gap-1.5"
          >
            {validating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            {validating ? "Validating..." : "Validate"}
          </Button>
          <Button
            onClick={handleRegister}
            disabled={!walletAddress.trim() || registerWallet.isPending}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {registerWallet.isPending ? "Registering..." : "Register Wallet"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          The wallet must have an existing USDC token account on Solana. Registering a new wallet
          automatically deactivates the previous one. Payouts settle in ~2–5 seconds on mainnet.
        </p>
      </div>
    </div>
  );
}
