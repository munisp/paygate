/**
 * Consumer App Onboarding
 * 3-step flow: Phone Verification → PIN Setup → Selfie KYC
 * Gates access to the wallet and send screens.
 */
import { useState, useRef, type ChangeEvent } from "react";
import { Phone, KeyRound, Camera, CheckCircle2, ChevronRight, ArrowLeft, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type Step = "phone" | "otp" | "pin" | "kyc" | "done";

const STEPS = [
  { key: "phone", label: "Phone", icon: Phone },
  { key: "pin", label: "PIN", icon: KeyRound },
  { key: "kyc", label: "KYC", icon: Camera },
] as const;

function StepIndicator({ current }: { current: Step }) {
  const stepIndex = current === "otp" ? 0 : current === "pin" ? 1 : current === "kyc" ? 2 : current === "done" ? 3 : 0;
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {STEPS.map((s: any, i: any) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={s.key} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              done ? "bg-green-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {done ? <CheckCircle2 className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-0.5 ${i < stepIndex ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ConsumerOnboarding() {
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", ""]);
  const [pinConfirmed, setPinConfirmed] = useState(false);
  const [kycPhoto, setKycPhoto] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<"idle" | "capturing" | "reviewing" | "approved">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Real tRPC mutations
  const sendOtpMutation = trpc.consumerOtp.send.useMutation();
  const verifyOtpMutation = trpc.consumerOtp.verify.useMutation();
  const setPinMutation = trpc.consumerPin.set.useMutation();
  const submitKycMutation = trpc.consumerKyc.submit.useMutation();
  const loading = sendOtpMutation.isPending || verifyOtpMutation.isPending || setPinMutation.isPending || submitKycMutation.isPending;

  // ── Phone Step ─────────────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    const cleaned = phone.replace(/\s+/g, "").replace(/^0/, "+234");
    if (!/^\+\d{10,15}$/.test(cleaned)) {
      toast.error("Enter a valid phone number (e.g. +234 801 234 5678)");
      return;
    }
    try {
      await sendOtpMutation.mutateAsync({ phone: cleaned });
      toast.success("OTP sent to " + cleaned);
      setPhone(cleaned);
      setStep("otp");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send OTP");
    }
  };

  // ── OTP Step ───────────────────────────────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleVerifyOTP = async () => {
    const code = otp.join("");
    if (code.length < 6) { toast.error("Enter the 6-digit OTP"); return; }
    try {
      await verifyOtpMutation.mutateAsync({ phone, otp: code });
      toast.success("Phone verified!");
      setStep("pin");
    } catch (e: any) {
      toast.error(e.message ?? "Invalid or expired OTP");
    }
  };

  // ── PIN Step ───────────────────────────────────────────────────────────────
  const handlePinChange = (i: number, val: string, isConfirm = false) => {
    if (!/^\d?$/.test(val)) return;
    const arr = isConfirm ? [...confirmPin] : [...pin];
    arr[i] = val;
    isConfirm ? setConfirmPin(arr) : setPin(arr);
    const refs = isConfirm ? confirmPinRefs : pinRefs;
    if (val && i < 5) refs.current[i + 1]?.focus();
  };
  const handleSetPin = async () => {
    const p = pin.join("");
    const c = confirmPin.join("");
    if (p.length < 4) { toast.error("Enter at least a 4-digit PIN"); return; }
    if (p !== c) { toast.error("PINs do not match"); return; }
    try {
      await setPinMutation.mutateAsync({ pin: p });
      setPinConfirmed(true);
      toast.success("PIN set successfully");
      setStep("kyc");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to set PIN");
    }
  };

  // ── KYC Step ───────────────────────────────────────────────────────────────
  const handlePhotoCapture = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setKycPhoto(ev.target?.result as string);
      setKycStatus("reviewing");
    };
    reader.readAsDataURL(file);
  };
  const handleSubmitKYC = async () => {
    if (!kycPhoto) { toast.error("Please capture a selfie first"); return; }
    setKycStatus("reviewing");
    try {
      // KYC page collects full details - this is the onboarding quick selfie
      // Full KYC with BVN/NIN is on the dedicated /consumer/kyc page
      await submitKycMutation.mutateAsync({
        firstName: "User",
        lastName: "Account",
        selfieUrl: kycPhoto,
      });
      setKycStatus("approved");
      toast.success("KYC submitted for review");
      setStep("done");
    } catch (e: any) {
      setKycStatus("idle");
      toast.error(e.message ?? "KYC submission failed");
    }
  };
  const handleSkipKYC = () => {
    toast.info("KYC skipped — some features may be limited");
    setStep("done");
  };

  // ── Done Step ──────────────────────────────────────────────────────────────
  const handleFinish = () => {
    localStorage.setItem("consumer_onboarded", "true");
    navigate("/consumer");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3 shadow-lg">
            <Shield className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            PayGate Pay
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Set up your secure wallet</p>
        </div>

        {step !== "done" && <StepIndicator current={step} />}

        {/* ── Phone ─────────────────────────────────────────────────────── */}
        {step === "phone" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Enter your phone number</h2>
              <p className="text-sm text-muted-foreground mt-1">We'll send you a verification code</p>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">+234</span>
              <input
                type="tel"
                value={phone}
                onChange={(e: any) => setPhone(e.target.value)}
                placeholder="8012345678"
                className="w-full pl-14 pr-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-lg tracking-wider"
              />
            </div>
            <Button className="w-full h-12 text-base gap-2" onClick={handleSendOTP} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Send OTP
            </Button>
          </div>
        )}

        {/* ── OTP ───────────────────────────────────────────────────────── */}
        {step === "otp" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Verify your number</h2>
              <p className="text-sm text-muted-foreground mt-1">Enter the 6-digit code sent to {phone}</p>
            </div>
            <div className="flex gap-2 justify-center">
              {otp.map((d: any, i: any) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e: any) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e: any) => { if (e.key === "Backspace" && !d && i > 0) otpRefs.current[i - 1]?.focus(); }}
                  className="w-11 h-14 text-center text-xl font-bold rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              ))}
            </div>
            <Button className="w-full h-12 text-base gap-2" onClick={handleVerifyOTP} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Verify OTP
            </Button>
            <button onClick={() => setStep("phone")} className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Change number
            </button>
          </div>
        )}

        {/* ── PIN ───────────────────────────────────────────────────────── */}
        {step === "pin" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-foreground">Create your 6-digit PIN</h2>
              <p className="text-sm text-muted-foreground mt-1">This PIN secures your wallet transactions</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Enter PIN</p>
              <div className="flex gap-2 justify-center">
                {pin.map((d: any, i: any) => (
                  <input
                    key={i}
                    ref={(el) => { pinRefs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e: any) => handlePinChange(i, e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === "Backspace" && !d && i > 0) pinRefs.current[i - 1]?.focus(); }}
                    className="w-11 h-14 text-center text-2xl font-bold rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Confirm PIN</p>
              <div className="flex gap-2 justify-center">
                {confirmPin.map((d: any, i: any) => (
                  <input
                    key={i}
                    ref={(el) => { confirmPinRefs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e: any) => handlePinChange(i, e.target.value, true)}
                    onKeyDown={(e: any) => { if (e.key === "Backspace" && !d && i > 0) confirmPinRefs.current[i - 1]?.focus(); }}
                    className="w-11 h-14 text-center text-2xl font-bold rounded-xl border border-border bg-muted/30 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ))}
              </div>
            </div>
            <Button className="w-full h-12 text-base gap-2" onClick={handleSetPin} disabled={loading || pinConfirmed}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : pinConfirmed ? <CheckCircle2 className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
              {pinConfirmed ? "PIN Set!" : "Set PIN"}
            </Button>
          </div>
        )}

        {/* ── KYC ───────────────────────────────────────────────────────── */}
        {step === "kyc" && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Verify your identity</h2>
              <p className="text-sm text-muted-foreground mt-1">Take a selfie to unlock full wallet features</p>
            </div>

            {/* Selfie Preview */}
            <div
              className="relative w-full aspect-square rounded-2xl border-2 border-dashed border-border bg-muted/20 flex items-center justify-center overflow-hidden cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              {kycPhoto ? (
                <>
                  <img src={kycPhoto} alt="Selfie" className="w-full h-full object-cover" />
                  {kycStatus === "approved" && (
                    <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-white" />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-6">
                  <Camera className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Tap to take a selfie</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Make sure your face is clearly visible</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handlePhotoCapture} />

            {/* Tips */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
              {["Good lighting on your face", "Remove glasses if possible", "Look directly at the camera"].map((tip) => (
                <div key={tip} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {tip}
                </div>
              ))}
            </div>

            <Button
              className="w-full h-12 text-base gap-2"
              onClick={handleSubmitKYC}
              disabled={loading || !kycPhoto || kycStatus === "approved"}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {kycStatus === "approved" ? "Verified!" : "Submit for Verification"}
            </Button>
            <button onClick={handleSkipKYC} className="w-full text-sm text-muted-foreground hover:text-foreground text-center">
              Skip for now (limited features)
            </button>
          </div>
        )}

        {/* ── Done ──────────────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-500/15 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">You're all set!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Your PayGate wallet is ready. Send money, pay bills, and receive payments instantly.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: "💸", label: "Send Money" },
                { icon: "📱", label: "Pay Bills" },
                { icon: "🔒", label: "Secure PIN" },
              ].map((f: any) => (
                <div key={f.label} className="bg-muted/30 rounded-xl p-3 text-center">
                  <div className="text-2xl mb-1">{f.icon}</div>
                  <p className="text-xs font-medium text-muted-foreground">{f.label}</p>
                </div>
              ))}
            </div>
            <Button className="w-full h-12 text-base gap-2" onClick={handleFinish}>
              Open My Wallet
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
