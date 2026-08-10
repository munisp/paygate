// @ts-nocheck
/**
 * PartnerOnboarding — 6-step wizard for partner/white-label tenant onboarding
 *
 * Steps:
 *   1. Invite Code — validate the partner invite
 *   2. Company Details — name, RC number, address, industry
 *   3. Branding — logo URL, primary/secondary color, font family
 *   4. Fee Structure — settlement split, transaction fees, payout schedule
 *   5. Billing Tier — select pricing tier (Starter/Growth/Enterprise) and trigger Temporal workflow
 *   6. Review & Submit — confirm all details and create tenant
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  CheckCircle2,
  Building2,
  Palette,
  DollarSign,
  ClipboardCheck,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Key,
  CreditCard,
  Zap,
  Star,
  Rocket,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "Invite Code", icon: Key },
  { id: 2, label: "Company Details", icon: Building2 },
  { id: 3, label: "Branding", icon: Palette },
  { id: 4, label: "Fee Structure", icon: DollarSign },
  { id: 5, label: "Billing Tier", icon: CreditCard },
  { id: 6, label: "Review", icon: ClipboardCheck },
];

const BILLING_TIERS = [
  {
    id: "starter",
    label: "Starter",
    icon: Zap,
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    fee: "1.5%",
    cap: "₦2,000",
    split: "65% platform / 35% reseller",
    overhead: "₦2M/mo",
    description: "For new merchants and micro-businesses. Low volume, simple fee structure.",
  },
  {
    id: "growth",
    label: "Growth",
    icon: Star,
    color: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-200",
    fee: "1.4%",
    cap: "₦1,500",
    split: "70% platform / 30% reseller",
    overhead: "₦5M/mo",
    description: "For growing SMEs. Competitive rates with higher platform share.",
  },
  {
    id: "enterprise",
    label: "Enterprise",
    icon: Rocket,
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
    fee: "1.2%",
    cap: "₦1,000",
    split: "75% platform / 25% reseller",
    overhead: "₦12M/mo",
    description: "For large merchants and white-label partners. Volume discounts and custom SLAs.",
  },
];

interface StepData {
  inviteCode?: string;
  companyName?: string;
  rcNumber?: string;
  address?: string;
  industry?: string;
  contactEmail?: string;
  contactPhone?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  settlementSplitPct?: number;
  transactionFeePct?: number;
  payoutSchedule?: string;
  minimumPayoutNGN?: number;
  billingTier?: "starter" | "growth" | "enterprise";
  billingProvisioned?: boolean;
}

export default function PartnerOnboarding() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [stepData, setStepData] = useState<StepData>({
    primaryColor: "#6366f1",
    secondaryColor: "#8b5cf6",
    fontFamily: "Inter",
    settlementSplitPct: 70,
    transactionFeePct: 1.5,
    payoutSchedule: "T+1",
    minimumPayoutNGN: 10_000,
  });
  const [completed, setCompleted] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const startMutation = trpc.partnerOnboarding.start.useMutation({
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      setCurrentStep(2);
    },
    onError: (err) => toast.error(err.message),
  });

  const saveStepMutation = trpc.partnerOnboarding.saveStep.useMutation({
    onSuccess: (data) => {
      if (data.nextStep <= 5) {
        setCurrentStep(data.nextStep);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const completeMutation = trpc.partnerOnboarding.complete.useMutation({
    onSuccess: (data) => {
      setTenantId(data.tenantId);
      setCompleted(true);
      toast.success("Partner tenant created successfully!");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateField = (field: keyof StepData, value: string | number) => {
    setStepData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStep1 = async () => {
    if (!stepData.inviteCode?.trim()) {
      toast.error("Please enter your invite code");
      return;
    }
    startMutation.mutate({ inviteCode: stepData.inviteCode });
  };

  const handleStep2 = async () => {
    if (!stepData.companyName?.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (!sessionId) return;
    saveStepMutation.mutate({
      sessionId,
      step: 2,
      data: {
        companyName: stepData.companyName,
        rcNumber: stepData.rcNumber,
        address: stepData.address,
        industry: stepData.industry,
        contactEmail: stepData.contactEmail,
        contactPhone: stepData.contactPhone,
      },
    });
  };

  const handleStep3 = async () => {
    if (!sessionId) return;
    saveStepMutation.mutate({
      sessionId,
      step: 3,
      data: {
        primaryColor: stepData.primaryColor,
        secondaryColor: stepData.secondaryColor,
        fontFamily: stepData.fontFamily,
        logoUrl: stepData.logoUrl,
      },
    });
  };

  const handleStep4 = async () => {
    if (!sessionId) return;
    saveStepMutation.mutate({
      sessionId,
      step: 4,
      data: {
        settlementSplitPct: stepData.settlementSplitPct,
        transactionFeePct: stepData.transactionFeePct,
        payoutSchedule: stepData.payoutSchedule,
        minimumPayoutNGN: stepData.minimumPayoutNGN,
      },
    });
  };

  const handleComplete = async () => {
    if (!sessionId) return;
    completeMutation.mutate({ sessionId });
  };

  const provisionBillingMutation = trpc.billingExt.provisionBillingTier.useMutation({
    onSuccess: () => {
      toast.success("Billing tier provisioned via Temporal workflow");
      setStepData(prev => ({ ...prev, billingProvisioned: true }));
      setCurrentStep(6);
    },
    onError: (err) => {
      toast.error(`Billing provisioning failed: ${err.message}`);
    },
  });

  const handleStep5 = async () => {
    if (!stepData.billingTier) {
      toast.error("Please select a billing tier");
      return;
    }
    if (!sessionId) return;
    provisionBillingMutation.mutate({
      tenantId: sessionId, // use sessionId as tenantId proxy until tenant is created
      tier: stepData.billingTier,
      createdBy: "onboarding-wizard",
    });
  };

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  if (completed && tenantId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center shadow-xl">
          <CardContent className="pt-12 pb-10">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Partner Onboarded!</h2>
            <p className="text-gray-600 mb-6">
              Your white-label tenant has been created. You can now access the partner dashboard.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Tenant ID</p>
              <p className="font-mono text-sm font-medium text-gray-900">{tenantId}</p>
            </div>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => navigate(`/admin/tenant/${tenantId}`)}>
                Go to Dashboard
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to Portal
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Partner Onboarding</h1>
          <p className="text-gray-600 mt-2">Set up your white-label PayGate tenant in 5 steps</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-between mb-6 relative">
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 z-0" />
          <div
            className="absolute top-5 left-0 h-0.5 bg-indigo-600 z-0 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            return (
              <div key={step.id} className="flex flex-col items-center z-10">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    isCompleted
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : isCurrent
                      ? "bg-white border-indigo-600 text-indigo-600"
                      : "bg-white border-gray-300 text-gray-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`text-xs mt-2 font-medium ${
                    isCurrent ? "text-indigo-600" : isCompleted ? "text-gray-700" : "text-gray-400"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        <Progress value={progress} className="mb-6 h-1" />

        {/* Step content */}
        <Card className="shadow-lg">
          {/* Step 1: Invite Code */}
          {currentStep === 1 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-indigo-600" />
                  Invite Code
                </CardTitle>
                <CardDescription>
                  Enter the partner invite code provided by PayGate to begin onboarding.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="inviteCode">Invite Code *</Label>
                  <Input
                    id="inviteCode"
                    placeholder="e.g. PG-PARTNER-2026-XXXX"
                    value={stepData.inviteCode ?? ""}
                    onChange={(e) => updateField("inviteCode", e.target.value)}
                    className="mt-1.5 font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Contact partners@paygate.ng if you don't have an invite code.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleStep1}
                    disabled={startMutation.isPending}
                    className="gap-2"
                  >
                    {startMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 2: Company Details */}
          {currentStep === 2 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  Company Details
                </CardTitle>
                <CardDescription>
                  Provide your company's legal and contact information.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="companyName">Company Name *</Label>
                    <Input
                      id="companyName"
                      placeholder="Acme Financial Services Ltd"
                      value={stepData.companyName ?? ""}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rcNumber">RC Number</Label>
                    <Input
                      id="rcNumber"
                      placeholder="RC1234567"
                      value={stepData.rcNumber ?? ""}
                      onChange={(e) => updateField("rcNumber", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="industry">Industry</Label>
                    <Input
                      id="industry"
                      placeholder="Fintech / Banking / Retail"
                      value={stepData.industry ?? ""}
                      onChange={(e) => updateField("industry", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="ops@acme.ng"
                      value={stepData.contactEmail ?? ""}
                      onChange={(e) => updateField("contactEmail", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input
                      id="contactPhone"
                      placeholder="+234 800 000 0000"
                      value={stepData.contactPhone ?? ""}
                      onChange={(e) => updateField("contactPhone", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="address">Registered Address</Label>
                    <Input
                      id="address"
                      placeholder="1 Finance Street, Victoria Island, Lagos"
                      value={stepData.address ?? ""}
                      onChange={(e) => updateField("address", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleStep2}
                    disabled={saveStepMutation.isPending}
                    className="gap-2"
                  >
                    {saveStepMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 3: Branding */}
          {currentStep === 3 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-indigo-600" />
                  Branding
                </CardTitle>
                <CardDescription>
                  Customise your tenant's visual identity for the white-label portal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="color"
                        id="primaryColor"
                        value={stepData.primaryColor ?? "#6366f1"}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                      />
                      <Input
                        value={stepData.primaryColor ?? "#6366f1"}
                        onChange={(e) => updateField("primaryColor", e.target.value)}
                        className="font-mono"
                        placeholder="#6366f1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="secondaryColor">Secondary Color</Label>
                    <div className="flex gap-2 mt-1.5">
                      <input
                        type="color"
                        id="secondaryColor"
                        value={stepData.secondaryColor ?? "#8b5cf6"}
                        onChange={(e) => updateField("secondaryColor", e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-200"
                      />
                      <Input
                        value={stepData.secondaryColor ?? "#8b5cf6"}
                        onChange={(e) => updateField("secondaryColor", e.target.value)}
                        className="font-mono"
                        placeholder="#8b5cf6"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="fontFamily">Font Family</Label>
                    <Input
                      id="fontFamily"
                      placeholder="Inter"
                      value={stepData.fontFamily ?? "Inter"}
                      onChange={(e) => updateField("fontFamily", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input
                      id="logoUrl"
                      placeholder="https://cdn.example.com/logo.png"
                      value={stepData.logoUrl ?? ""}
                      onChange={(e) => updateField("logoUrl", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                {/* Preview */}
                <div className="rounded-lg border p-4 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Preview</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: stepData.primaryColor ?? "#6366f1" }}
                    >
                      {(stepData.companyName ?? "P")[0].toUpperCase()}
                    </div>
                    <div>
                      <p
                        className="font-semibold text-sm"
                        style={{ color: stepData.primaryColor ?? "#6366f1", fontFamily: stepData.fontFamily }}
                      >
                        {stepData.companyName ?? "Your Company"}
                      </p>
                      <p className="text-xs text-gray-500">Powered by PayGate</p>
                    </div>
                    <div className="ml-auto">
                      <Badge
                        style={{
                          backgroundColor: stepData.secondaryColor ?? "#8b5cf6",
                          color: "white",
                        }}
                      >
                        White-Label
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleStep3}
                    disabled={saveStepMutation.isPending}
                    className="gap-2"
                  >
                    {saveStepMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 4: Fee Structure */}
          {currentStep === 4 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  Fee Structure
                </CardTitle>
                <CardDescription>
                  Configure the revenue sharing and fee model for your tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="settlementSplit">Settlement Split (%)</Label>
                    <Input
                      id="settlementSplit"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={stepData.settlementSplitPct ?? 70}
                      onChange={(e) => updateField("settlementSplitPct", parseFloat(e.target.value))}
                      className="mt-1.5"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Percentage of revenue retained by partner (PayGate keeps the rest)
                    </p>
                  </div>
                  <div>
                    <Label htmlFor="transactionFee">Transaction Fee (%)</Label>
                    <Input
                      id="transactionFee"
                      type="number"
                      min={0}
                      max={10}
                      step={0.1}
                      value={stepData.transactionFeePct ?? 1.5}
                      onChange={(e) => updateField("transactionFeePct", parseFloat(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="payoutSchedule">Payout Schedule</Label>
                    <Input
                      id="payoutSchedule"
                      placeholder="T+1"
                      value={stepData.payoutSchedule ?? "T+1"}
                      onChange={(e) => updateField("payoutSchedule", e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="minimumPayout">Minimum Payout (NGN)</Label>
                    <Input
                      id="minimumPayout"
                      type="number"
                      min={1000}
                      step={1000}
                      value={stepData.minimumPayoutNGN ?? 10_000}
                      onChange={(e) => updateField("minimumPayoutNGN", parseInt(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                  <p className="text-sm font-medium text-indigo-900 mb-2">Revenue Summary</p>
                  <div className="space-y-1 text-sm text-indigo-800">
                    <div className="flex justify-between">
                      <span>Partner share:</span>
                      <span className="font-semibold">{stepData.settlementSplitPct ?? 70}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PayGate share:</span>
                      <span className="font-semibold">{100 - (stepData.settlementSplitPct ?? 70)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Per-transaction fee:</span>
                      <span className="font-semibold">{stepData.transactionFeePct ?? 1.5}%</span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleStep4}
                    disabled={saveStepMutation.isPending}
                    className="gap-2"
                  >
                    {saveStepMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 5: Billing Tier */}
          {currentStep === 5 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  Billing Tier
                </CardTitle>
                <CardDescription>
                  Select a pricing tier. This provisions the billing config via a Temporal workflow and cannot be changed without admin approval.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  {BILLING_TIERS.map((tier) => {
                    const Icon = tier.icon;
                    const selected = stepData.billingTier === tier.id;
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setStepData(prev => ({ ...prev, billingTier: tier.id as StepData["billingTier"] }))}
                        className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                          selected ? `${tier.bg} border-current ring-2 ring-offset-1` : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${tier.color}`}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className={`font-semibold ${selected ? tier.color : "text-gray-900"}`}>{tier.label}</span>
                              {selected && <CheckCircle2 className={`w-4 h-4 ${tier.color}`} />}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{tier.description}</p>
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <span className="text-gray-500">Fee Rate: <span className="font-medium text-gray-700">{tier.fee} (cap {tier.cap})</span></span>
                              <span className="text-gray-500">Split: <span className="font-medium text-gray-700">{tier.split}</span></span>
                              <span className="text-gray-500">Overhead: <span className="font-medium text-gray-700">{tier.overhead}</span></span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {stepData.billingProvisioned && (
                  <div className="flex items-center gap-2 text-green-600 bg-green-50 rounded-lg p-3 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Billing tier provisioned successfully via Temporal workflow.
                  </div>
                )}
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setCurrentStep(4)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleStep5}
                    disabled={provisionBillingMutation.isPending || !stepData.billingTier}
                    className="gap-2"
                  >
                    {provisionBillingMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    Provision Billing & Continue
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {/* Step 6: Review */}
          {currentStep === 6 && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                  Review & Submit
                </CardTitle>
                <CardDescription>
                  Review your details before creating the partner tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <ReviewSection title="Company Details">
                    <ReviewRow label="Company Name" value={stepData.companyName} />
                    <ReviewRow label="RC Number" value={stepData.rcNumber} />
                    <ReviewRow label="Industry" value={stepData.industry} />
                    <ReviewRow label="Contact Email" value={stepData.contactEmail} />
                    <ReviewRow label="Address" value={stepData.address} />
                  </ReviewSection>
                  <ReviewSection title="Branding">
                    <ReviewRow label="Primary Color" value={stepData.primaryColor} />
                    <ReviewRow label="Secondary Color" value={stepData.secondaryColor} />
                    <ReviewRow label="Font Family" value={stepData.fontFamily} />
                    <ReviewRow label="Logo URL" value={stepData.logoUrl ?? "Not set"} />
                  </ReviewSection>
                  <ReviewSection title="Fee Structure">
                    <ReviewRow label="Settlement Split" value={`${stepData.settlementSplitPct}% partner / ${100 - (stepData.settlementSplitPct ?? 70)}% PayGate`} />
                    <ReviewRow label="Transaction Fee" value={`${stepData.transactionFeePct}%`} />
                    <ReviewRow label="Payout Schedule" value={stepData.payoutSchedule} />
                    <ReviewRow label="Minimum Payout" value={`NGN ${(stepData.minimumPayoutNGN ?? 0).toLocaleString()}`} />
                  </ReviewSection>
                  <ReviewSection title="Billing Tier">
                    <ReviewRow label="Selected Tier" value={stepData.billingTier ? stepData.billingTier.charAt(0).toUpperCase() + stepData.billingTier.slice(1) : "Not set"} />
                    <ReviewRow label="Provisioned" value={stepData.billingProvisioned ? "Yes — Temporal workflow triggered" : "Pending"} />
                  </ReviewSection>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setCurrentStep(5)} className="gap-2">
                    <ChevronLeft className="w-4 h-4" />
                    Back
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={completeMutation.isPending}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {completeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    <CheckCircle2 className="w-4 h-4" />
                    Create Tenant
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="bg-gray-50 px-4 py-2 border-b">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</p>
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between px-4 py-2.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900 text-right max-w-xs truncate">
        {value ?? <span className="text-gray-400 italic">Not provided</span>}
      </span>
    </div>
  );
}
