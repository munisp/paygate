import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, ArrowLeft, ArrowRight, Monitor, Shield, MapPin, Send } from "lucide-react";

const STEPS = [
  { id: 1, title: "Operator Info", icon: Monitor, description: "POS operator and PTSP details" },
  { id: 2, title: "NIBSS Approval", icon: Shield, description: "NIBSS regulatory approval" },
  { id: 3, title: "Deployment", icon: MapPin, description: "Terminal count and deployment locations" },
  { id: 4, title: "Submit", icon: Send, description: "Review and submit" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
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

export default function POSOperatorOnboarding() {
  const [, navigate] = useLocation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Record<string, string>>({ terminalCount: "1" });

  const startMutation = trpc.wave223.posOperatorOnboarding.start.useMutation({
    onSuccess: (data) => { setSessionId(data.sessionId); setCurrentStep(2); },
    onError: (e) => toast.error(e.message),
  });

  const updateStepMutation = trpc.wave223.posOperatorOnboarding.updateStep.useMutation({
    onSuccess: () => setCurrentStep((s) => Math.min(s + 1, 4)),
    onError: (e) => toast.error(e.message),
  });

  const submitMutation = trpc.wave223.posOperatorOnboarding.submit.useMutation({
    onSuccess: () => { toast.success("POS operator application submitted!"); navigate("/onboarding"); },
    onError: (e) => toast.error(e.message),
  });

  const set = (key: string, value: string) => setFormData((prev) => ({ ...prev, [key]: value }));
  const isLoading = startMutation.isPending || updateStepMutation.isPending || submitMutation.isPending;

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.operatorName || !formData.contactEmail) { toast.error("Fill required fields."); return; }
      startMutation.mutate({
        operatorName: formData.operatorName,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        terminalCount: parseInt(formData.terminalCount ?? "1"),
      });
      return;
    }
    if (currentStep < 4 && sessionId) {
      updateStepMutation.mutate({ sessionId, step: currentStep + 1, data: formData });
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div><h1 className="text-2xl font-bold">POS Operator Onboarding</h1><p className="text-muted-foreground text-sm">Terminal operator / PTSP registration</p></div>
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
                <Label>Operator Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. QuickPay Terminals Ltd" value={formData.operatorName ?? ""} onChange={(e) => set("operatorName", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>PTSP Code</Label>
                <Input placeholder="e.g. PTSP001" value={formData.ptspCode ?? ""} onChange={(e) => set("ptspCode", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contact Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={formData.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input placeholder="+234 800 000 0000" value={formData.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Number of Terminals</Label>
                <Input type="number" min="1" value={formData.terminalCount ?? "1"} onChange={(e) => set("terminalCount", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200">
                NIBSS approval is required for all POS terminal operators in Nigeria. Upload your NIBSS approval letter.
              </div>
              <div className="space-y-2">
                <Label>NIBSS Approval Document URL</Label>
                <Input placeholder="https://docs.operator.com/nibss-approval.pdf" value={formData.nibssApprovalDocUrl ?? ""} onChange={(e) => set("nibssApprovalDocUrl", e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Deployment Locations</Label>
                <Textarea
                  placeholder="List states or LGAs where terminals will be deployed, e.g.:&#10;Lagos (Ikeja, Victoria Island, Lekki)&#10;Abuja (Wuse, Garki, Maitama)&#10;Kano (Sabon Gari)"
                  rows={5}
                  value={formData.deploymentLocations ?? ""}
                  onChange={(e) => set("deploymentLocations", e.target.value)}
                />
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="p-4 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg">
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
        {currentStep < 4 ? (
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
