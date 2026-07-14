// @ts-nocheck
/**
 * HostedPayment.tsx
 * =================
 * Public-facing hosted payment page for PayGate payment links.
 *
 * Features:
 *   - Searchable bank dropdown (all CBN-licensed banks from nip_banks table)
 *   - Real-time NIP name enquiry (account holder name lookup)
 *   - Virtual account display (for bank transfer payments)
 *   - Payment status polling
 *
 * Route: /pay/:linkId  (public, no auth required)
 *
 * This page is intentionally minimal and fast-loading — it is the
 * customer-facing checkout experience.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  CheckCircle2,
  ChevronsUpDown,
  Copy,
  Loader2,
  AlertCircle,
  Building2,
  User,
  CreditCard,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type PaymentStep = "bank_select" | "name_enquiry" | "virtual_account" | "confirmed";

interface BankOption {
  id: string;
  bankCode: string;
  bankName: string;
  shortName: string | null;
  nipCode: string | null;
  category: string | null;
  supportsNip: number;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HostedPayment() {
  const { linkId } = useParams<{ linkId: string }>();

  // Step state
  const [step, setStep] = useState<PaymentStep>("bank_select");

  // Bank selection
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBank, setSelectedBank] = useState<BankOption | null>(null);

  // Account number
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [nameEnquiryLoading, setNameEnquiryLoading] = useState(false);
  const [nameEnquiryError, setNameEnquiryError] = useState("");

  // Virtual account
  const [virtualAccount, setVirtualAccount] = useState<{
    accountNumber: string;
    bankName: string;
    accountName: string;
    expiresAt?: number;
  } | null>(null);

  const accountInputRef = useRef<HTMLInputElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const { data: banksData, isLoading: banksLoading } = trpc.nipBanks.list.useQuery(
    { activeOnly: true },
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: paymentLink, isLoading: linkLoading } = trpc.paymentLinks.getPublic.useQuery(
    { linkId: linkId || "" },
    { enabled: !!linkId, retry: false }
  );

  const nameEnquiryMutation = trpc.nipBanks.nameEnquiry.useMutation();
  const generateVirtualAccountMutation = trpc.nipBanks.generateVirtualAccount.useMutation();

  // ── Filtered banks ───────────────────────────────────────────────────────────

  const banks: BankOption[] = (banksData || []).filter(b => b.supportsNip);

  const filteredBanks = bankSearch.trim()
    ? banks.filter(b =>
        b.bankName.toLowerCase().includes(bankSearch.toLowerCase()) ||
        b.shortName?.toLowerCase().includes(bankSearch.toLowerCase()) ||
        b.bankCode.includes(bankSearch)
      )
    : banks;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleBankSelect = useCallback((bank: BankOption) => {
    setSelectedBank(bank);
    setBankOpen(false);
    setAccountNumber("");
    setAccountName("");
    setNameEnquiryError("");
    setTimeout(() => accountInputRef.current?.focus(), 100);
  }, []);

  const handleNameEnquiry = useCallback(async () => {
    if (!selectedBank || accountNumber.length !== 10) return;
    setNameEnquiryLoading(true);
    setNameEnquiryError("");
    setAccountName("");
    try {
      const result = await nameEnquiryMutation.mutateAsync({
        bankNipCode: selectedBank.nipCode ?? selectedBank.bankCode,
        accountNumber,
      });
      if (result.accountName) {
        setAccountName(result.accountName);
        setStep("name_enquiry");
      } else {
        setNameEnquiryError("Account not found. Please check the account number.");
      }
    } catch (err: any) {
      setNameEnquiryError(err.message || "Name enquiry failed. Please try again.");
    } finally {
      setNameEnquiryLoading(false);
    }
  }, [selectedBank, accountNumber, nameEnquiryMutation]);

  const handleGenerateVirtualAccount = useCallback(async () => {
    if (!paymentLink || !selectedBank || !accountNumber) return;
    try {
      const result = await generateVirtualAccountMutation.mutateAsync({
        reference: `PG-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        bankNipCode: selectedBank.nipCode ?? selectedBank.bankCode,
        accountName: accountName,
        amountExpected: paymentLink?.amountMinor ?? undefined,
        expiryMinutes: 30,
        paymentLinkId: linkId || undefined,
      });
      setVirtualAccount({
        accountNumber: result.accountNumber,
        bankName: result.bankName,
        accountName: result.accountName,
        expiresAt: typeof result.expiresAt === 'string' ? new Date(result.expiresAt).getTime() : result.expiresAt instanceof Date ? result.expiresAt.getTime() : result.expiresAt,
      });
      setStep("virtual_account");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate virtual account");
    }
  }, [paymentLink, selectedBank, accountNumber, linkId, generateVirtualAccountMutation]);

  const handleCopy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard`);
    });
  }, []);

  // Auto-trigger name enquiry when 10 digits entered
  useEffect(() => {
    if (accountNumber.length === 10 && selectedBank) {
      handleNameEnquiry();
    }
  }, [accountNumber, selectedBank]);

  // ── Render helpers ────────────────────────────────────────────────────────────

  const formatAmount = (amountMinor: number, currency = "NGN") => {
    const symbol = currency === "NGN" ? "₦" : currency === "USD" ? "$" : currency;
    return `${symbol}${(amountMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  };

  const formatExpiry = (ms?: number) => {
    if (!ms) return null;
    const diff = ms - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}h ${mins % 60}m remaining`;
    return `${mins}m remaining`;
  };

  // ── Loading / Error states ────────────────────────────────────────────────────

  if (linkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!paymentLink && !linkLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Payment Link Not Found</h2>
            <p className="text-slate-500 text-sm">
              This payment link may have expired or been deactivated.
              Please contact the merchant for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex flex-col items-center justify-center p-4">

      {/* Header */}
      <div className="w-full max-w-md mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-sm border border-slate-200 mb-4">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium text-slate-600">Secured by PayGate</span>
        </div>
        {paymentLink && (
          <>
            <h1 className="text-2xl font-bold text-slate-800 mb-1">
              {paymentLink.title || "Complete Payment"}
            </h1>
            {paymentLink.description && (
              <p className="text-slate-500 text-sm">{paymentLink.description}</p>
            )}
          </>
        )}
      </div>

      {/* Amount card */}
      {paymentLink?.amountMinor && (
        <Card className="w-full max-w-md mb-4 border-0 shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-blue-200 text-sm mb-1">Amount to Pay</p>
            <p className="text-4xl font-bold tracking-tight">
              {formatAmount(paymentLink.amountMinor, paymentLink.currency)}
            </p>
            {paymentLink.merchantName && (
              <p className="text-blue-200 text-sm mt-2">to {paymentLink.merchantName}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main card */}
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
            {step === "bank_select" && <><Building2 className="h-4 w-4" /> Select Your Bank</>}
            {step === "name_enquiry" && <><User className="h-4 w-4" /> Confirm Account</>}
            {step === "virtual_account" && <><CreditCard className="h-4 w-4" /> Make Transfer</>}
            {step === "confirmed" && <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Payment Confirmed</>}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">

          {/* Step 1 & 2: Bank + Account */}
          {(step === "bank_select" || step === "name_enquiry") && (
            <>
              {/* Bank dropdown */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  Your Bank
                </label>
                <Popover open={bankOpen} onOpenChange={setBankOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={bankOpen}
                      className="w-full justify-between h-11 font-normal"
                    >
                      {selectedBank ? (
                        <span className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          {selectedBank.bankName}
                        </span>
                      ) : (
                        <span className="text-slate-400">Search for your bank...</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput
                        placeholder="Search banks..."
                        value={bankSearch}
                        onValueChange={setBankSearch}
                      />
                      <CommandList className="max-h-60">
                        {banksLoading && (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          </div>
                        )}
                        <CommandEmpty>No bank found.</CommandEmpty>
                        <CommandGroup>
                          {filteredBanks.map(bank => (
                            <CommandItem
                              key={bank.bankCode}
                              value={`${bank.bankName} ${bank.bankCode}`}
                              onSelect={() => handleBankSelect(bank)}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center gap-2 w-full">
                                <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="flex-1 text-sm">{bank.bankName}</span>
                                <Badge variant="secondary" className="text-xs font-mono shrink-0">
                                  {bank.bankCode}
                                </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Account number */}
              {selectedBank && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                    Account Number
                  </label>
                  <div className="relative">
                    <Input
                      ref={accountInputRef}
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      placeholder="10-digit account number"
                      value={accountNumber}
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setAccountNumber(val);
                        if (val.length < 10) {
                          setAccountName("");
                          setNameEnquiryError("");
                          setStep("bank_select");
                        }
                      }}
                      className="h-11 font-mono text-base pr-10"
                    />
                    {nameEnquiryLoading && (
                      <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-slate-400" />
                    )}
                    {accountName && !nameEnquiryLoading && (
                      <CheckCircle2 className="absolute right-3 top-3 h-5 w-5 text-emerald-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {accountNumber.length}/10 digits
                  </p>
                </div>
              )}

              {/* Name enquiry result */}
              {accountName && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">Account Verified</p>
                    <p className="text-sm font-semibold text-emerald-800">{accountName}</p>
                    <p className="text-xs text-emerald-600">{selectedBank?.bankName}</p>
                  </div>
                </div>
              )}

              {/* Name enquiry error */}
              {nameEnquiryError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-sm text-red-600">{nameEnquiryError}</p>
                </div>
              )}

              {/* Proceed button */}
              {accountName && step === "name_enquiry" && (
                <Button
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleGenerateVirtualAccount}
                  disabled={generateVirtualAccountMutation.isPending}
                >
                  {generateVirtualAccountMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</>
                  ) : (
                    "Proceed to Payment"
                  )}
                </Button>
              )}
            </>
          )}

          {/* Step 3: Virtual Account */}
          {step === "virtual_account" && virtualAccount && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Transfer to this account
                </p>

                {/* Bank name */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Bank</span>
                  <span className="text-sm font-semibold text-slate-800">{virtualAccount.bankName}</span>
                </div>

                <Separator />

                {/* Account number */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Account Number</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold font-mono text-slate-800 tracking-wider">
                      {virtualAccount.accountNumber}
                    </span>
                    <button
                      onClick={() => handleCopy(virtualAccount.accountNumber, "Account number")}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <Separator />

                {/* Account name */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Account Name</span>
                  <span className="text-sm font-semibold text-slate-800">{virtualAccount.accountName}</span>
                </div>

                {/* Amount */}
                {paymentLink?.amountMinor && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Amount</span>
                      <span className="text-sm font-bold text-blue-700">
                        {formatAmount(paymentLink.amountMinor, paymentLink.currency)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Expiry */}
              {virtualAccount.expiresAt && (
                <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3">
                  <Clock className="h-4 w-4 shrink-0" />
                  <p className="text-xs font-medium">
                    This account expires in {formatExpiry(virtualAccount.expiresAt)}.
                    Transfer the exact amount shown above.
                  </p>
                </div>
              )}

              {/* Instructions */}
              <div className="text-xs text-slate-500 space-y-1">
                <p className="font-medium text-slate-600">How to complete payment:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>Open your banking app or USSD</li>
                  <li>Transfer the exact amount to the account above</li>
                  <li>Use your name as the narration</li>
                  <li>Payment is confirmed automatically within 30 seconds</li>
                </ol>
              </div>

              {/* Waiting indicator */}
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <p className="text-xs">Waiting for your transfer...</p>
              </div>
            </div>
          )}

          {/* Step 4: Confirmed */}
          {step === "confirmed" && (
            <div className="text-center py-6 space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Payment Received!</h3>
              <p className="text-slate-500 text-sm">
                Your payment has been confirmed. A receipt has been sent to your email.
              </p>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Footer */}
      <p className="mt-6 text-xs text-slate-400 text-center">
        Payments are processed securely via NIBSS NIP instant payment.
        <br />
        Your data is encrypted and never stored.
      </p>
    </div>
  );
}
