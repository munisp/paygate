/**
 * Make Payment / P2P Send Page (Consumer)
 * Uses real p2p.send tRPC procedure with NIP name enquiry for account verification.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send, Building2, CheckCircle, Loader2, ArrowLeft, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function MakePayment() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankOpen, setBankOpen] = useState(false);
  const [bankSearch, setBankSearch] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [txRef, setTxRef] = useState<string | null>(null);

  const { data: banksData } = trpc.nip.listBanks.useQuery(undefined, { staleTime: 300_000 });
  const banks = banksData?.banks ?? [];
  const filteredBanks = banks.filter(b =>
    b.bankName.toLowerCase().includes(bankSearch.toLowerCase()) ||
    b.bankCode.includes(bankSearch)
  );

  const resolve = trpc.nip.resolveAccount.useMutation({
    onSuccess: (data) => setResolvedName(data.accountName),
    onError: () => setResolvedName(null),
  });

  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      setResolvedName(null);
      const t = setTimeout(() => resolve.mutate({ accountNumber, bankCode }), 600);
      return () => clearTimeout(t);
    } else {
      setResolvedName(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, bankCode]);

  const send = trpc.p2p.send.useMutation({
    onSuccess: (data) => {
      setTxRef(data.reference);
      setStep("success");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!accountNumber || !bankCode || !amount) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!resolvedName) {
      toast.error("Please wait for account verification");
      return;
    }
    if (step === "form") {
      setStep("confirm");
      return;
    }
    send.mutate({
      accountNumber,
      bankCode,
      recipientName: resolvedName,
      amountKobo: Math.round(parseFloat(amount) * 100),
      narration: note || `Transfer to ${resolvedName}`,
    });
  };

  const formatNGN = (kobo: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);

  if (step === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="text-center space-y-4 max-w-sm w-full">
          <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold">Payment Sent!</h2>
          <p className="text-muted-foreground">
            {formatNGN(Math.round(parseFloat(amount) * 100))} sent to <strong>{resolvedName}</strong>
          </p>
          {txRef && (
            <p className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-lg">
              Ref: {txRef}
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => {
              setStep("form"); setAccountNumber(""); setBankCode(""); setAmount(""); setNote(""); setResolvedName(null);
            }}>Send Again</Button>
            <Button className="flex-1" onClick={() => navigate("/consumer")}>Back to Wallet</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-6 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-3 pt-4">
        <Button variant="ghost" size="icon" onClick={() => step === "confirm" ? setStep("form") : navigate("/consumer")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Send Money</h1>
          <p className="text-sm text-muted-foreground">
            {step === "confirm" ? "Confirm transfer details" : "Transfer to any Nigerian bank"}
          </p>
        </div>
      </div>

      {step === "form" ? (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Popover open={bankOpen} onOpenChange={setBankOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {bankName || "Select bank..."}
                  <ChevronDown className="w-4 h-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search bank..."
                    value={bankSearch}
                    onValueChange={setBankSearch}
                  />
                  <CommandList>
                    <CommandEmpty>No bank found.</CommandEmpty>
                    <CommandGroup>
                      {filteredBanks.slice(0, 50).map((b: { bankCode: string; bankName: string }) => (
                        <CommandItem
                          key={b.bankCode}
                          value={b.bankName}
                          onSelect={() => {
                            setBankCode(b.bankCode);
                            setBankName(b.bankName);
                            setBankOpen(false);
                            setBankSearch("");
                          }}
                        >
                          <Building2 className="w-4 h-4 mr-2 opacity-50" />
                          {b.bankName}
                          <span className="ml-auto text-xs text-muted-foreground">{b.bankCode}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input
              placeholder="10-digit NUBAN"
              maxLength={10}
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            />
            {accountNumber.length === 10 && bankCode && (
              <div className="flex items-center gap-2 mt-1">
                {resolve.isPending ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" /><span className="text-xs text-muted-foreground">Verifying...</span></>
                ) : resolvedName ? (
                  <><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs font-medium text-emerald-600">{resolvedName}</span></>
                ) : (
                  <span className="text-xs text-destructive">Account not found</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Amount (NGN)</Label>
            <Input
              type="number"
              placeholder="e.g. 5000"
              min={10}
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
            <div className="flex gap-2 flex-wrap">
              {[500, 1000, 2000, 5000].map(v => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                >
                  {"\u20a6"}{v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input
              placeholder="What's this for?"
              value={note}
              onChange={e => setNote(e.target.value)}
              maxLength={100}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={!accountNumber || !bankCode || !amount || !resolvedName}
          >
            <Send className="w-4 h-4 mr-2" />
            Continue
          </Button>
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Confirm Transfer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{resolvedName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-mono">{accountNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span>{bankName}</span></div>
              <div className="flex justify-between border-t pt-3"><span className="text-muted-foreground">Amount</span><span className="text-lg font-bold">{formatNGN(Math.round(parseFloat(amount) * 100))}</span></div>
              {note && <div className="flex justify-between"><span className="text-muted-foreground">Note</span><span className="text-right max-w-[60%]">{note}</span></div>}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>Edit</Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={send.isPending}
              >
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                Send Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
