/**
 * Make Payment / P2P Send Page (Consumer)
 * Full implementation: NIP name enquiry, saved beneficiaries quick-select,
 * save-beneficiary checkbox, PIN-gated confirmation.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Send, Building2, CheckCircle, Loader2, ArrowLeft, Star, Trash2, User, Pencil, Check, X as XIcon,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function formatNGN(kobo: number) {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
}

function PinDialog({
  open, onClose, onConfirm, isPending,
}: { open: boolean; onClose: () => void; onConfirm: (pin: string) => void; isPending: boolean }) {
  const [pin, setPin] = useState("");
  const handleConfirm = () => {
    if (pin.length !== 4) { toast.error("PIN must be 4 digits"); return; }
    onConfirm(pin);
    setPin("");
  };
  return (
    <Dialog open={open} onOpenChange={(o: any) => { if (!o) { onClose(); setPin(""); } }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Enter Transaction PIN</DialogTitle></DialogHeader>
        <div className="py-4">
          <Input
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            className="text-center text-2xl tracking-widest"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => e.key === "Enter" && handleConfirm()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setPin(""); }} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={pin.length !== 4 || isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const [saveBeneficiary, setSaveBeneficiary] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "pin" | "success">("form");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [txRef, setTxRef] = useState<string | null>(null);
  const [showBeneficiaries, setShowBeneficiaries] = useState(false);

  const utils = trpc.useUtils();
  const { data: banksData } = trpc.nip.listBanks.useQuery(undefined, { staleTime: 300_000 });
  const banks = banksData?.banks ?? [];
  const filteredBanks = banks.filter((b: { bankCode: string; bankName: string }) =>
    b.bankName.toLowerCase().includes(bankSearch.toLowerCase()) ||
    b.bankCode.includes(bankSearch)
  );

  const { data: beneficiaries } = trpc.p2p.savedBeneficiaries.useQuery(undefined, { staleTime: 60_000 });
  const [editingBeneId, setEditingBeneId] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState("");
  const updateBene = trpc.p2p.updateBeneficiary.useMutation({
    onSuccess: () => { utils.p2p.savedBeneficiaries.invalidate(); setEditingBeneId(null); toast.success("Nickname saved"); },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteBene = trpc.p2p.deleteBeneficiary.useMutation({
    onSuccess: () => { utils.p2p.savedBeneficiaries.invalidate(); toast.success("Beneficiary removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const resolve = trpc.nip.resolveAccount.useMutation({
    onSuccess: (data) => setResolvedName(data.accountName),
    onError: () => setResolvedName(null),
  });

  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      setResolvedName(null);
      const t = setTimeout(() => resolve.mutate({ accountNumber, bankCode }), 600);
      return () => clearTimeout(t);
    } else { setResolvedName(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountNumber, bankCode]);

  const send = trpc.p2p.send.useMutation({
    onSuccess: (data) => {
      setTxRef(data.reference);
      setStep("success");
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
      utils.p2p.savedBeneficiaries.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const fillFromBeneficiary = (b: { accountNumber: string; bankCode: string; bankName: string; accountName: string }) => {
    setAccountNumber(b.accountNumber);
    setBankCode(b.bankCode);
    setBankName(b.bankName);
    setResolvedName(b.accountName);
    setShowBeneficiaries(false);
  };

  if (step === "success") {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Transfer Sent!</h2>
          <p className="text-muted-foreground text-sm mt-1">{formatNGN(Math.round(parseFloat(amount) * 100))} sent to {resolvedName}</p>
          {txRef && <p className="text-xs text-muted-foreground mt-1 font-mono">Ref: {txRef}</p>}
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={() => { setStep("form"); setAccountNumber(""); setBankCode(""); setAmount(""); setNote(""); setResolvedName(null); }}>Send Again</Button>
          <Button onClick={() => navigate("/consumer")}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">Send Money</h1>
      </div>

      {(beneficiaries?.length ?? 0) > 0 && step === "form" && (
        <div>
          <button onClick={() => setShowBeneficiaries(!showBeneficiaries)} className="flex items-center gap-2 text-sm text-primary font-medium mb-2">
            <Star className="w-4 h-4" />
            {showBeneficiaries ? "Hide" : "Show"} saved recipients ({beneficiaries!.length})
          </button>
          {showBeneficiaries && (
            <div className="grid gap-2 mb-3">
              {beneficiaries!.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <button className="flex items-center gap-3 flex-1 text-left" onClick={() => fillFromBeneficiary(b)}>
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{b.accountName}</p>
                      <p className="text-xs text-muted-foreground">{b.bankName} · {b.accountNumber}</p>
                    </div>
                  </button>
                  {editingBeneId === b.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={editNickname}
                        onChange={(e: any) => setEditNickname(e.target.value)}
                        placeholder="Nickname"
                        className="text-xs px-2 py-1 rounded border border-border bg-background w-24 outline-none"
                        onKeyDown={(e: any) => {
                          if (e.key === 'Enter') updateBene.mutate({ id: b.id, nickname: editNickname });
                          if (e.key === 'Escape') setEditingBeneId(null);
                        }}
                      />
                      <button onClick={() => updateBene.mutate({ id: b.id, nickname: editNickname })} className="p-1 text-emerald-600 hover:opacity-70"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingBeneId(null)} className="p-1 text-muted-foreground hover:opacity-70"><XIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingBeneId(b.id); setEditNickname(b.nickname ?? b.accountName ?? ''); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary transition-colors">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteBene.mutate({ id: b.id })} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === "form" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Popover open={bankOpen} onOpenChange={setBankOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {bankName || "Select bank"}<Building2 className="w-4 h-4 ml-2 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search banks..." value={bankSearch} onValueChange={setBankSearch} />
                  <CommandList className="max-h-52">
                    <CommandEmpty>No bank found</CommandEmpty>
                    <CommandGroup>
                      {filteredBanks.slice(0, 50).map((b: { bankCode: string; bankName: string }) => (
                        <CommandItem key={b.bankCode} value={b.bankName} onSelect={() => { setBankCode(b.bankCode); setBankName(b.bankName); setBankOpen(false); setBankSearch(""); }}>
                          <Building2 className="w-4 h-4 mr-2 opacity-50" />{b.bankName}
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
            <Input placeholder="10-digit NUBAN" maxLength={10} value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ""))} />
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
            <Input type="number" placeholder="e.g. 5000" min={10} value={amount} onChange={e => setAmount(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              {[500, 1000, 2000, 5000].map(v => (
                <button key={v} onClick={() => setAmount(String(v))} className="text-xs px-2.5 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors">
                  ₦{v.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input placeholder="What's this for?" value={note} onChange={e => setNote(e.target.value)} maxLength={100} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="save-bene" checked={saveBeneficiary} onCheckedChange={(v: any) => setSaveBeneficiary(!!v)} />
            <label htmlFor="save-bene" className="text-sm cursor-pointer select-none">Save recipient for future transfers</label>
          </div>

          <Button
            className="w-full"
            onClick={() => {
              if (!accountNumber || !bankCode || !amount || !resolvedName) {
                toast.error("Please fill all fields and verify account");
                return;
              }
              setStep("confirm");
            }}
            disabled={!accountNumber || !bankCode || !amount || !resolvedName}
          >
            <Send className="w-4 h-4 mr-2" />Continue
          </Button>
        </div>
      )}

      {step === "confirm" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Confirm Transfer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">To</span><span className="font-medium">{resolvedName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Account</span><span className="font-mono">{accountNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bank</span><span>{bankName}</span></div>
              <div className="flex justify-between border-t pt-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-lg font-bold">{formatNGN(Math.round(parseFloat(amount) * 100))}</span>
              </div>
              {note && <div className="flex justify-between"><span className="text-muted-foreground">Note</span><span className="text-right max-w-[60%]">{note}</span></div>}
              {saveBeneficiary && <div className="flex items-center gap-2 text-xs text-primary"><Star className="w-3.5 h-3.5" /><span>Recipient will be saved</span></div>}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep("form")}>Edit</Button>
              <Button className="flex-1" onClick={() => setStep("pin")}><Send className="w-4 h-4 mr-2" />Enter PIN</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <PinDialog
        open={step === "pin"}
        onClose={() => setStep("confirm")}
        onConfirm={(pin) => send.mutate({
          accountNumber,
          bankCode,
          bankName,
          amountKobo: Math.round(parseFloat(amount) * 100),
          recipientName: resolvedName!,
          narration: note || undefined,
          saveBeneficiary,
        })}
        isPending={send.isPending}
      />
    </div>
  );
}
