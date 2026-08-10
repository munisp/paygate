import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight, Zap, Shield, Link, Settings, Send } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company Info", icon: Zap, description: "Basic company information" },
  { id: 2, title: "CBN License", icon: Shield, description: "PISP regulatory license" },
  { id: 3, title: "OAuth Config", icon: Link, description: "Redirect URLs and webhook configuration" },
  { id: 4, title: "Consent Scopes", icon: Settings, description: "Declare required consent scopes" },
  { id: 5, title: "Submit", icon: Send, description: "Review and submit" },
];

const CONSENT_SCOPES = [
  { id: "accounts:read", label: "Read account information (balances, details)" },
  { id: "transactions:read", label: "Read transaction history" },
  { id: "payments:initiate", label: "Initiate single payments" },
  { id: "payments:bulk", label: "Initiate bulk payments" },
  { id: "standing_orders:manage", label: "Manage standing orders" },
  { id: "beneficiaries:manage", label: "Manage saved beneficiaries" },
];

function StepIndicator({ currentStep, total }: { currentStep: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center min-w-[70px]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              step.id < currentStep ? "bg-green-500 text-white" : step.id === currentStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {step.id < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.id}
            </div>
            <span className={`text-xs mt-1 text-center leading-tight max-w-[60px] ${step.id === currentStep ? "text-primary font-medium" : "text-muted-foreground"}`}>{step.title}</span>
          </div>
          {idx < STEPS.length - 1 && <div className={`h-0.5 w-8 mx-1 mb-5 ${step.id < currentStep ? "bg-green-500" : "bg-muted"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function PISPOnboarding() {
  const [, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  const startMutation = trpc.wave223.pispOnboarding.start.useMutation({
    onSuccess: (data) => { setSessionId(data.sessionId); setCurrentStep(2); },
    onError: (e) => toast.error(e.message),
  });

  const updateStepMutation = trpc.wave223.pispOnboarding.updateStep.useMutation({
    onSuccess: () => setCurrentStep((s) => Math.min(s + 1, 5)),
    onError: (e) => toast.error(e.message),
  });

  const submitMutation = trpc.wave223.pispOnboarding.submit.useMutation({
    onSuccess: () => { toast.success("PISP application submitted!"); navigate("/onboarding"); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));
  const isLoading = startMutation.isPending || updateStepMutation.isPending || submitMutation.isPending;

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.companyName || !formData.contactEmail) { toast.error("Fill required fields."); return; }
      startMutation.mutate({ companyName: formData.companyName, contactEmail: formData.contactEmail, businessDescription: formData.businessDescription });
      return;
    }
    if (currentStep === 4 && sessionId) {
      updateStepMutation.mutate({ sessionId, step: 5, data: { ...formData, consentScopeRequested: selectedScopes.join(",") } });
      return;
    }
    if (currentStep < 4 && sessionId) {
      updateStepMutation.mutate({ sessionId, step: currentStep + 1, data: formData });
      return;
    }
    if (currentStep === 4) setCurrentStep(5);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div><h1 className="text-2xl font-bold">PISP Onboarding</h1><p className="text-muted-foreground text-sm">Payment Initiation Service Provider registration</p></div>
        <Badge className="ml-auto" variant="secondary">Step {currentStep} of {STEPS.length}</Badge>
      </div>

      <StepIndicator currentStep={currentStep} total={STEPS.length} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => { const S = STEPS[currentStep - 1]; return <><S.icon className="h-5 w-5 text-primary" />{S.title}</>; })()}
          </CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentStep === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. PayEase Technologies Ltd" value={formData.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contact Email <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="compliance@company.com" value={formData.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Business Description</Label>
                <Textarea placeholder="Describe your payment initiation use case…" rows={3} value={formData.businessDescription ?? ""} onChange={(e) => set("businessDescription", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CBN PISP License Number</Label>
                <Input placeholder="CBN/PISP/2024/001" value={formData.cbnLicenseNumber ?? ""} onChange={(e) => set("cbnLicenseNumber", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>License Document URL</Label>
                <Input placeholder="https://docs.company.com/cbn-pisp.pdf" value={formData.cbnLicenseDocUrl ?? ""} onChange={(e) => set("cbnLicenseDocUrl", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Redirect URLs (one per line)</Label>
                <Textarea placeholder="https://app.company.com/callback&#10;https://app.company.com/auth/callback" rows={3} value={formData.redirectUrls ?? ""} onChange={(e) => set("redirectUrls", e.target.value)} />
                <p className="text-xs text-muted-foreground">These URLs will receive the OAuth authorization code after user consent.</p>
              </div>
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <Input placeholder="https://api.company.com/webhooks/nexthub" value={formData.webhookUrl ?? ""} onChange={(e) => set("webhookUrl", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Select the consent scopes your application requires. Users will be shown these during the consent flow.</p>
              {CONSENT_SCOPES.map((scope) => (
                <div key={scope.id} className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={scope.id}
                    checked={selectedScopes.includes(scope.id)}
                    onCheckedChange={(checked) => {
                      setSelectedScopes((prev) => checked ? [...prev, scope.id] : prev.filter((s) => s !== scope.id));
                    }}
                  />
                  <Label htmlFor={scope.id} className="cursor-pointer text-sm font-normal">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{scope.id}</span>
                    {scope.label}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg">
                <p className="font-medium text-sm mb-2">Application Summary</p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(formData).filter(([, v]) => v).map(([k, v]) => (
                    <div key={k}><dt className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-medium truncate">{v}</dd></div>
                  ))}
                  <div><dt className="text-muted-foreground">Consent Scopes</dt><dd className="font-medium">{selectedScopes.length} selected</dd></div>
                </dl>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => currentStep > 1 ? setCurrentStep((s) => s - 1) : navigate("/onboarding")} disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {currentStep === 1 ? "Cancel" : "Back"}
        </Button>
        {currentStep < 5 ? (
          <Button onClick={handleNext} disabled={isLoading}>{isLoading ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4 ml-1" /></Button>
        ) : (
          <Button onClick={() => sessionId && submitMutation.mutate({ sessionId })} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
            {isLoading ? "Submitting…" : "Submit Application"} <Send className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
