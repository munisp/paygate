import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight, Building2, Shield, Network, Landmark, FileText, Send } from "lucide-react";

const STEPS = [
  { id: 1, title: "Institution Details", icon: Building2, description: "Basic information about your institution" },
  { id: 2, title: "CBN Licensing", icon: Shield, description: "Regulatory license documentation" },
  { id: 3, title: "Technical Setup", icon: Network, description: "FSPIOP endpoint and TLS configuration" },
  { id: 4, title: "Settlement Account", icon: Landmark, description: "Settlement bank and account details" },
  { id: 5, title: "Compliance Review", icon: FileText, description: "Review compliance requirements" },
  { id: 6, title: "Submit Application", icon: Send, description: "Review and submit your application" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center min-w-[80px]">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step.id < currentStep
                ? "bg-green-500 text-white"
                : step.id === currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}>
              {step.id < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.id}
            </div>
            <span className={`text-xs mt-1 text-center leading-tight max-w-[70px] ${
              step.id === currentStep ? "text-primary font-medium" : "text-muted-foreground"
            }`}>{step.title}</span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`h-0.5 w-8 mx-1 mb-5 ${step.id < currentStep ? "bg-green-500" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function DFSPOnboarding() {
  const [, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const startMutation = trpc.wave223.dfspOnboarding.start.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setCurrentStep(2);
      toast.success("Session created. Proceeding to CBN licensing.");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStepMutation = trpc.wave223.dfspOnboarding.updateStep.useMutation({
    onSuccess: () => {
      setCurrentStep((s) => Math.min(s + 1, 6));
    },
    onError: (e) => toast.error(e.message),
  });

  const submitMutation = trpc.wave223.dfspOnboarding.submit.useMutation({
    onSuccess: () => {
      toast.success("Application submitted! You will receive an email within 3–5 business days.");
      navigate("/onboarding");
    },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.institutionName || !formData.institutionType || !formData.contactEmail) {
        toast.error("Please fill in all required fields.");
        return;
      }
      startMutation.mutate({
        institutionName: formData.institutionName,
        institutionType: formData.institutionType as any,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
      });
      return;
    }
    if (currentStep < 5 && sessionId) {
      updateStepMutation.mutate({ sessionId, step: currentStep + 1, data: formData });
      return;
    }
    if (currentStep === 5) {
      setCurrentStep(6);
    }
  };

  const handleSubmit = () => {
    if (!sessionId) return;
    submitMutation.mutate({ sessionId });
  };

  const isLoading = startMutation.isPending || updateStepMutation.isPending || submitMutation.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">DFSP Onboarding</h1>
          <p className="text-muted-foreground text-sm">Digital Financial Service Provider registration</p>
        </div>
        <Badge className="ml-auto" variant="secondary">Step {currentStep} of {STEPS.length}</Badge>
      </div>

      <StepIndicator currentStep={currentStep} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => { const S = STEPS[currentStep - 1]; return <><S.icon className="h-5 w-5 text-primary" />{S.title}</>; })()}
          </CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {currentStep === 1 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Institution Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. First Bank of Nigeria" value={formData.institutionName ?? ""} onChange={(e) => set("institutionName", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Institution Type <span className="text-destructive">*</span></Label>
                  <Select value={formData.institutionType ?? ""} onValueChange={(v) => set("institutionType", v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="commercial_bank">Commercial Bank</SelectItem>
                      <SelectItem value="microfinance_bank">Microfinance Bank</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money Operator</SelectItem>
                      <SelectItem value="fintech">Fintech / Payment Company</SelectItem>
                      <SelectItem value="neobank">Neobank</SelectItem>
                      <SelectItem value="cooperative">Cooperative / SACCO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contact Email <span className="text-destructive">*</span></Label>
                  <Input type="email" placeholder="ops@institution.com" value={formData.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input placeholder="+234 800 000 0000" value={formData.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Technical Contact Email</Label>
                  <Input type="email" placeholder="tech@institution.com" value={formData.technicalContactEmail ?? ""} onChange={(e) => set("technicalContactEmail", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {currentStep === 2 && (
            <>
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                Your CBN license will be verified against the CBN public register. Ensure the license number matches exactly.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>CBN License Number</Label>
                  <Input placeholder="e.g. CBN/FBN/2024/001" value={formData.cbnLicenseNumber ?? ""} onChange={(e) => set("cbnLicenseNumber", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>License Document URL</Label>
                  <Input placeholder="https://docs.institution.com/cbn-license.pdf" value={formData.cbnLicenseDocUrl ?? ""} onChange={(e) => set("cbnLicenseDocUrl", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {currentStep === 3 && (
            <>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>FSPIOP Endpoint URL</Label>
                  <Input placeholder="https://api.institution.com/fspiop/v2.0" value={formData.fspiopEndpoint ?? ""} onChange={(e) => set("fspiopEndpoint", e.target.value)} />
                  <p className="text-xs text-muted-foreground">The base URL of your FSPIOP-compliant API. Must be HTTPS and publicly reachable.</p>
                </div>
                <div className="space-y-2">
                  <Label>TLS Certificate URL</Label>
                  <Input placeholder="https://certs.institution.com/tls.pem" value={formData.tlsCertUrl ?? ""} onChange={(e) => set("tlsCertUrl", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>JWKS URL (for JWS verification)</Label>
                  <Input placeholder="https://api.institution.com/.well-known/jwks.json" value={formData.jwksUrl ?? ""} onChange={(e) => set("jwksUrl", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {currentStep === 4 && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Settlement Bank Code</Label>
                  <Input placeholder="e.g. 011 (First Bank)" value={formData.settlementBankCode ?? ""} onChange={(e) => set("settlementBankCode", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Settlement Account Number</Label>
                  <Input placeholder="10-digit NUBAN" maxLength={10} value={formData.settlementAccountNumber ?? ""} onChange={(e) => set("settlementAccountNumber", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {currentStep === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Before submitting, confirm your institution meets the following requirements:</p>
              {[
                "Valid CBN operating license for the selected institution type",
                "FSPIOP v2.0 compliant API endpoint (ISO 20022 message support)",
                "Mutual TLS (mTLS) enabled on all API endpoints",
                "JWS signing capability using RSA-PSS or Ed25519",
                "Settlement account in a CBN-approved settlement bank",
                "AML/CFT compliance program in place",
                "24/7 technical support contact available",
              ].map((req, i) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span className="text-sm">{req}</span>
                </div>
              ))}
            </div>
          )}

          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="font-medium text-sm text-blue-800 dark:text-blue-200 mb-2">Application Summary</p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {Object.entries(formData).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt>
                      <dd className="font-medium truncate">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className="text-sm text-muted-foreground">
                By submitting, you confirm that all information is accurate and your institution agrees to the
                PayGate NextHub Participation Agreement and CBN Regulatory Guidelines.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => currentStep > 1 ? setCurrentStep((s) => s - 1) : navigate("/onboarding")} disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {currentStep === 1 ? "Cancel" : "Back"}
        </Button>
        {currentStep < 6 ? (
          <Button onClick={handleNext} disabled={isLoading}>
            {isLoading ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
            {isLoading ? "Submitting…" : "Submit Application"} <Send className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
