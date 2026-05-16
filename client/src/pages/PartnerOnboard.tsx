import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle, ArrowRight, ArrowLeft, Building2, Palette, DollarSign, Eye, Key } from "lucide-react";

const STEPS = [
  { id: 1, label: "Invite Code", icon: Key },
  { id: 2, label: "Company", icon: Building2 },
  { id: 3, label: "Branding", icon: Palette },
  { id: 4, label: "Fees & Corridors", icon: DollarSign },
  { id: 5, label: "Review & Launch", icon: Eye },
];

const CORRIDORS = [
  { src: "NGN", dst: "USD", label: "NGN → USD" },
  { src: "NGN", dst: "GBP", label: "NGN → GBP" },
  { src: "NGN", dst: "EUR", label: "NGN → EUR" },
  { src: "NGN", dst: "CAD", label: "NGN → CAD" },
  { src: "USD", dst: "NGN", label: "USD → NGN" },
  { src: "GBP", dst: "NGN", label: "GBP → NGN" },
  { src: "EUR", dst: "NGN", label: "EUR → NGN" },
  { src: "NGN", dst: "GHS", label: "NGN → GHS" },
  { src: "NGN", dst: "KES", label: "NGN → KES" },
  { src: "NGN", dst: "ZAR", label: "NGN → ZAR" },
];

const FONTS = ["Inter", "Poppins", "Roboto", "Lato", "Nunito", "Montserrat", "Open Sans"];

export default function PartnerOnboard() {
  const isLoading = false; // Data loaded synchronously

  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plan, setPlan] = useState("starter");
  const [completedTenantId, setCompletedTenantId] = useState<string | null>(null);

  // Step 1
  const [inviteCode, setInviteCode] = useState("");

  // Step 2
  const [company, setCompany] = useState({
    companyName: "", companyEmail: "", companyPhone: "",
    companyCountry: "NG", companyWebsite: "", businessType: "fintech", rcNumber: "",
  });

  // Step 3
  const [branding, setBranding] = useState({
    primaryColor: "#6366f1", accentColor: "#8b5cf6",
    logoUrl: "", fontFamily: "Inter", customDomain: "",
  });

  // Step 4
  const [fees, setFees] = useState({
    transferFeePct: 1.5, paymentLinkFeePct: 2.0, virtualCardFeePct: 1.0,
    bnplInterestRate: 2.5, fxMarkupPct: 1.0,
  });
  const [selectedCorridors, setSelectedCorridors] = useState<string[]>(["NGN-USD", "NGN-GBP"]);

  // Pre-fill invite code from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) setInviteCode(code);
  }, []);

  const validateMutation = trpc.wave28.inviteCode.validate.useQuery(
    { code: inviteCode },
    { enabled: false }
  , { staleTime: 30_000 });

  const startSessionMutation = trpc.wave28.partnerOnboarding.startSession.useMutation({
    onSuccess: (d) => {
      setSessionId(d.sessionId);
      setPlan(d.plan);
      setStep(2);
      toast.success("Invite code validated! Let's set up your company.");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveCompanyMutation = trpc.wave28.partnerOnboarding.saveCompanyDetails.useMutation({
    onSuccess: () => { setStep(3); },
    onError: (e) => toast.error(e.message),
  });

  const saveBrandingMutation = trpc.wave28.partnerOnboarding.saveBranding.useMutation({
    onSuccess: () => { setStep(4); },
    onError: (e) => toast.error(e.message),
  });

  const saveFeeMutation = trpc.wave28.partnerOnboarding.saveFeeStructure.useMutation({
    onSuccess: () => { setStep(5); },
    onError: (e) => toast.error(e.message),
  });

  const completeMutation = trpc.wave28.partnerOnboarding.complete.useMutation({
    onSuccess: (d) => {
      setCompletedTenantId(d.tenantId);
      setStep(6); // success state
      toast.success("Your white-label platform is ready!");
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleCorridor = (key: string) => {
    setSelectedCorridors((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const getCorridorsPayload = () =>
    selectedCorridors.map((key) => {
      const [src, dst] = key.split("-");
      return { sourceCurrency: src, destCurrency: dst, feePct: fees.transferFeePct };
    });

  if (step === 6 && completedTenantId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center shadow-xl">
          <CardContent className="p-8 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">You're Live!</h2>
            <p className="text-gray-600">Your white-label PayGate platform has been provisioned successfully.</p>
            <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tenant ID</span>
                <code className="font-mono text-xs text-indigo-700">{completedTenantId}</code>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Plan</span>
                <Badge className="bg-indigo-100 text-indigo-700 capitalize">{plan}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Company</span>
                <span className="font-medium">{company.companyName}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => navigate(`/admin/tenant?tenantId=${completedTenantId}`)}>
                Go to Dashboard
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => navigate(`/partner/preview?tenantId=${completedTenantId}`)}>
                Preview Platform
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-xl">P</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Partner Onboarding</h1>
          <p className="text-gray-600 mt-2">Set up your white-label PayGate platform in minutes</p>
        </div>

        {/* Step Progress */}
        <div className="flex items-center justify-between mb-8 px-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCompleted = step > s.id;
            const isCurrent = step === s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div className={`flex flex-col items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all
                    ${isCompleted ? "bg-indigo-600 border-indigo-600 text-white" :
                      isCurrent ? "border-indigo-600 text-indigo-600 bg-white" :
                      "border-gray-300 text-gray-400 bg-white"}`}>
                    {isCompleted ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={`text-xs mt-1 font-medium hidden sm:block
                    ${isCurrent ? "text-indigo-600" : isCompleted ? "text-indigo-500" : "text-gray-400"}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-4 ${step > s.id ? "bg-indigo-600" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <Card className="shadow-xl">
          {/* Step 1: Invite Code */}
          {step === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5 text-indigo-600" />Enter Your Invite Code</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-gray-600 text-sm">You need a valid partner invite code to register. Contact the PayGate team to obtain one.</p>
                <div>
                  <Label>Invite Code</Label>
                  <Input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    placeholder="PG-XXXX-XXXX"
                    className="mt-1 font-mono text-lg tracking-widest text-center"
                    maxLength={12}
                  />
                </div>
                <Button className="w-full" size="lg"
                  onClick={() => startSessionMutation.mutate({ inviteCode })}
                  disabled={inviteCode.length < 5 || startSessionMutation.isPending}>
                  {startSessionMutation.isPending ? "Validating..." : "Validate Code"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </>
          )}

          {/* Step 2: Company Details */}
          {step === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-600" />Company Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Company Name *</Label>
                    <Input value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                      placeholder="Acme Fintech Ltd" className="mt-1" />
                  </div>
                  <div>
                    <Label>Business Email *</Label>
                    <Input type="email" value={company.companyEmail} onChange={(e) => setCompany({ ...company, companyEmail: e.target.value })}
                      placeholder="hello@acme.com" className="mt-1" />
                  </div>
                  <div>
                    <Label>Phone *</Label>
                    <Input value={company.companyPhone} onChange={(e) => setCompany({ ...company, companyPhone: e.target.value })}
                      placeholder="+234 800 000 0000" className="mt-1" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Select value={company.companyCountry} onValueChange={(v) => setCompany({ ...company, companyCountry: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NG">Nigeria</SelectItem>
                        <SelectItem value="GH">Ghana</SelectItem>
                        <SelectItem value="KE">Kenya</SelectItem>
                        <SelectItem value="ZA">South Africa</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="US">United States</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Business Type</Label>
                    <Select value={company.businessType} onValueChange={(v) => setCompany({ ...company, businessType: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fintech">Fintech</SelectItem>
                        <SelectItem value="bank">Bank / MFB</SelectItem>
                        <SelectItem value="neobank">Neobank</SelectItem>
                        <SelectItem value="remittance">Remittance</SelectItem>
                        <SelectItem value="ecommerce">E-Commerce</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Website</Label>
                    <Input value={company.companyWebsite} onChange={(e) => setCompany({ ...company, companyWebsite: e.target.value })}
                      placeholder="https://acme.com" className="mt-1" />
                  </div>
                  <div>
                    <Label>RC Number (optional)</Label>
                    <Input value={company.rcNumber} onChange={(e) => setCompany({ ...company, rcNumber: e.target.value })}
                      placeholder="RC1234567" className="mt-1" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                  <Button className="flex-1"
                    onClick={() => sessionId && saveCompanyMutation.mutate({ sessionId, ...company })}
                    disabled={!company.companyName || !company.companyEmail || !company.companyPhone || saveCompanyMutation.isPending}>
                    {saveCompanyMutation.isPending ? "Saving..." : "Continue"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Branding */}
          {step === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="w-5 h-5 text-indigo-600" />Brand Your Platform</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Color</Label>
                    <div className="flex gap-2 mt-1">
                      <input type="color" value={branding.primaryColor}
                        onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                        className="w-12 h-10 rounded border cursor-pointer" />
                      <Input value={branding.primaryColor} onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                        className="font-mono" maxLength={7} />
                    </div>
                  </div>
                  <div>
                    <Label>Accent Color</Label>
                    <div className="flex gap-2 mt-1">
                      <input type="color" value={branding.accentColor}
                        onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                        className="w-12 h-10 rounded border cursor-pointer" />
                      <Input value={branding.accentColor} onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                        className="font-mono" maxLength={7} />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Label>Font Family</Label>
                    <Select value={branding.fontFamily} onValueChange={(v) => setBranding({ ...branding, fontFamily: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FONTS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label>Logo URL (optional)</Label>
                    <Input value={branding.logoUrl} onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
                      placeholder="https://cdn.example.com/logo.png" className="mt-1" />
                  </div>
                  <div className="col-span-2">
                    <Label>Custom Domain (optional)</Label>
                    <Input value={branding.customDomain} onChange={(e) => setBranding({ ...branding, customDomain: e.target.value })}
                      placeholder="pay.yourcompany.com" className="mt-1" />
                  </div>
                </div>

                {/* Live Preview */}
                <div className="border rounded-lg p-4 mt-2" style={{ borderColor: branding.primaryColor }}>
                  <div className="flex items-center gap-3 mb-3">
                    {branding.logoUrl ? (
                      <img src={branding.logoUrl} alt="logo" className="w-8 h-8 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: branding.primaryColor }}>
                        {company.companyName.charAt(0) || "P"}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-sm" style={{ fontFamily: branding.fontFamily, color: branding.primaryColor }}>
                        {company.companyName || "Your Company"}
                      </div>
                      <div className="text-xs text-gray-400">Powered by PayGate</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="h-8 rounded px-4 flex items-center text-white text-xs font-medium"
                      style={{ backgroundColor: branding.primaryColor }}>Send Money</div>
                    <div className="h-8 rounded px-4 flex items-center text-xs font-medium border"
                      style={{ color: branding.accentColor, borderColor: branding.accentColor }}>View Balance</div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                  <Button className="flex-1"
                    onClick={() => sessionId && saveBrandingMutation.mutate({ sessionId, ...branding, logoUrl: branding.logoUrl || undefined, customDomain: branding.customDomain || undefined })}
                    disabled={saveBrandingMutation.isPending}>
                    {saveBrandingMutation.isPending ? "Saving..." : "Continue"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Fees & Corridors */}
          {step === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5 text-indigo-600" />Fees & Corridors</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-3">Fee Structure</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: "transferFeePct", label: "Transfer Fee %" },
                      { key: "paymentLinkFeePct", label: "Payment Link Fee %" },
                      { key: "virtualCardFeePct", label: "Virtual Card Fee %" },
                      { key: "bnplInterestRate", label: "BNPL Interest Rate %" },
                      { key: "fxMarkupPct", label: "FX Markup %" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input type="number" step="0.1" min="0" max="20"
                          value={(fees as any)[key]}
                          onChange={(e) => setFees({ ...fees, [key]: Number(e.target.value) })}
                          className="mt-1 text-sm" />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-sm text-gray-700 mb-3">Enabled Corridors</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {CORRIDORS.map((c) => {
                      const key = `${c.src}-${c.dst}`;
                      const isSelected = selectedCorridors.includes(key);
                      return (
                        <button key={key} onClick={() => toggleCorridor(key)}
                          className={`p-2 rounded-lg border text-sm font-medium transition-all text-left
                            ${isSelected ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                          {isSelected && <CheckCircle className="w-3 h-3 inline mr-1 text-indigo-600" />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{selectedCorridors.length} corridor(s) selected</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                  <Button className="flex-1"
                    onClick={() => sessionId && saveFeeMutation.mutate({
                      sessionId,
                      feeStructure: fees,
                      corridors: getCorridorsPayload(),
                    })}
                    disabled={selectedCorridors.length === 0 || saveFeeMutation.isPending}>
                    {saveFeeMutation.isPending ? "Saving..." : "Continue"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 5: Review & Launch */}
          {step === 5 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600" />Review & Launch</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700">Company</h3>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      <span className="text-gray-500">Name</span><span className="font-medium">{company.companyName}</span>
                      <span className="text-gray-500">Email</span><span>{company.companyEmail}</span>
                      <span className="text-gray-500">Country</span><span>{company.companyCountry}</span>
                      <span className="text-gray-500">Plan</span><Badge className="bg-indigo-100 text-indigo-700 w-fit capitalize">{plan}</Badge>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700">Branding</h3>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded" style={{ backgroundColor: branding.primaryColor }} />
                      <div className="w-8 h-8 rounded" style={{ backgroundColor: branding.accentColor }} />
                      <span className="text-sm text-gray-600">{branding.fontFamily}</span>
                      {branding.customDomain && <span className="text-sm text-indigo-600">{branding.customDomain}</span>}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700">Corridors ({selectedCorridors.length})</h3>
                    <div className="flex flex-wrap gap-1">
                      {selectedCorridors.map((k) => (
                        <Badge key={k} className="bg-blue-100 text-blue-700 text-xs">{k.replace("-", " → ")}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <h3 className="font-semibold text-sm text-gray-700">Fees</h3>
                    <div className="grid grid-cols-2 gap-1 text-sm">
                      <span className="text-gray-500">Transfer</span><span>{fees.transferFeePct}%</span>
                      <span className="text-gray-500">Payment Link</span><span>{fees.paymentLinkFeePct}%</span>
                      <span className="text-gray-500">FX Markup</span><span>{fees.fxMarkupPct}%</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(4)}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                  <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                    onClick={() => sessionId && completeMutation.mutate({ sessionId })}
                    disabled={completeMutation.isPending}>
                    {completeMutation.isPending ? "Launching..." : "Launch My Platform 🚀"}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          Powered by PayGate · Enterprise-grade payment infrastructure
        </p>
      </div>
    </div>
  );
}
