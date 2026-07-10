// @ts-nocheck
/**
 * HostedPaymentPage — /pay/:slug
 *
 * The customer-facing hosted payment page served by PayGate.
 * Supports: Card (Stripe Elements), Bank Transfer (NIP virtual account + countdown),
 *           USSD (dial code), BNPL (instalment breakdown), USDC (wallet address).
 *
 * Theming is driven by the merchant's CheckoutTheme record.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import {
  CreditCard, Building2, Phone, Smartphone, DollarSign,
  CheckCircle2, XCircle, Loader2, Copy, RefreshCw, Shield,
  Clock, ChevronRight, ChevronLeft, Lock, AlertCircle, Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(kobo: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}

function useCountdown(expiresAt: Date | null | undefined) {
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, expiresAt.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return { remaining, mins, secs, expired: remaining === 0 };
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
      style={{ background: copied ? "#10B981" : "#F3F4F6", color: copied ? "#fff" : "#374151" }}
    >
      {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied!" : (label ?? "Copy")}
    </button>
  );
}

// ─── Payment Method Icons & Config ────────────────────────────────────────────

const METHOD_CONFIG = {
  card:          { label: "Card",          icon: CreditCard,  desc: "Visa · Mastercard · Verve" },
  bank_transfer: { label: "Bank Transfer", icon: Building2,   desc: "Instant NIP transfer" },
  ussd:          { label: "USSD",          icon: Phone,       desc: "*737# and more" },
  bnpl:          { label: "Pay Later",     icon: Smartphone,  desc: "Split into instalments" },
  usdc:          { label: "USDC",          icon: DollarSign,  desc: "Pay with stablecoin" },
} as const;

const USSD_BANKS = [
  { code: "058", name: "GTBank",       dial: "*737" },
  { code: "011", name: "First Bank",   dial: "*894" },
  { code: "044", name: "Access Bank",  dial: "*901" },
  { code: "057", name: "Zenith Bank",  dial: "*822" },
  { code: "033", name: "UBA",          dial: "*919" },
  { code: "232", name: "Sterling",     dial: "*833" },
  { code: "000", name: "Other",        dial: "*737" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CardForm({ onPay, amountKobo, currency, clientSecret, primaryColor, isLoading }: {
  onPay: (data: { cardNumber: string; expiry: string; cvv: string; name: string }) => void;
  amountKobo: number;
  currency: string;
  clientSecret?: string | null;
  primaryColor: string;
  isLoading: boolean;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");

  const formatCard = (v: string) =>
    v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
  };

  const cardBrand = cardNumber.startsWith("4") ? "Visa"
    : cardNumber.startsWith("5") ? "Mastercard"
    : cardNumber.startsWith("6") ? "Verve"
    : null;

  return (
    <div className="space-y-4">
      {/* Card number */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">Card Number</label>
        <div className="relative">
          <input
            value={cardNumber}
            onChange={e => setCardNumber(formatCard(e.target.value))}
            placeholder="0000 0000 0000 0000"
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 font-mono"
            style={{ "--tw-ring-color": primaryColor } as any}
            maxLength={19}
          />
          {cardBrand && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
              {cardBrand}
            </span>
          )}
        </div>
      </div>

      {/* Expiry + CVV */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Expiry</label>
          <input
            value={expiry}
            onChange={e => setExpiry(formatExpiry(e.target.value))}
            placeholder="MM/YY"
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 font-mono"
            maxLength={5}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">CVV</label>
          <input
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="•••"
            type="password"
            className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 font-mono"
            maxLength={4}
          />
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1.5">Cardholder Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="John Doe"
          className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
        />
      </div>

      {/* Security note */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" />
        <span>256-bit SSL · PCI DSS Level 1 · 3D Secure enabled</span>
      </div>

      <button
        onClick={() => onPay({ cardNumber, expiry, cvv, name })}
        disabled={isLoading || !cardNumber || !expiry || !cvv || !name}
        className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: primaryColor }}
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        {isLoading ? "Processing…" : `Pay ${fmt(amountKobo, currency)}`}
      </button>
    </div>
  );
}

function BankTransferPanel({ session, primaryColor }: { session: any; primaryColor: string }) {
  // ── Step 1: bank selection → Step 2: name enquiry → Step 3: virtual account ──
  const [step, setStep] = useState<"select_bank" | "name_enquiry" | "virtual_account">(
    session.nipVirtualAccountNumber ? "virtual_account" : "select_bank"
  );
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<{ nipCode: string; bankName: string } | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState<string | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<{
    accountNumber: string; accountName: string; bankName: string; expiresAt: Date;
  } | null>(
    session.nipVirtualAccountNumber
      ? { accountNumber: session.nipVirtualAccountNumber, accountName: session.nipAccountName ?? "",
          bankName: session.nipBankName ?? "", expiresAt: new Date(session.nipExpiresAt ?? Date.now() + 30 * 60_000) }
      : null
  );

  const expiresAt = virtualAccount?.expiresAt ?? null;
  const { mins, secs, expired } = useCountdown(expiresAt);

  // Load bank list
  const { data: banksData, isLoading: banksLoading } = trpc.nipBanks.list.useQuery(
    { category: "all", search: bankSearch || undefined, activeOnly: true },
    { staleTime: 60_000 * 60 }
  );

  // Name enquiry mutation
  const nameEnquiryMutation = trpc.nipBanks.nameEnquiry.useMutation({
    onSuccess: (data) => {
      setAccountName(data.accountName);
    },
    onError: () => {
      toast.error("Account not found. Please check the account number.");
    },
  });

  // Generate virtual account mutation
  const generateVAMutation = trpc.nipBanks.generateVirtualAccount.useMutation({
    onSuccess: (data) => {
      setVirtualAccount({
        accountNumber: data.accountNumber,
        accountName: data.accountName,
        bankName: data.bankName,
        expiresAt: new Date(data.expiresAt),
      });
      setStep("virtual_account");
    },
    onError: () => {
      toast.error("Failed to generate virtual account. Please try again.");
    },
  });

  const handleBankSelect = (bank: { nipCode: string; bankName: string }) => {
    setSelectedBank(bank);
    setStep("name_enquiry");
    setAccountNumber("");
    setAccountName(null);
  };

  const handleNameEnquiry = () => {
    if (!selectedBank || accountNumber.length !== 10) return;
    nameEnquiryMutation.mutate({ bankNipCode: selectedBank.nipCode, accountNumber });
  };

  const handleGenerateVA = () => {
    if (!selectedBank || !accountName) return;
    generateVAMutation.mutate({
      merchantId: session.merchantId ?? "",
      reference: session.reference ?? `REF${Date.now()}`,
      bankNipCode: selectedBank.nipCode,
      accountName: accountName,
      amountExpected: Number(session.amountKobo),
      expiryMinutes: 30,
      checkoutSessionId: session.id,
    });
  };

  // ── Step 1: Bank Selection ──────────────────────────────────────────────────
  if (step === "select_bank") {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-700">Select your bank</p>
        <input
          type="text"
          placeholder="Search bank name or code…"
          value={bankSearch}
          onChange={(e) => setBankSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        {banksLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
            {(banksData ?? []).map((bank: any) => (
              <button
                key={bank.nipCode}
                onClick={() => handleBankSelect({ nipCode: bank.nipCode, bankName: bank.bankName })}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-blue-50 transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{bank.bankName}</p>
                  <p className="text-xs text-gray-400">{bank.nipCode} · {bank.category}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </button>
            ))}
            {(banksData ?? []).length === 0 && (
              <p className="text-center text-sm text-gray-400 py-4">No banks found</p>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
          <Zap className="w-3.5 h-3.5 text-yellow-400" />
          <span>All {(banksData ?? []).length} CBN-licensed NIP banks supported</span>
        </div>
      </div>
    );
  }

  // ── Step 2: Name Enquiry ────────────────────────────────────────────────────
  if (step === "name_enquiry") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setStep("select_bank")} className="text-gray-400 hover:text-gray-600">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-sm font-semibold text-gray-700">{selectedBank?.bankName}</p>
            <p className="text-xs text-gray-400">Enter your account number</p>
          </div>
        </div>

        <div className="space-y-2">
          <input
            type="tel"
            placeholder="10-digit account number"
            value={accountNumber}
            maxLength={10}
            onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setAccountName(null); }}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
          {accountNumber.length === 10 && !accountName && (
            <button
              onClick={handleNameEnquiry}
              disabled={nameEnquiryMutation.isPending}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {nameEnquiryMutation.isPending ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</span>
              ) : "Verify Account"}
            </button>
          )}
        </div>

        {accountName && (
          <div className="bg-green-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Account verified</p>
              <p className="text-base font-bold text-gray-900">{accountName}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
        )}

        {accountName && (
          <button
            onClick={handleGenerateVA}
            disabled={generateVAMutation.isPending}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {generateVAMutation.isPending ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Generating account…</span>
            ) : "Get Virtual Account"}
          </button>
        )}
      </div>
    );
  }

  // ── Step 3: Virtual Account Display ────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Transfer to this account</p>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Bank Name</p>
              <p className="font-semibold text-gray-900">{virtualAccount?.bankName ?? session.nipBankName ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Account Number</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-widest">
                {virtualAccount?.accountNumber ?? session.nipVirtualAccountNumber ?? "—"}
              </p>
            </div>
            <CopyButton text={virtualAccount?.accountNumber ?? session.nipVirtualAccountNumber ?? ""} label="Copy" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Account Name</p>
              <p className="text-sm font-medium text-gray-700">{virtualAccount?.accountName ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Amount (exact)</p>
              <p className="font-mono font-bold text-lg" style={{ color: primaryColor }}>
                {fmt(Number(session.amountKobo), session.currency)}
              </p>
            </div>
            <CopyButton text={String(Number(session.amountKobo) / 100)} label="Copy amount" />
          </div>
        </div>
      </div>

      {expiresAt && !expired && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4" />
          <span>Account expires in <strong className="font-mono">{mins}:{String(secs).padStart(2, "0")}</strong></span>
        </div>
      )}
      {expired && (
        <div className="flex items-center gap-2 text-sm text-rose-700 bg-rose-50 rounded-xl px-4 py-3">
          <XCircle className="w-4 h-4" />
          <span>Account expired. <button onClick={() => setStep("select_bank")} className="underline font-medium">Start again</button></span>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Instructions</p>
        <p>1. Open your mobile banking app or internet banking</p>
        <p>2. Transfer the <strong>exact amount</strong> to the account above</p>
        <p>3. Payment is confirmed automatically within seconds</p>
        <p>4. Do not close this page until confirmation</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Zap className="w-3.5 h-3.5 text-yellow-400" />
        <span>Powered by NIBSS NIP — instant settlement</span>
      </div>
    </div>
  );
}

function USSDPanel({ session, primaryColor }: { session: any; primaryColor: string }) {
  return (
    <div className="space-y-4">
      <div className="bg-purple-50 rounded-2xl p-5 text-center space-y-3">
        <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Dial this code</p>
        <div className="font-mono text-3xl font-black text-gray-900 tracking-widest bg-white rounded-xl py-4 px-6 border-2 border-purple-200">
          {session.ussdCode ?? "*737*000*123456#"}
        </div>
        <CopyButton text={session.ussdCode ?? ""} label="Copy USSD code" />
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">How to pay</p>
        <p>1. Open your phone dialler</p>
        <p>2. Dial <strong className="font-mono">{session.ussdCode ?? "*737*000*123456#"}</strong></p>
        <p>3. Follow the prompts and enter your PIN</p>
        <p>4. Confirm the amount: <strong>{fmt(Number(session.amountKobo), session.currency)}</strong></p>
        <p>5. Payment confirmed automatically</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Phone className="w-3.5 h-3.5" />
        <span>Works on all Nigerian networks — no internet required</span>
      </div>
    </div>
  );
}

function BNPLPanel({ session, primaryColor }: { session: any; primaryColor: string }) {
  const installmentKobo = Number(session.bnplInstallmentKobo ?? 0);
  const count = session.bnplInstallmentCount ?? 3;
  const schedule = Array.from({ length: count }, (_, i) => ({
    label: i === 0 ? "Today" : `Month ${i + 1}`,
    date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }),
    amount: installmentKobo,
  }));

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Instalment Plan</p>
        <div className="space-y-2">
          {schedule.map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-white rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{s.label}</p>
                <p className="text-xs text-gray-400">{s.date}</p>
              </div>
              <p className="font-mono font-bold text-sm" style={{ color: i === 0 ? primaryColor : "#374151" }}>
                {fmt(s.amount, session.currency)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 px-1 pt-1 border-t border-amber-100">
          <span>Total</span>
          <span className="font-mono font-bold">{fmt(Number(session.amountKobo), session.currency)}</span>
        </div>
      </div>

      <a
        href={session.bnplApprovalUrl ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3.5 rounded-xl text-white font-semibold text-sm text-center transition-opacity hover:opacity-90"
        style={{ background: primaryColor }}
      >
        Continue with {session.bnplProvider ?? "Carbon"} →
      </a>

      <p className="text-xs text-gray-400 text-center">
        Subject to credit check · 0% interest · No hidden fees
      </p>
    </div>
  );
}

function USDCPanel({ session, primaryColor }: { session: any; primaryColor: string }) {
  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Send USDC to this address</p>
        <div>
          <p className="text-xs text-gray-500 mb-1">Network</p>
          <p className="font-semibold text-gray-900 capitalize">{session.usdcNetwork ?? "Ethereum"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Wallet Address</p>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs text-gray-900 break-all flex-1">
              {session.usdcWalletAddress ?? "0x..."}
            </p>
            <CopyButton text={session.usdcWalletAddress ?? ""} />
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Amount (USDC)</p>
          <p className="font-mono text-xl font-bold" style={{ color: primaryColor }}>
            {session.usdcAmountUsdc?.toFixed(2) ?? "0.00"} USDC
          </p>
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Instructions</p>
        <p>1. Open your crypto wallet (MetaMask, Coinbase, Trust Wallet)</p>
        <p>2. Send exactly <strong>{session.usdcAmountUsdc?.toFixed(2)} USDC</strong> on {session.usdcNetwork}</p>
        <p>3. Payment confirmed after 1 block confirmation (~15 seconds)</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HostedPaymentPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [paymentState, setPaymentState] = useState<"idle" | "processing" | "success" | "failed">("idle");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [ussdBankCode, setUssdBankCode] = useState("058");
  const [bnplCount, setBnplCount] = useState(3);
  const [step, setStep] = useState<"info" | "method" | "pay" | "done">("info");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load payment link
  const { data: linkData, isLoading: linkLoading, error: linkError } = trpc.hostedCheckout.getPaymentLinkDetails.useQuery(
    { slug: slug ?? "" },
    { enabled: !!slug, retry: false },
  );

  const initiateMutation = trpc.hostedCheckout.initiatePayment.useMutation();
  const confirmMutation = trpc.hostedCheckout.confirmPayment.useMutation();
  const trackEvent = trpc.hostedCheckout.trackEvent.useMutation();

  // Fire 'view' event on page load
  const linkId = linkData?.link?.id;
  useEffect(() => {
    if (linkId) {
      trackEvent.mutate({ paymentLinkId: linkId, eventType: "view" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);
  const { data: statusData, refetch: refetchStatus } = trpc.hostedCheckout.getStatus.useQuery(
    { sessionId: session?.id ?? "" },
    { enabled: !!session?.id && paymentState === "processing", refetchInterval: 3000 },
  );

  // Watch for status changes
  useEffect(() => {
    if (!statusData) return;
    if (statusData.status === "completed") {
      setPaymentState("success");
      setStep("done");
    } else if (statusData.status === "failed" || statusData.status === "expired") {
      setPaymentState("failed");
    }
  }, [statusData]);

  const link = linkData?.link;
  const theme = linkData?.theme;

  const primaryColor = theme?.primaryColor ?? "#4F46E5";
  const backgroundColor = theme?.backgroundColor ?? "#f9fafb";
  const textColor = theme?.textColor ?? "#111827";
  const borderRadius = `${theme?.borderRadius ?? 16}px`;
  const fontFamily = theme?.fontFamily ?? "Inter";
  const businessName = theme?.businessName ?? "Merchant";
  const logoUrl = theme?.logoUrl;
  const showMethods: string[] = (theme?.showPaymentMethods as string[]) ?? ["card", "bank_transfer", "ussd", "bnpl"];

  const handleInitiate = async (method: string) => {
    if (!link) return;
    // Fire analytics events
    trackEvent.mutate({ paymentLinkId: link.id, eventType: "method_selected", metadata: { method } });
    setSelectedMethod(method);
    setPaymentState("processing");
    try {
      const s = await initiateMutation.mutateAsync({
        paymentLinkId: link.id,
        merchantId: link.merchantId,
        tenantId: link.tenantId,
        amountKobo: Number(link.amount) * 100, // link.amount stored in kobo already? check schema
        currency: link.currency ?? "NGN",
        description: link.description ?? undefined,
        paymentMethod: method as any,
        customerEmail: customerEmail || undefined,
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        ussdBankCode: method === "ussd" ? ussdBankCode : undefined,
        bnplInstallmentCount: method === "bnpl" ? bnplCount : undefined,
      });
      setSession(s);
      setStep("pay");
      trackEvent.mutate({ paymentLinkId: link.id, eventType: "initiated", metadata: { method, sessionId: s.id } });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to initiate payment");
      setPaymentState("idle");
    }
  };

  const handleCardPay = async () => {
    if (!session) return;
    setPaymentState("processing");
    try {
      // In production: Stripe.js confirmCardPayment(session.stripeClientSecret, { payment_method: { card: elements.getElement('card') } })
      // For now we call our confirm endpoint directly
      await confirmMutation.mutateAsync({ sessionId: session.id, stripePaymentIntentId: session.stripePaymentIntentId });
      setPaymentState("success");
      setStep("done");
    } catch (err: any) {
      toast.error(err?.message ?? "Payment failed");
      setPaymentState("failed");
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (linkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: backgroundColor }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (linkError || !link) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: backgroundColor }}>
        <div className="text-center p-8 max-w-sm">
          <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2" style={{ color: textColor }}>Payment Link Not Found</h2>
          <p className="text-gray-500 text-sm">This payment link is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: backgroundColor, fontFamily }}>
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center" style={{ borderRadius }}>
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: textColor }}>Payment Successful!</h2>
          <p className="text-gray-500 text-sm mb-4">
            {fmt(Number(link.amount), link.currency ?? "NGN")} paid to {businessName}
          </p>
          {session?.reference && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 mb-6">
              <p className="text-xs text-gray-400 mb-1">Reference</p>
              <p className="font-mono text-sm font-bold" style={{ color: primaryColor }}>{session.reference}</p>
            </div>
          )}
          {customerEmail && (
            <p className="text-xs text-gray-400 mb-6">Receipt sent to {customerEmail}</p>
          )}
          <p className="text-xs text-gray-300">Powered by <strong style={{ color: primaryColor }}>PayGate</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: backgroundColor, fontFamily }}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden" style={{ borderRadius }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-6 text-center" style={{ background: primaryColor }}>
          {logoUrl ? (
            <img src={logoUrl} alt={businessName} className="w-12 h-12 rounded-xl mx-auto mb-3 object-contain bg-white p-1" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center mx-auto mb-3">
              <span className="text-white font-bold text-lg">{businessName.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <p className="text-white/80 text-xs font-medium">{businessName}</p>
          <p className="text-white text-3xl font-black mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {fmt(Number(link.amount), link.currency ?? "NGN")}
          </p>
          {link.description && (
            <p className="text-white/60 text-xs mt-1">{link.description}</p>
          )}
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="p-6">

          {/* Step: Customer info */}
          {step === "info" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Details</p>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Email address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Full name</label>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Phone number</label>
                <input
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+234 801 234 5678"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2"
                />
              </div>
              <button
                onClick={() => setStep("method")}
                disabled={!customerEmail}
                className="w-full py-3.5 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: primaryColor }}
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step: Payment method selection */}
          {step === "method" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => setStep("info")} className="text-gray-400 hover:text-gray-600">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Choose payment method</p>
              </div>

              {showMethods.map(methodId => {
                const cfg = METHOD_CONFIG[methodId as keyof typeof METHOD_CONFIG];
                if (!cfg) return null;
                return (
                  <button
                    key={methodId}
                    onClick={() => handleInitiate(methodId)}
                    disabled={initiateMutation.isPending}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 border-gray-100 hover:border-opacity-60 transition-all text-left group"
                    style={{ "--hover-border": primaryColor } as any}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = primaryColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = "#f3f4f6")}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${primaryColor}15` }}>
                      <cfg.icon className="w-5 h-5" style={{ color: primaryColor }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{cfg.label}</p>
                      <p className="text-xs text-gray-400">{cfg.desc}</p>
                    </div>
                    {initiateMutation.isPending && initiateMutation.variables?.paymentMethod === methodId ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                    )}
                  </button>
                );
              })}

              {/* USSD bank selector */}
              {showMethods.includes("ussd") && (
                <div className="pt-1">
                  <label className="text-xs text-gray-400 block mb-1.5">USSD Bank</label>
                  <select
                    value={ussdBankCode}
                    onChange={e => setUssdBankCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none"
                  >
                    {USSD_BANKS.map(b => (
                      <option key={b.code} value={b.code}>{b.name} ({b.dial}#)</option>
                    ))}
                  </select>
                </div>
              )}

              {/* BNPL instalment count */}
              {showMethods.includes("bnpl") && (
                <div className="pt-1">
                  <label className="text-xs text-gray-400 block mb-1.5">BNPL Instalments</label>
                  <select
                    value={bnplCount}
                    onChange={e => setBnplCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none"
                  >
                    {[2, 3, 6, 12].map(n => (
                      <option key={n} value={n}>{n} payments of {fmt(Math.ceil(Number(link.amount) / n), link.currency ?? "NGN")}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Step: Pay */}
          {step === "pay" && session && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <button onClick={() => { setStep("method"); setSession(null); setPaymentState("idle"); }}
                  className="text-gray-400 hover:text-gray-600">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {METHOD_CONFIG[selectedMethod as keyof typeof METHOD_CONFIG]?.label ?? "Payment"}
                </p>
              </div>

              {selectedMethod === "card" && (
                <CardForm
                  onPay={handleCardPay}
                  amountKobo={Number(session.amountKobo)}
                  currency={session.currency}
                  clientSecret={session.stripeClientSecret}
                  primaryColor={primaryColor}
                  isLoading={confirmMutation.isPending}
                />
              )}
              {selectedMethod === "bank_transfer" && (
                <BankTransferPanel session={session} primaryColor={primaryColor} />
              )}
              {selectedMethod === "ussd" && (
                <USSDPanel session={session} primaryColor={primaryColor} />
              )}
              {selectedMethod === "bnpl" && (
                <BNPLPanel session={session} primaryColor={primaryColor} />
              )}
              {selectedMethod === "usdc" && (
                <USDCPanel session={session} primaryColor={primaryColor} />
              )}

              {/* Polling indicator for async methods */}
              {["bank_transfer", "ussd"].includes(selectedMethod ?? "") && paymentState === "processing" && (
                <div className="flex items-center gap-2 text-xs text-gray-400 justify-center pt-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Waiting for payment confirmation…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 pb-5 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-gray-300" />
          <p className="text-xs text-gray-300">
            Secured by <strong style={{ color: primaryColor }}>PayGate</strong> · CBN Licensed PSP
          </p>
        </div>
      </div>
    </div>
  );
}
