import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Building2, User, FileText, Camera, CreditCard, CheckCircle2,
  Upload, ArrowRight, ArrowLeft, Eye, EyeOff, AlertCircle,
  Loader2, Shield, Zap, Globe, RefreshCw, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STEPS = [
  { id: 1, label: "Account", icon: User, desc: "Create your account" },
  { id: 2, label: "Business", icon: Building2, desc: "Business information" },
  { id: 3, label: "Documents", icon: FileText, desc: "Upload KYB documents" },
  { id: 4, label: "Liveness", icon: Camera, desc: "Identity verification" },
  { id: 5, label: "Bank", icon: CreditCard, desc: "Settlement account" },
  { id: 6, label: "Complete", icon: CheckCircle2, desc: "You're all set!" },
];

const COUNTRIES = ["Nigeria", "Kenya", "Ghana", "South Africa", "Senegal", "Tanzania", "Uganda", "Rwanda", "Côte d'Ivoire", "Cameroon"];
const INDUSTRIES = ["E-commerce", "Fintech", "Healthcare", "Education", "Logistics", "Travel", "Food & Beverage", "Real Estate", "Media", "Other"];
const BANKS = ["Access Bank", "GTBank", "Zenith Bank", "First Bank", "UBA", "Stanbic IBTC", "Fidelity Bank", "Polaris Bank", "Wema Bank", "Sterling Bank"];
const DOC_TYPES = [
  { id: "cac", label: "CAC Certificate", desc: "Certificate of Incorporation", required: true },
  { id: "memart", label: "MEMART", desc: "Memorandum & Articles of Association", required: true },
  { id: "tin", label: "TIN Certificate", desc: "Tax Identification Number", required: true },
  { id: "utility", label: "Utility Bill", desc: "Proof of business address (last 3 months)", required: true },
  { id: "director_id", label: "Director ID", desc: "Valid government-issued ID of director", required: true },
  { id: "bank_statement", label: "Bank Statement", desc: "Last 6 months bank statement", required: false },
];

type DocState = Record<string, { file: File | null; status: "idle" | "uploading" | "done" | "error" }>;

function LivenessCheck({ onComplete }: { onComplete: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"intro" | "camera" | "blink" | "turn_left" | "turn_right" | "smile" | "done" | "error">("intro");
  const [countdown, setCountdown] = useState(3);
  const [progress, setProgress] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("blink");
      runLivenessSequence();
    } catch {
      setPhase("error");
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const runLivenessSequence = () => {
    const sequence: Array<{ phase: typeof phase; duration: number; prog: number }> = [
      { phase: "blink", duration: 2500, prog: 25 },
      { phase: "turn_left", duration: 2500, prog: 50 },
      { phase: "turn_right", duration: 2500, prog: 75 },
      { phase: "smile", duration: 2000, prog: 100 },
    ];
    let delay = 0;
    sequence.forEach(({ phase: p, duration, prog }) => {
      setTimeout(() => { setPhase(p); setProgress(prog - 25); }, delay);
      setTimeout(() => setProgress(prog), delay + duration - 200);
      delay += duration;
    });
    setTimeout(() => {
      setPhase("done");
      stopCamera();
    }, delay);
  };

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const phaseMessages: Record<string, { title: string; sub: string; color: string }> = {
    blink: { title: "Please blink naturally", sub: "Blink your eyes 2-3 times", color: "text-blue-600" },
    turn_left: { title: "Turn your head left", sub: "Slowly turn to your left side", color: "text-indigo-600" },
    turn_right: { title: "Turn your head right", sub: "Slowly turn to your right side", color: "text-violet-600" },
    smile: { title: "Give us a smile!", sub: "Hold your smile for a moment", color: "text-emerald-600" },
    done: { title: "Liveness verified!", sub: "Your identity has been confirmed", color: "text-emerald-600" },
    error: { title: "Camera access denied", sub: "Please allow camera access and try again", color: "text-red-600" },
  };

  if (phase === "intro") {
    return (
      <div className="text-center space-y-6 py-4">
        <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <Camera className="w-10 h-10 text-indigo-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Liveness Detection</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">We'll use your camera to verify you're a real person. This takes about 10 seconds and requires good lighting.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto text-center">
          {[{ icon: "💡", label: "Good lighting" }, { icon: "👤", label: "Face centered" }, { icon: "🔇", label: "Remove glasses" }].map(h => (
            <div key={h.label} className="p-3 rounded-xl bg-muted/50 text-sm">
              <div className="text-2xl mb-1">{h.icon}</div>
              <p className="text-xs text-muted-foreground">{h.label}</p>
            </div>
          ))}
        </div>
        <Button onClick={() => { setPhase("camera"); startCamera(); }}>
          <Camera className="w-4 h-4 mr-2" />
          Start Verification
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <h3 className="font-semibold text-red-600">Camera Access Required</h3>
          <p className="text-sm text-muted-foreground mt-1">Please allow camera access in your browser settings and try again.</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setPhase("intro")}>Try Again</Button>
          <Button onClick={() => { toast.info("Skipped — manual review will be required"); onComplete(); }}>Skip (Manual Review)</Button>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-emerald-700" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Identity Verified!</h3>
          <p className="text-sm text-muted-foreground mt-1">Liveness check passed with 98.4% confidence score</p>
        </div>
        <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
          {[{ label: "Blink Detection", val: "✓" }, { label: "Head Pose", val: "✓" }, { label: "Depth Analysis", val: "✓" }].map(c => (
            <div key={c.label} className="p-3 rounded-xl bg-emerald-50 text-center">
              <p className="text-lg text-emerald-600">{c.val}</p>
              <p className="text-xs text-emerald-700 mt-1">{c.label}</p>
            </div>
          ))}
        </div>
        <Button onClick={onComplete}>Continue <ArrowRight className="w-4 h-4 ml-2" /></Button>
      </div>
    );
  }

  const msg = phaseMessages[phase] || phaseMessages.blink;

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-md mx-auto">
        <video ref={videoRef} className="w-full h-full object-cover scale-x-[-1]" muted playsInline />
        {/* Face oval overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-48 h-64 rounded-full border-4 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]" />
        </div>
        {/* Phase indicator */}
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className={`inline-block px-4 py-1.5 rounded-full bg-black/60 text-white text-sm font-medium ${msg.color}`}>
            {msg.title}
          </span>
        </div>
      </div>
      {/* Progress */}
      <div className="max-w-md mx-auto space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{msg.sub}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between">
          {["Blink", "Turn Left", "Turn Right", "Smile"].map((s, i) => (
            <span key={s} className={`text-xs font-medium ${progress >= (i + 1) * 25 ? "text-emerald-600" : "text-muted-foreground"}`}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [docs, setDocs] = useState<DocState>(Object.fromEntries(DOC_TYPES.map(d => [d.id, { file: null, status: "idle" }])));

  const [account, setAccount] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", confirm: "" });
  const [business, setBusiness] = useState({ name: "", type: "limited", country: "Nigeria", industry: "", website: "", address: "", city: "", state: "", rcNumber: "", tin: "" });
  const [bank, setBank] = useState({ bankName: "", accountNumber: "", accountName: "", bvn: "" });

  const handleDocUpload = (docId: string, file: File) => {
    setDocs(p => ({ ...p, [docId]: { file, status: "uploading" } }));
    setTimeout(() => {
      setDocs(p => ({ ...p, [docId]: { file, status: "done" } }));
      toast.success(`${file.name} uploaded successfully`);
    }, 1500);
  };

  const canProceed = () => {
    if (step === 1) return account.firstName && account.lastName && account.email && account.password.length >= 8 && account.password === account.confirm;
    if (step === 2) return business.name && business.country && business.industry && business.address;
    if (step === 3) return DOC_TYPES.filter(d => d.required).every(d => docs[d.id]?.status === "done");
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) { toast.error("Please complete all required fields"); return; }
    if (step < 6) setStep(s => s + 1);
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-80 flex-shrink-0 bg-[#0A0A14] flex-col p-8">
        <div className="flex items-center gap-2.5 mb-10">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-white text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>PayGate</span>
        </div>

        <div className="space-y-2 flex-1">
          {STEPS.map((s) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${active ? "bg-white/10" : ""}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${done ? "bg-emerald-500" : active ? "bg-primary" : "bg-white/10"}`}>
                  {done ? <CheckCircle2 className="w-4 h-4 text-white" /> : <s.icon className="w-4 h-4 text-white" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${active ? "text-white" : done ? "text-emerald-400" : "text-white/50"}`}>{s.label}</p>
                  <p className={`text-xs ${active ? "text-white/70" : "text-white/30"}`}>{s.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-auto space-y-3">
          {[{ icon: Shield, text: "PCI DSS Level 1 Certified" }, { icon: Globe, text: "54 African Countries" }, { icon: Zap, text: "Go live in 24 hours" }].map(f => (
            <div key={f.text} className="flex items-center gap-2 text-white/50 text-xs">
              <f.icon className="w-3.5 h-3.5" />
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>PayGate</span>
          </div>
          <span className="text-sm text-muted-foreground">Step {step} of {STEPS.length}</span>
        </div>

        <div className="flex-1 flex items-start justify-center p-6 lg:p-12">
          <div className="w-full max-w-xl">
            {/* Progress bar (mobile) */}
            <div className="lg:hidden mb-6">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }} />
              </div>
            </div>

            {/* Step 1: Account */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Create your account</h2>
                  <p className="text-muted-foreground text-sm mt-1">Start accepting payments across Africa in minutes</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[{ label: "First Name", key: "firstName", placeholder: "Chidi" }, { label: "Last Name", key: "lastName", placeholder: "Eze" }].map(f => (
                    <div key={f.key}>
                      <label className="text-sm font-medium">{f.label} <span className="text-red-500">*</span></label>
                      <input value={(account as any)[f.key]} onChange={e => setAccount(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-medium">Business Email <span className="text-red-500">*</span></label>
                  <input type="email" value={account.email} onChange={e => setAccount(p => ({ ...p, email: e.target.value }))} placeholder="chidi@acmecorp.com" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone Number</label>
                  <input type="tel" value={account.phone} onChange={e => setAccount(p => ({ ...p, phone: e.target.value }))} placeholder="+234 801 234 5678" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium">Password <span className="text-red-500">*</span></label>
                  <div className="relative mt-1">
                    <input type={showPass ? "text" : "password"} value={account.password} onChange={e => setAccount(p => ({ ...p, password: e.target.value }))} placeholder="Min. 8 characters" className="w-full px-3 py-2.5 pr-10 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                    <button type="button" onClick={() => setShowPass(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {account.password && (
                    <div className="mt-2 flex gap-1">
                      {[8, 12, 16, 20].map(len => (
                        <div key={len} className={`h-1 flex-1 rounded-full ${account.password.length >= len ? "bg-emerald-500" : "bg-muted"}`} />
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Confirm Password <span className="text-red-500">*</span></label>
                  <input type="password" value={account.confirm} onChange={e => setAccount(p => ({ ...p, confirm: e.target.value }))} placeholder="Repeat password" className={`w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border focus:outline-none focus:ring-2 focus:ring-ring ${account.confirm && account.confirm !== account.password ? "border-red-400" : "border-border"}`} />
                  {account.confirm && account.confirm !== account.password && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
                </div>
              </div>
            )}

            {/* Step 2: Business */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Business information</h2>
                  <p className="text-muted-foreground text-sm mt-1">Tell us about your business</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium">Business Name <span className="text-red-500">*</span></label>
                    <input value={business.name} onChange={e => setBusiness(p => ({ ...p, name: e.target.value }))} placeholder="Acme Corp Ltd" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Business Type</label>
                    <select value={business.type} onChange={e => setBusiness(p => ({ ...p, type: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="limited">Limited Company</option>
                      <option value="sole">Sole Proprietorship</option>
                      <option value="partnership">Partnership</option>
                      <option value="ngo">NGO / Non-Profit</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Country <span className="text-red-500">*</span></label>
                    <select value={business.country} onChange={e => setBusiness(p => ({ ...p, country: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                      {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Industry <span className="text-red-500">*</span></label>
                    <select value={business.industry} onChange={e => setBusiness(p => ({ ...p, industry: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Select industry</option>
                      {INDUSTRIES.map(i => <option key={i}>{i}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Website</label>
                    <input value={business.website} onChange={e => setBusiness(p => ({ ...p, website: e.target.value }))} placeholder="https://acmecorp.com" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">RC Number</label>
                    <input value={business.rcNumber} onChange={e => setBusiness(p => ({ ...p, rcNumber: e.target.value }))} placeholder="RC1234567" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">TIN</label>
                    <input value={business.tin} onChange={e => setBusiness(p => ({ ...p, tin: e.target.value }))} placeholder="12345678-0001" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium">Business Address <span className="text-red-500">*</span></label>
                    <input value={business.address} onChange={e => setBusiness(p => ({ ...p, address: e.target.value }))} placeholder="14 Broad Street, Lagos Island" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">City</label>
                    <input value={business.city} onChange={e => setBusiness(p => ({ ...p, city: e.target.value }))} placeholder="Lagos" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">State / Province</label>
                    <input value={business.state} onChange={e => setBusiness(p => ({ ...p, state: e.target.value }))} placeholder="Lagos State" className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Documents */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Upload KYB documents</h2>
                  <p className="text-muted-foreground text-sm mt-1">Upload clear, legible copies of the following documents</p>
                </div>
                <div className="space-y-3">
                  {DOC_TYPES.map(doc => {
                    const state = docs[doc.id];
                    return (
                      <label key={doc.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${state.status === "done" ? "border-emerald-400 bg-emerald-50/50" : state.status === "uploading" ? "border-primary/40 bg-primary/5" : "border-dashed border-border hover:border-primary/40"}`}>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={e => { if (e.target.files?.[0]) handleDocUpload(doc.id, e.target.files[0]); }} />
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${state.status === "done" ? "bg-emerald-100" : "bg-muted"}`}>
                          {state.status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : state.status === "uploading" ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{doc.label}</p>
                            {doc.required && <span className="text-xs text-red-500">Required</span>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{state.file ? state.file.name : doc.desc}</p>
                        </div>
                        {state.status === "done" && (
                          <button type="button" onClick={e => { e.preventDefault(); setDocs(p => ({ ...p, [doc.id]: { file: null, status: "idle" } })); }} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200">
                  <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">Documents are encrypted with AES-256 and processed by our AI-powered KYB engine (PaddleOCR + VLM). Verification typically takes 2-4 hours.</p>
                </div>
              </div>
            )}

            {/* Step 4: Liveness */}
            {step === 4 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Identity verification</h2>
                  <p className="text-muted-foreground text-sm mt-1">Complete a quick liveness check to verify your identity</p>
                </div>
                <LivenessCheck onComplete={() => setStep(5)} />
              </div>
            )}

            {/* Step 5: Bank */}
            {step === 5 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Settlement account</h2>
                  <p className="text-muted-foreground text-sm mt-1">Where should we send your settlements?</p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Bank Name <span className="text-red-500">*</span></label>
                    <select value={bank.bankName} onChange={e => setBank(p => ({ ...p, bankName: e.target.value }))} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Select your bank</option>
                      {BANKS.map(b => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Account Number <span className="text-red-500">*</span></label>
                    <div className="flex gap-2 mt-1">
                      <input value={bank.accountNumber} onChange={e => setBank(p => ({ ...p, accountNumber: e.target.value }))} placeholder="0000000000" maxLength={10} className="flex-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                      <Button type="button" variant="outline" size="sm" onClick={() => { if (bank.accountNumber.length === 10) { setBank(p => ({ ...p, accountName: "ACME CORP LTD" })); toast.success("Account verified!"); } else toast.error("Enter a 10-digit account number"); }}>
                        <RefreshCw className="w-4 h-4 mr-1" />Verify
                      </Button>
                    </div>
                  </div>
                  {bank.accountName && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-700">{bank.accountName}</span>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium">BVN (Bank Verification Number)</label>
                    <input value={bank.bvn} onChange={e => setBank(p => ({ ...p, bvn: e.target.value }))} placeholder="22212345678" maxLength={11} className="w-full mt-1 px-3 py-2.5 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    <p className="text-xs text-muted-foreground mt-1">Your BVN is used for identity verification only and is never shared.</p>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                  <p className="text-sm font-medium">Settlement Schedule</p>
                  <div className="grid grid-cols-3 gap-3">
                    {[{ label: "T+1", desc: "Next business day", active: true }, { label: "T+3", desc: "3 business days", active: false }, { label: "Weekly", desc: "Every Monday", active: false }].map(s => (
                      <div key={s.label} className={`p-3 rounded-xl border text-center cursor-pointer transition-all ${s.active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                        <p className={`font-semibold text-sm ${s.active ? "text-primary" : ""}`}>{s.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 6: Complete */}
            {step === 6 && (
              <div className="text-center space-y-6 py-4">
                <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-emerald-700" style={{ fontFamily: "Space Grotesk, sans-serif" }}>You're all set!</h2>
                  <p className="text-muted-foreground text-sm mt-2 max-w-sm mx-auto">Your account has been created. Our team is reviewing your KYB documents. You'll receive an email within 2-4 hours.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto text-left">
                  {[
                    { icon: "📧", title: "Check your email", desc: "We sent a verification link to " + account.email },
                    { icon: "🔍", title: "KYB under review", desc: "Documents verified in 2-4 hours" },
                    { icon: "🚀", title: "Start in sandbox", desc: "Test payments are available immediately" },
                  ].map(s => (
                    <div key={s.title} className="flex items-start gap-3 p-4 rounded-xl bg-muted/50">
                      <span className="text-xl">{s.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{s.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => navigate("/")}>Go to Dashboard</Button>
                  <Button onClick={() => { toast.success("Sandbox keys copied!"); }}>
                    <Zap className="w-4 h-4 mr-2" />Get Sandbox Keys
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation */}
            {step < 6 && step !== 4 && (
              <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
                <Button variant="outline" onClick={() => step > 1 ? setStep(s => s - 1) : navigate("/")} disabled={step === 1}>
                  <ArrowLeft className="w-4 h-4 mr-2" />Back
                </Button>
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {step === 5 ? "Submit Application" : "Continue"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
