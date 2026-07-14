import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight, CreditCard, Shield, Settings, Landmark, Send } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company Info", icon: CreditCard, description: "PSP company details and type" },
  { id: 2, title: "CBN License", icon: Shield, description: "PSP regulatory license" },
  { id: 3, title: "PCI DSS", icon: Settings, description: "PCI DSS compliance documentation" },
  { id: 4, title: "Settlement", icon: Landmark, description: "Settlement bank and transaction limits" },
  { id: 5, title: "Submit", icon: Send, description: "Review and submit" },
];

const MCC_GROUPS = [
  { id: "retail", label: "Retail & E-commerce (5000–5999)" },
  { id: "food", label: "Food & Beverage (5800–5899)" },
  { id: "travel", label: "Travel & Transport (4000–4999)" },
  { id: "health", label: "Healthcare (8000–8099)" },
  { id: "education", label: "Education (8200–8299)" },
  { id: "utilities", label: "Utilities & Government (4900–4999, 9000+)" },
  { id: "financial", label: "Financial Services (6000–6499)" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8 overflow-x-auto pb-2">
      {STEPS.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center min-w-[70px]">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
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

export default function PSPOnboarding() {
  const [, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedMCCs, setSelectedMCCs] = useState<string[]>([]);

  const startMutation = trpc.wave223.pspOnboarding.start.useMutation({
    onSuccess: (data) => { setSessionId(data.sessionId); setCurrentStep(2); },
    onError: (e) => toast.error(e.message),
  });

  const updateStepMutation = trpc.wave223.pspOnboarding.updateStep.useMutation({
    onSuccess: () => setCurrentStep((s) => Math.min(s + 1, 5)),
    onError: (e) => toast.error(e.message),
  });

  const submitMutation = trpc.wave223.pspOnboarding.submit.useMutation({
    onSuccess: () => { toast.success("PSP application submitted!"); navigate("/onboarding"); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));
  const isLoading = startMutation.isPending || updateStepMutation.isPending || submitMutation.isPending;

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.companyName || !formData.pspType || !formData.contactEmail) { toast.error("Fill required fields."); return; }
      startMutation.mutate({ companyName: formData.companyName, pspType: formData.pspType as any, contactEmail: formData.contactEmail });
      return;
    }
    if (currentStep < 5 && sessionId) {
      const data = currentStep === 3 ? { ...formData, merchantCategoryCodesAllowed: selectedMCCs.join(",") } : formData;
      updateStepMutation.mutate({ sessionId, step: currentStep + 1, data });
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div><h1 className="text-2xl font-bold">PSP / Acquirer Onboarding</h1><p className="text-muted-foreground text-sm">Payment Service Provider registration</p></div>
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
        <CardContent className="space-y-4">
          {currentStep === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Company Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Interswitch Ltd" value={formData.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>PSP Type <span className="text-destructive">*</span></Label>
                <Select value={formData.pspType ?? ""} onValueChange={(v) => set("pspType", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acquirer">Acquirer</SelectItem>
                    <SelectItem value="issuer">Issuer</SelectItem>
                    <SelectItem value="payment_facilitator">Payment Facilitator</SelectItem>
                    <SelectItem value="aggregator">Aggregator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Contact Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={formData.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CBN PSP License Number</Label>
                <Input placeholder="CBN/PSP/2024/001" value={formData.cbnLicenseNumber ?? ""} onChange={(e) => set("cbnLicenseNumber", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>PCI DSS Level</Label>
                  <Select value={formData.pcidssLevel ?? ""} onValueChange={(v) => set("pcidssLevel", v)}>
                    <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="level_1">Level 1 (&gt;6M transactions/year)</SelectItem>
                      <SelectItem value="level_2">Level 2 (1M–6M)</SelectItem>
                      <SelectItem value="level_3">Level 3 (20K–1M)</SelectItem>
                      <SelectItem value="level_4">Level 4 (&lt;20K)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>PCI DSS Certificate URL</Label>
                  <Input placeholder="https://docs.psp.com/pci-cert.pdf" value={formData.pcidssDocUrl ?? ""} onChange={(e) => set("pcidssDocUrl", e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="mb-3 block">Allowed Merchant Category Groups</Label>
                <div className="grid grid-cols-1 gap-2">
                  {MCC_GROUPS.map((g) => (
                    <div key={g.id} className="flex items-center gap-3 p-2.5 border rounded-lg">
                      <Switch
                        checked={selectedMCCs.includes(g.id)}
                        onCheckedChange={(c) => setSelectedMCCs((p) => c ? [...p, g.id] : p.filter((x) => x !== g.id))}
                      />
                      <span className="text-sm">{g.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Settlement Bank Code</Label>
                <Input placeholder="e.g. 011" value={formData.settlementBankCode ?? ""} onChange={(e) => set("settlementBankCode", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Max Transaction Amount (NGN)</Label>
                <Input type="number" placeholder="5000000" value={formData.maxTransactionAmount ?? ""} onChange={(e) => set("maxTransactionAmount", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="font-medium text-sm mb-2">Application Summary</p>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(formData).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}><dt className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</dt><dd className="font-medium truncate">{v}</dd></div>
                ))}
              </dl>
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
