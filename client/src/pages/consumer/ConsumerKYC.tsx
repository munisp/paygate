/**
 * Consumer KYC (Consumer) - Wave 68
 * Submit BVN/NIN for identity verification via Youverify.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Clock, CheckCircle, XCircle, Loader2, Upload } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

const STATUS_CONFIG = {
  pending: { label: "Pending Review", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: Clock },
  approved: { label: "Verified", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", icon: CheckCircle },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function ConsumerKYC() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bvn, setBvn] = useState("");
  const [nin, setNin] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [idDocUrl, setIdDocUrl] = useState("");

  const utils = trpc.useUtils();
  const { data: kyc, isLoading } = trpc.consumerKyc.status.useQuery(undefined, { staleTime: 60_000 });
  const kycStatus = (kyc as any)?.status as keyof typeof STATUS_CONFIG | undefined;

  const submit = trpc.consumerKyc.submit.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.status === "approved" ? "KYC Approved! You are now verified." : "KYC submitted for review.");
      utils.consumerKyc.status.invalidate();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!firstName || !lastName) { toast.error("First and last name are required"); return; }
    if (!bvn && !nin) { toast.error("BVN or NIN is required"); return; }
    if (bvn && !/^\d{11}$/.test(bvn)) { toast.error("BVN must be 11 digits"); return; }
    if (nin && !/^\d{11}$/.test(nin)) { toast.error("NIN must be 11 digits"); return; }
    submit.mutate({ firstName, lastName, bvn: bvn || undefined, nin: nin || undefined, selfieUrl: selfieUrl || undefined, idDocUrl: idDocUrl || undefined });
  };

  if (isLoading) return <div className="p-4"><Skeleton className="h-48 rounded-2xl" /></div>;

  const statusCfg = kycStatus ? STATUS_CONFIG[kycStatus] : null;
  const StatusIcon = statusCfg?.icon;

  if (!isLoading && !kyc) {
    return (
      <div className="p-6">
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/consumer")}><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-lg font-semibold">Identity Verification</h1>
      </div>

      {kycStatus && statusCfg && (
        <Card className={statusCfg.color.replace("text-", "border-").split(" ")[0]}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              {StatusIcon && <StatusIcon className="w-5 h-5 shrink-0" />}
              <div>
                <p className="font-semibold">{statusCfg.label}</p>
                {kycStatus === "approved" && <p className="text-xs mt-0.5">Your identity has been verified. You can now issue virtual cards.</p>}
                {kycStatus === "pending" && <p className="text-xs mt-0.5">Your documents are under review. This usually takes 1-2 business days.</p>}
                {kycStatus === "rejected" && <p className="text-xs mt-0.5">Verification failed. Please resubmit with correct information.</p>}
              </div>
              <Badge className={`ml-auto shrink-0 ${statusCfg.color}`}>{statusCfg.label}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {(kycStatus !== "approved") && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <p className="text-sm font-medium">Submit KYC Documents</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input placeholder="John" value={firstName} onChange={e => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input placeholder="Doe" value={lastName} onChange={e => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>BVN (11 digits)</Label>
              <Input placeholder="Bank Verification Number" maxLength={11} value={bvn} onChange={e => setBvn(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>NIN (11 digits, optional if BVN provided)</Label>
              <Input placeholder="National Identification Number" maxLength={11} value={nin} onChange={e => setNin(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <Label>Selfie URL (optional)</Label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={selfieUrl} onChange={e => setSelfieUrl(e.target.value)} />
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => toast.info("Upload selfie to your storage and paste the URL here")}>
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>ID Document URL (optional)</Label>
              <div className="flex gap-2">
                <Input placeholder="https://..." value={idDocUrl} onChange={e => setIdDocUrl(e.target.value)} />
                <Button variant="outline" size="icon" className="shrink-0" onClick={() => toast.info("Upload your ID document and paste the URL here")}>
                  <Upload className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Submit for Verification
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Your data is encrypted and processed securely via Youverify.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
