/**
 * SubMerchantOnboarding.tsx
 *
 * Multi-step sub-merchant onboarding wizard for PSP licence holders.
 * Steps:
 *   1. Business details (name, RC number, TIN, business type, industry)
 *   2. KYB document upload (CAC cert, MEMART, utility bill, director IDs)
 *   3. BVN director verification (cross-validates via NIBSS)
 *   4. Velocity limit assignment (per-channel transaction limits)
 *   5. Go-live approval (compliance review + activation)
 *
 * All steps call real tRPC procedures — zero mocks.
 */

import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Building2, FileText, User, Gauge, CheckCircle2,
  ArrowRight, ArrowLeft, Loader2, Upload, AlertCircle,
  Shield, Zap, ChevronRight, X, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Business Details", icon: Building2, desc: "Legal entity information" },
  { id: 2, label: "KYB Documents", icon: FileText, desc: "Upload verification documents" },
  { id: 3, label: "Director BVN", icon: User, desc: "Director identity verification" },
  { id: 4, label: "Velocity Limits", icon: Gauge, desc: "Transaction limit configuration" },
  { id: 5, label: "Go-Live", icon: CheckCircle2, desc: "Compliance review & activation" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface BusinessForm {
  businessName: string;
  rcNumber: string;
  taxId: string;
  businessType: string;
  industryCode: string;
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  settlementAccountNumber: string;
  settlementBankCode: string;
}

interface Director {
  firstName: string;
  lastName: string;
  bvn: string;
  nin: string;
  phone: string;
  email: string;
}

interface VelocityLimitForm {
  channel: string;
  limitType: string;
  maxCount: string;
  maxAmountKobo: string;
  singleTxMaxKobo: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SubMerchantOnboarding() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [kybVerificationId, setKybVerificationId] = useState<string | null>(null);

  // Step 1 — Business Details
  const [businessForm, setBusinessForm] = useState<BusinessForm>({
    businessName: "",
    rcNumber: "",
    taxId: "",
    businessType: "limited_liability",
    industryCode: "6499",
    businessEmail: "",
    businessPhone: "",
    businessAddress: "",
    settlementAccountNumber: "",
    settlementBankCode: "",
  });

  // Step 2 — KYB Documents
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, { url: string; name: string }>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  // Step 3 — Directors
  const [directors, setDirectors] = useState<Director[]>([{
    firstName: "", lastName: "", bvn: "", nin: "", phone: "", email: "",
  }]);
  const [bvnResults, setBvnResults] = useState<Record<number, { verified: boolean; name?: string; error?: string }>>({});

  // Step 4 — Velocity Limits
  const [velocityLimits, setVelocityLimits] = useState<VelocityLimitForm[]>([
    { channel: "all", limitType: "per_day", maxCount: "100", maxAmountKobo: "50000000", singleTxMaxKobo: "5000000" },
  ]);

  // Step 5 — Go-Live
  const [goLiveNotes, setGoLiveNotes] = useState("");

  // ─── tRPC mutations ──────────────────────────────────────────────────────────

  const createTenantMutation = trpc.tenantMgmt.create.useMutation();
  const initiateKybMutation = trpc.kybMgmt.initiate.useMutation();
  const uploadKybDocMutation = trpc.kybDocUpload.getUploadUrl.useMutation();
  const verifyBvnMutation = trpc.nibss.verifyBvn.useMutation();
  const setVelocityLimitMutation = trpc.velocityLimits.setLimit.useMutation();

  // Aggregate loading state across all mutations
  const isLoading =
    createTenantMutation.isPending ||
    initiateKybMutation.isPending ||
    uploadKybDocMutation.isPending ||
    verifyBvnMutation.isPending ||
    setVelocityLimitMutation.isPending;

  const goLiveChecklistQuery = trpc.portalHealth.getGoLiveChecklist.useQuery(
    undefined,
    { enabled: !!merchantId && currentStep === 5 }
  );
  // Go-live approval = activating the tenant record
  const activateTenantMutation = trpc.tenantMgmt.update.useMutation();

  // ─── Step 1: Create tenant + initiate KYB ────────────────────────────────────

  const handleStep1Submit = useCallback(async () => {
    if (!businessForm.businessName || !businessForm.rcNumber) {
      toast.error("Business name and RC number are required");
      return;
    }
    try {
      // Create tenant record
      const tenant = await createTenantMutation.mutateAsync({
        id: `ten_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        name: businessForm.businessName,
        slug: businessForm.businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
        email: businessForm.businessEmail,
        phone: businessForm.businessPhone || undefined,
      });
      setMerchantId(tenant.id);

      // Initiate KYB verification
      const kyb = await initiateKybMutation.mutateAsync({
        businessName: businessForm.businessName,
        rcNumber: businessForm.rcNumber,
        taxId: businessForm.taxId || undefined,
        businessType: businessForm.businessType,
        industryCode: businessForm.industryCode,
      });
      setKybVerificationId(kyb.verificationId);

      toast.success("Business registered. Proceeding to document upload.");
      setCurrentStep(2);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create sub-merchant");
    }
  }, [businessForm, createTenantMutation, initiateKybMutation]);

  // ─── Step 2: Document upload ─────────────────────────────────────────────────

  // Keys must match the server's kybDocUpload ALLOWED_DOC_TYPES enum.
  const REQUIRED_DOCS = [
    { key: "cac_certificate", label: "CAC Certificate of Incorporation" },
    { key: "memorandum", label: "Memorandum & Articles of Association" },
    { key: "utility_bill", label: "Utility Bill (≤ 3 months old)" },
    { key: "board_resolution", label: "Board Resolution" },
  ] as const;

  const handleDocUpload = useCallback(async (docKey: (typeof REQUIRED_DOCS)[number]["key"], file: File) => {
    if (!kybVerificationId) return;
    setUploadingDoc(docKey);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadKybDocMutation.mutateAsync({
        verificationId: kybVerificationId,
        merchantId: merchantId ?? "",
        documentType: docKey,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        uploadedBy: "merchant",
        fileContent: base64.includes(",") ? base64.split(",")[1] : base64,
      });
      setUploadedDocs(prev => ({ ...prev, [docKey]: { url: result.fileUrl, name: file.name } }));
      toast.success(`${file.name} uploaded`);
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    } finally {
      setUploadingDoc(null);
    }
  }, [kybVerificationId, uploadKybDocMutation]);

  const allDocsUploaded = REQUIRED_DOCS.every(d => uploadedDocs[d.key]);

  // ─── Step 3: BVN verification ─────────────────────────────────────────────────

  const handleVerifyBvn = useCallback(async (index: number) => {
    const director = directors[index];
    if (!director.bvn || director.bvn.length !== 11) {
      toast.error("BVN must be exactly 11 digits");
      return;
    }
    try {
      const result = await verifyBvnMutation.mutateAsync({
        bvn: director.bvn,
        firstName: director.firstName,
        lastName: director.lastName,
        dateOfBirth: undefined,
      });
      setBvnResults(prev => ({
        ...prev,
        [index]: {
          verified: result.verified,
          name: result.verified ? `${result.firstName ?? ""} ${result.lastName ?? ""}`.trim() : undefined,
          error: !result.verified ? "BVN could not be verified against NIBSS records" : undefined,
        },
      }));
      if (result.verified) toast.success(`Director ${index + 1} BVN verified`);
      else toast.error(`Director ${index + 1} BVN verification failed`);
    } catch (err: any) {
      setBvnResults(prev => ({ ...prev, [index]: { verified: false, error: err.message } }));
      toast.error(`BVN check failed: ${err.message}`);
    }
  }, [directors, verifyBvnMutation]);

  const allDirectorsVerified = directors.length > 0 && directors.every((_, i) => bvnResults[i]?.verified);

  // ─── Step 4: Velocity limits ──────────────────────────────────────────────────

  const handleSetVelocityLimits = useCallback(async () => {
    if (!merchantId) return;
    try {
      for (const limit of velocityLimits) {
        await setVelocityLimitMutation.mutateAsync({
          merchantId,
          channel: limit.channel as any,
          limitType: limit.limitType as any,
          maxCount: limit.maxCount ? parseInt(limit.maxCount) : undefined,
          maxAmountKobo: limit.maxAmountKobo ? parseInt(limit.maxAmountKobo) : undefined,
          singleTxMaxKobo: limit.singleTxMaxKobo ? parseInt(limit.singleTxMaxKobo) : undefined,
          riskTier: "standard",
          reason: "Sub-merchant onboarding default limits",
        });
      }
      toast.success("Velocity limits configured");
      setCurrentStep(5);
    } catch (err: any) {
      toast.error(`Failed to set velocity limits: ${err.message}`);
    }
  }, [merchantId, velocityLimits, setVelocityLimitMutation]);

  // ─── Step 5: Go-live ──────────────────────────────────────────────────────────

  const handleGoLive = useCallback(async () => {
    if (!merchantId) return;
    try {
      await activateTenantMutation.mutateAsync({ id: merchantId, status: "active" });
      toast.success("Sub-merchant is now live! Redirecting to tenant management.");
      setTimeout(() => navigate("/partner-admin"), 2000);
    } catch (err: any) {
      toast.error(`Go-live failed: ${err.message}`);
    }
  }, [merchantId, activateTenantMutation, navigate]);

  // ─── Render ───────────────────────────────────────────────────────────────────

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Sub-Merchant Onboarding</h1>
          <p className="text-muted-foreground mt-1">
            Register and activate a new sub-merchant on the PayGate PSP platform
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isComplete = currentStep > step.id;
              const isCurrent = currentStep === step.id;
              return (
                <div key={step.id} className="flex items-center">
                  <div className={`flex flex-col items-center gap-1 ${i < STEPS.length - 1 ? "mr-2" : ""}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors ${
                      isComplete ? "bg-primary border-primary text-primary-foreground"
                        : isCurrent ? "border-primary text-primary bg-primary/10"
                        : "border-muted text-muted-foreground"
                    }`}>
                      {isComplete ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-xs font-medium hidden sm:block ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-5 ${currentStep > step.id ? "bg-primary" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* ── Step 1: Business Details ── */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Business Details
              </CardTitle>
              <CardDescription>Enter the sub-merchant's legal entity information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Business Name *</Label>
                  <Input
                    placeholder="Acme Payments Ltd"
                    value={businessForm.businessName}
                    onChange={e => setBusinessForm(p => ({ ...p, businessName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>RC Number *</Label>
                  <Input
                    placeholder="RC1234567"
                    value={businessForm.rcNumber}
                    onChange={e => setBusinessForm(p => ({ ...p, rcNumber: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tax Identification Number</Label>
                  <Input
                    placeholder="12345678-0001"
                    value={businessForm.taxId}
                    onChange={e => setBusinessForm(p => ({ ...p, taxId: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Type</Label>
                  <Select
                    value={businessForm.businessType}
                    onValueChange={v => setBusinessForm(p => ({ ...p, businessType: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="limited_liability">Limited Liability Company</SelectItem>
                      <SelectItem value="public_limited">Public Limited Company</SelectItem>
                      <SelectItem value="sole_proprietorship">Sole Proprietorship</SelectItem>
                      <SelectItem value="partnership">Partnership</SelectItem>
                      <SelectItem value="ngo">NGO / Non-Profit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Business Email</Label>
                  <Input
                    type="email"
                    placeholder="ops@acmepayments.ng"
                    value={businessForm.businessEmail}
                    onChange={e => setBusinessForm(p => ({ ...p, businessEmail: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Business Phone</Label>
                  <Input
                    placeholder="+2348012345678"
                    value={businessForm.businessPhone}
                    onChange={e => setBusinessForm(p => ({ ...p, businessPhone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Business Address</Label>
                  <Input
                    placeholder="12 Broad Street, Lagos Island, Lagos"
                    value={businessForm.businessAddress}
                    onChange={e => setBusinessForm(p => ({ ...p, businessAddress: e.target.value }))}
                  />
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium mb-3">Settlement Account</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Account Number</Label>
                    <Input
                      placeholder="0123456789"
                      value={businessForm.settlementAccountNumber}
                      onChange={e => setBusinessForm(p => ({ ...p, settlementAccountNumber: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank Code (CBN)</Label>
                    <Input
                      placeholder="044"
                      value={businessForm.settlementBankCode}
                      onChange={e => setBusinessForm(p => ({ ...p, settlementBankCode: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleStep1Submit}
                  disabled={createTenantMutation.isPending || initiateKybMutation.isPending}
                >
                  {(createTenantMutation.isPending || initiateKybMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Continue to Documents
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: KYB Documents ── */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                KYB Document Upload
              </CardTitle>
              <CardDescription>
                Upload all required documents for CAC and NIBSS verification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {REQUIRED_DOCS.map(doc => {
                const uploaded = uploadedDocs[doc.key];
                const isUploading = uploadingDoc === doc.key;
                return (
                  <div
                    key={doc.key}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      uploaded ? "border-green-500/40 bg-green-50/30 dark:bg-green-950/20"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {uploaded ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                      ) : (
                        <FileText className="w-5 h-5 text-muted-foreground shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium">{doc.label}</p>
                        {uploaded && (
                          <p className="text-xs text-muted-foreground">{uploaded.name}</p>
                        )}
                      </div>
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        disabled={isUploading}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleDocUpload(doc.key, file);
                        }}
                      />
                      <Button variant="outline" size="sm" disabled={isUploading} asChild>
                        <span>
                          {isUploading ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3 mr-1" />
                          )}
                          {uploaded ? "Replace" : "Upload"}
                        </span>
                      </Button>
                    </label>
                  </div>
                );
              })}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={() => setCurrentStep(3)} disabled={!allDocsUploaded}>
                  Continue to Director Verification
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Director BVN Verification ── */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Director BVN Verification
              </CardTitle>
              <CardDescription>
                Verify each director's identity against NIBSS BVN records
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {directors.map((director, i) => (
                <div key={i} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Director {i + 1}</p>
                    {directors.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDirectors(prev => prev.filter((_, idx) => idx !== i));
                          setBvnResults(prev => {
                            const next = { ...prev };
                            delete next[i];
                            return next;
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>First Name</Label>
                      <Input
                        placeholder="Chukwuemeka"
                        value={director.firstName}
                        onChange={e => setDirectors(prev => prev.map((d, idx) => idx === i ? { ...d, firstName: e.target.value } : d))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Last Name</Label>
                      <Input
                        placeholder="Okafor"
                        value={director.lastName}
                        onChange={e => setDirectors(prev => prev.map((d, idx) => idx === i ? { ...d, lastName: e.target.value } : d))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>BVN (11 digits)</Label>
                      <Input
                        placeholder="22345678901"
                        maxLength={11}
                        value={director.bvn}
                        onChange={e => setDirectors(prev => prev.map((d, idx) => idx === i ? { ...d, bvn: e.target.value } : d))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NIN (optional)</Label>
                      <Input
                        placeholder="12345678901"
                        maxLength={11}
                        value={director.nin}
                        onChange={e => setDirectors(prev => prev.map((d, idx) => idx === i ? { ...d, nin: e.target.value } : d))}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVerifyBvn(i)}
                      disabled={verifyBvnMutation.isPending || !director.bvn || !director.firstName}
                    >
                      {verifyBvnMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Shield className="w-3 h-3 mr-1" />
                      )}
                      Verify BVN
                    </Button>
                    {bvnResults[i] && (
                      <Badge variant={bvnResults[i].verified ? "default" : "destructive"}>
                        {bvnResults[i].verified ? `✓ Verified: ${bvnResults[i].name}` : `✗ ${bvnResults[i].error}`}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDirectors(prev => [...prev, { firstName: "", lastName: "", bvn: "", nin: "", phone: "", email: "" }])}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Director
              </Button>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={() => setCurrentStep(4)} disabled={!allDirectorsVerified}>
                  Continue to Velocity Limits
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Velocity Limits ── */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-primary" />
                Velocity Limit Configuration
              </CardTitle>
              <CardDescription>
                Set per-channel transaction limits. These are enforced in real time by the Rust velocity-counter service.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {velocityLimits.map((limit, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Limit Rule {i + 1}</p>
                    {velocityLimits.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVelocityLimits(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <X className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <Select
                        value={limit.channel}
                        onValueChange={v => setVelocityLimits(prev => prev.map((l, idx) => idx === i ? { ...l, channel: v } : l))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Channels</SelectItem>
                          <SelectItem value="nip">NIP Transfer</SelectItem>
                          <SelectItem value="pos">POS</SelectItem>
                          <SelectItem value="ussd">USSD</SelectItem>
                          <SelectItem value="web">Web</SelectItem>
                          <SelectItem value="mobile">Mobile</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Limit Period</Label>
                      <Select
                        value={limit.limitType}
                        onValueChange={v => setVelocityLimits(prev => prev.map((l, idx) => idx === i ? { ...l, limitType: v } : l))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="per_minute">Per Minute</SelectItem>
                          <SelectItem value="per_hour">Per Hour</SelectItem>
                          <SelectItem value="per_day">Per Day</SelectItem>
                          <SelectItem value="per_month">Per Month</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max Transaction Count</Label>
                      <Input
                        type="number"
                        placeholder="100"
                        value={limit.maxCount}
                        onChange={e => setVelocityLimits(prev => prev.map((l, idx) => idx === i ? { ...l, maxCount: e.target.value } : l))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Max Volume (kobo)</Label>
                      <Input
                        type="number"
                        placeholder="50000000"
                        value={limit.maxAmountKobo}
                        onChange={e => setVelocityLimits(prev => prev.map((l, idx) => idx === i ? { ...l, maxAmountKobo: e.target.value } : l))}
                      />
                    </div>
                    <div className="space-y-1.5 col-span-2">
                      <Label>Single Transaction Max (kobo)</Label>
                      <Input
                        type="number"
                        placeholder="5000000"
                        value={limit.singleTxMaxKobo}
                        onChange={e => setVelocityLimits(prev => prev.map((l, idx) => idx === i ? { ...l, singleTxMaxKobo: e.target.value } : l))}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVelocityLimits(prev => [...prev, { channel: "nip", limitType: "per_day", maxCount: "50", maxAmountKobo: "20000000", singleTxMaxKobo: "2000000" }])}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Limit Rule
              </Button>
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(3)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleSetVelocityLimits}
                  disabled={setVelocityLimitMutation.isPending}
                >
                  {setVelocityLimitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Apply Limits & Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 5: Go-Live ── */}
        {currentStep === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                Go-Live Approval
              </CardTitle>
              <CardDescription>
                Review the compliance checklist and activate the sub-merchant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Checklist summary */}
              <div className="space-y-2">
                {[
                  { label: "Business registered in DB", done: !!merchantId },
                  { label: "KYB verification initiated", done: !!kybVerificationId },
                  { label: "Required documents uploaded", done: allDocsUploaded },
                  { label: "All directors BVN-verified", done: allDirectorsVerified },
                  { label: "Velocity limits configured", done: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 p-2.5 rounded-md bg-muted/40">
                    {item.done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm">{item.label}</span>
                    <Badge variant={item.done ? "default" : "secondary"} className="ml-auto text-xs">
                      {item.done ? "Complete" : "Pending"}
                    </Badge>
                  </div>
                ))}
              </div>

              {/* Go-live checklist from tRPC */}
              {goLiveChecklistQuery?.data && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Platform Readiness Checklist</p>
                  {goLiveChecklistQuery.data.goLive.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      {item.status === "ok" ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      )}
                      {item.label}
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Compliance Notes (optional)</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Add any compliance review notes..."
                  value={goLiveNotes}
                  onChange={e => setGoLiveNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setCurrentStep(4)}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={handleGoLive}
                  disabled={!merchantId || !kybVerificationId || !allDocsUploaded || !allDirectorsVerified}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Activate Sub-Merchant
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
