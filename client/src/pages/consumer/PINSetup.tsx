/**
 * PIN Setup (Consumer) - Wave 68
 * Set or change the 4-digit transaction PIN.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Lock, CheckCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";

function PinInput({ value, onChange, placeholder, show, onToggleShow }: {
  value: string; onChange: (v: string) => void; placeholder?: string; show: boolean; onToggleShow: () => void;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        placeholder={placeholder ?? "••••"}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        className="text-center text-2xl tracking-[0.5em] pr-10"
      />
      <button type="button" onClick={onToggleShow} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function PINSetup() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const utils = trpc.useUtils();
  const { data: pinStatus } = trpc.consumerPin.isSet.useQuery(undefined, { staleTime: 60_000 });
  const isSet = (pinStatus as any)?.isSet ?? false;

  const setOrChange = trpc.consumerPin.set.useMutation({
    onSuccess: () => {
      toast.success(isSet ? "PIN changed successfully!" : "PIN set successfully!");
      setDone(true);
      setPin("");
      setConfirmPin("");
      utils.consumerPin.isSet.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (pin.length !== 4) { toast.error("PIN must be exactly 4 digits"); return; }
    if (pin !== confirmPin) { toast.error("PINs do not match"); return; }
    setOrChange.mutate({ pin });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">{isSet ? "Change PIN" : "Set Transaction PIN"}</h1>
      </div>

      {done ? (
        <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
          <CardContent className="pt-6 pb-6 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">
              {isSet ? "PIN Changed!" : "PIN Set!"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">Your transaction PIN is now active.</p>
            <Button className="mt-4" onClick={() => navigate("/consumer")}>Back to Wallet</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-5 h-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                {isSet
                  ? "Enter a new 4-digit PIN to replace your current one."
                  : "Set a 4-digit PIN to secure your transfers and bill payments."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>New PIN</Label>
              <PinInput value={pin} onChange={setPin} show={showPin} onToggleShow={() => setShowPin(s => !s)} />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm PIN</Label>
              <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="••••" show={showConfirm} onToggleShow={() => setShowConfirm(s => !s)} />
            </div>
            {pin.length === 4 && confirmPin.length === 4 && pin !== confirmPin && (
              <p className="text-xs text-destructive">PINs do not match</p>
            )}
            <Button className="w-full" onClick={handleSubmit}
              disabled={pin.length !== 4 || confirmPin.length !== 4 || pin !== confirmPin || setOrChange.isPending}>
              {setOrChange.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
              {isSet ? "Change PIN" : "Set PIN"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Your PIN is hashed and never stored in plain text.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
