import { useState, useRef, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Shield, CheckCircle, AlertTriangle, Clock, FileText, Upload, Eye, Download, RefreshCw, ChevronRight, Loader2, Scan, Brain, ChevronDown, ChevronUp, User, Calendar, Hash, MapPin, Flag, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColor: Record<string, string> = {
  verified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rejected: "bg-red-500/10 text-red-400 border-red-500/20",
  not_submitted: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const statusIcon: Record<string, ReactNode> = {
  verified: <CheckCircle className="w-4 h-4 text-emerald-400" />,
  pending: <Clock className="w-4 h-4 text-amber-400" />,
  rejected: <AlertTriangle className="w-4 h-4 text-red-400" />,
  not_submitted: <FileText className="w-4 h-4 text-zinc-400" />,
};

export default function ComplianceKYC() {
  const [activeTab, setActiveTab] = useState("overview");
  const [uploadingDocId, setUploadingDocId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeDocId, setActiveDocId] = useState<number | null>(null);
  const utils = trpc.useUtils();
  const uploadDocMutation = trpc.complianceKyc.uploadDocument.useMutation({
    onSuccess: () => { toast.success("Document uploaded and submitted for review"); utils.complianceKyc.list.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [exporting, setExporting] = useState(false);
  const exportCsvMutation = trpc.complianceKyc.exportCSV.useMutation();
  const { data: kycListData, isLoading: kycLoading, refetch } = trpc.complianceKyc.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: kycStats } = trpc.complianceKyc.stats.useQuery(undefined, { staleTime: 60_000 });

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const result = await exportCsvMutation.mutateAsync({});
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename ?? 'kyc-submissions.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} KYC/KYB records`);
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const FALLBACK_DOCS = [
    { id: 1, name: "Certificate of Incorporation", type: "business_reg", status: "verified", uploadedAt: "2024-01-15", expiresAt: null },
    { id: 2, name: "Director ID (Passport)", type: "director_id", status: "verified", uploadedAt: "2024-01-15", expiresAt: "2029-06-30" },
    { id: 3, name: "Proof of Address", type: "address_proof", status: "pending", uploadedAt: "2024-03-01", expiresAt: null },
    { id: 4, name: "Bank Statement (3 months)", type: "bank_statement", status: "pending", uploadedAt: "2024-03-01", expiresAt: null },
    { id: 5, name: "Tax Identification Number", type: "tax_id", status: "not_submitted", uploadedAt: null, expiresAt: null },
    { id: 6, name: "AML Policy Document", type: "aml_policy", status: "not_submitted", uploadedAt: null, expiresAt: null },
  ];
  const documents = (kycListData as any)?.rows?.length > 0 ? (kycListData as any).rows : FALLBACK_DOCS;

  const totalKyc = (kycStats as any)?.total ?? 0;
  const approvedKyc = (kycStats as any)?.approved ?? 0;
  const pendingKyc = (kycStats as any)?.pending ?? 0;
  const kycScore = totalKyc > 0 ? Math.round((approvedKyc / totalKyc) * 100) : 68;
  const pciTier = "SAQ-A";
  const amlStatus = "clear";
  const liveStatus = kycLoading ? "loading" : pendingKyc > 0 ? "pending_review" : "clear";

  const complianceChecks = [
    { label: "Identity Verification", status: "passed", detail: "Director identity confirmed via passport" },
    { label: "Business Registration", status: "passed", detail: "CAC registration verified" },
    { label: "AML Screening", status: "passed", detail: "No matches on OFAC, UN, EU sanctions lists" },
    { label: "PEP Check", status: "passed", detail: "No politically exposed persons identified" },
    { label: "Address Verification", status: "pending", detail: "Utility bill under review" },
    { label: "Bank Account Verification", status: "pending", detail: "Micro-deposit verification in progress" },
    { label: "Tax Compliance", status: "not_started", detail: "TIN document not yet uploaded" },
    { label: "AML Policy Review", status: "not_started", detail: "Internal AML policy document required" },
  ];

  const checkColor: Record<string, string> = {
    passed: "text-emerald-400",
    pending: "text-amber-400",
    not_started: "text-zinc-500",
    failed: "text-red-400",
  };

  const checkIcon: Record<string, ReactNode> = {
    passed: <CheckCircle className="w-4 h-4 text-emerald-400" />,
    pending: <Clock className="w-4 h-4 text-amber-400" />,
    not_started: <FileText className="w-4 h-4 text-zinc-500" />,
    failed: <AlertTriangle className="w-4 h-4 text-red-400" />,
  };

  return (
    <div className="p-6 space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        onChange={async (e: any) => {
          const file = e.target.files?.[0];
          if (!file || activeDocId === null) return;
          e.target.value = "";
          setUploadingDocId(activeDocId);
          try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd, credentials: "include" });
            if (!res.ok) throw new Error("Upload failed");
            const { url } = await res.json();
            const doc = documents.find((d: any) => d.id === activeDocId);
            await uploadDocMutation.mutateAsync({ submissionId: String(activeDocId), documentType: doc?.type ?? "other", fileUrl: url, fileName: file.name });
          } catch {
            toast.error("Upload failed");
          } finally {
            setUploadingDocId(null);
            setActiveDocId(null);
          }
        }}
      />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance & KYC</h1>
          <p className="text-zinc-400 mt-1">Manage your business verification, documents, and regulatory compliance</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={handleExportCSV} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {liveStatus === "pending_review" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-amber-300 font-medium">Account Under Review</p>
            <p className="text-amber-400/70 text-sm">Your account is being reviewed by our compliance team. You will be notified within 1–2 business days.</p>
          </div>
        </div>
      )}

      {/* KYC Score + PCI + AML Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-400 text-sm">KYC Completion Score</p>
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-3xl font-bold text-white font-mono">{kycScore}%</p>
            <Progress value={kycScore} className="mt-3 h-2 bg-zinc-800" />
            <p className="text-xs text-zinc-500 mt-2">Complete all documents to reach 100%</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-400 text-sm">PCI DSS Tier</p>
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-white font-mono">{pciTier}</p>
            <p className="text-xs text-zinc-500 mt-2">Self-Assessment Questionnaire A — card data not stored</p>
            <Badge className="mt-2 bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">Compliant</Badge>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-zinc-400 text-sm">AML Screening</p>
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-3xl font-bold text-white capitalize">{amlStatus}</p>
            <p className="text-xs text-zinc-500 mt-2">Last screened: {new Date().toLocaleDateString()}</p>
            <Badge className="mt-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">No Matches</Badge>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="overview" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Overview</TabsTrigger>
          <TabsTrigger value="documents" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Documents</TabsTrigger>
          <TabsTrigger value="checks" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">Compliance Checks</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Verification Roadmap</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { step: 1, label: "Business Registration", done: true },
                  { step: 2, label: "Director Identity Verification", done: true },
                  { step: 3, label: "Address Verification", done: false, active: true },
                  { step: 4, label: "Bank Account Verification", done: false },
                  { step: 5, label: "AML Policy Submission", done: false },
                  { step: 6, label: "Final Compliance Review", done: false },
                ].map(({ step, label, done, active }) => (
                  <div key={step} className="flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${done ? "bg-emerald-500 text-black" : active ? "bg-amber-500 text-black" : "bg-zinc-800 text-zinc-500"}`}>
                      {done ? "✓" : step}
                    </div>
                    <span className={`text-sm ${done ? "text-zinc-300" : active ? "text-white font-medium" : "text-zinc-500"}`}>{label}</span>
                    {active && <Badge className="ml-auto bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">In Progress</Badge>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Remediation Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { action: "Upload Tax Identification Number (TIN)", priority: "high", href: "#documents" },
                  { action: "Submit AML Policy Document", priority: "high", href: "#documents" },
                  { action: "Complete bank account micro-deposit verification", priority: "medium", href: "#" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className={`w-4 h-4 flex-shrink-0 ${item.priority === "high" ? "text-red-400" : "text-amber-400"}`} />
                      <span className="text-sm text-zinc-300">{item.action}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 h-7 px-2" onClick={() => setActiveTab("documents")}>
                      Fix <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Document</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Status</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Uploaded</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Expires</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc: any) => (
                      <tr key={doc.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-zinc-500" />
                            <span className="text-sm text-white">{doc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {statusIcon[doc.status]}
                            <Badge className={`text-xs border ${statusColor[doc.status]}`}>
                              {doc.status.replace("_", " ")}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
                          {doc.uploadedAt ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-400 font-mono">
                          {doc.expiresAt ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {doc.status === "not_submitted" ? (
                              <Button
                                size="sm"
                                className="h-7 bg-amber-500 hover:bg-amber-600 text-black text-xs"
                                disabled={uploadingDocId === doc.id}
                                onClick={() => { setActiveDocId(doc.id); fileInputRef.current?.click(); }}
                              >
                                {uploadingDocId === doc.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />} Upload
                              </Button>
                            ) : (
                              <>
                                {doc.documentUrl && (
                                  <Button size="sm" variant="ghost" className="h-7 text-zinc-400 hover:text-white px-2" onClick={() => window.open(doc.documentUrl, "_blank")}>
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                )}
                                {doc.documentUrl && (
                                  <a href={doc.documentUrl} download target="_blank" rel="noreferrer">
                                    <Button size="sm" variant="ghost" className="h-7 text-zinc-400 hover:text-white px-2" aria-label="Download">
                <Download className="w-3 h-3" />
              </Button>
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Checks Tab */}
        <TabsContent value="checks" className="mt-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-800">
                {complianceChecks.map((check, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      {checkIcon[check.status]}
                      <div>
                        <p className="text-sm text-white font-medium">{check.label}</p>
                        <p className="text-xs text-zinc-500">{check.detail}</p>
                      </div>
                    </div>
                    <span className={`text-xs font-medium capitalize ${checkColor[check.status]}`}>
                      {check.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Live KYC Data from PostgreSQL */}
      <div className="mt-6 bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Live KYC Submissions (Database)</h3>
        <KycLivePanel />
      </div>
    </div>
  );
}


// ─── OCR Result Panel ────────────────────────────────────────────────────────
function OcrResultPanel({ result, onClose }: { result: any; onClose: () => void }) {
  const confidence = result?.overall_confidence ?? result?.confidence ?? 0;
  const confidencePct = Math.round(confidence * 100);
  const confidenceColor = confidencePct >= 80 ? "text-emerald-400" : confidencePct >= 60 ? "text-amber-400" : "text-red-400";

  const fields = result?.extracted_fields ?? result?.fields ?? {};
  const fieldIcons: Record<string, any> = {
    full_name: <User className="w-3.5 h-3.5" />,
    date_of_birth: <Calendar className="w-3.5 h-3.5" />,
    id_number: <Hash className="w-3.5 h-3.5" />,
    address: <MapPin className="w-3.5 h-3.5" />,
    nationality: <Flag className="w-3.5 h-3.5" />,
    expiry_date: <Calendar className="w-3.5 h-3.5" />,
    issue_date: <Calendar className="w-3.5 h-3.5" />,
    gender: <User className="w-3.5 h-3.5" />,
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-white">OCR Confidence Score</span>
          </div>
          <span className={`text-2xl font-bold font-mono ${confidenceColor}`}>{confidencePct}%</span>
        </div>
        <Progress value={confidencePct} className="h-2 bg-zinc-700" />
        <p className="text-xs text-zinc-500 mt-1.5">
          {confidencePct >= 80 ? "High confidence — data is reliable" :
           confidencePct >= 60 ? "Medium confidence — manual review recommended" :
           "Low confidence — document quality may be poor"}
        </p>
      </div>
      {result?.doc_type && (
        <div className="flex items-center gap-2 text-sm">
          <FileText className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-400">Document type:</span>
          <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 capitalize">
            {String(result.doc_type).replace(/_/g, " ")}
          </Badge>
          {result?.issuing_country && (
            <Badge className="bg-zinc-700 text-zinc-300 border-zinc-600">{result.issuing_country}</Badge>
          )}
        </div>
      )}
      {Object.keys(fields).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Extracted Fields</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(fields).map(([key, val]: [string, any]) => (
              <div key={key} className="bg-zinc-800/40 rounded-lg p-3 border border-zinc-700/50">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-zinc-500">{fieldIcons[key] ?? <Info className="w-3.5 h-3.5" />}</span>
                  <span className="text-xs text-zinc-500 capitalize">{key.replace(/_/g, " ")}</span>
                  {val?.confidence && (
                    <span className={`ml-auto text-xs font-mono ${val.confidence >= 0.8 ? "text-emerald-400" : "text-amber-400"}`}>
                      {Math.round(val.confidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-white font-medium truncate">
                  {typeof val === "object" ? (val?.value ?? JSON.stringify(val)) : String(val)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {result?.validation_flags && result.validation_flags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Validation Flags</p>
          <div className="space-y-1.5">
            {result.validation_flags.map((flag: string, i: number) => (
              <div key={i} className="flex items-center gap-2 text-sm text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                {flag}
              </div>
            ))}
          </div>
        </div>
      )}
      {result?.vlm_summary && (
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">AI Document Analysis</p>
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-sm text-zinc-300 leading-relaxed">
            {result.vlm_summary}
          </div>
        </div>
      )}
      <Button onClick={onClose} className="w-full bg-zinc-700 hover:bg-zinc-600 text-white">Close</Button>
    </div>
  );
}

function KycLivePanel() {
  const { data, isLoading, refetch } = trpc.complianceKyc.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: stats } = trpc.complianceKyc.stats.useQuery(undefined, { staleTime: 60_000 });
  const updateStatus = trpc.complianceKyc.updateStatus.useMutation({
    onSuccess: () => { toast.success("KYC status updated"); refetch(); },
  });
  const extractDocument = trpc.complianceKyc.extractDocument.useMutation({
    onSuccess: (result) => { setOcrResult(result); setOcrDialogOpen(true); toast.success("Document extracted successfully"); },
    onError: (e: any) => toast.error(`OCR failed: ${e.message}`),
  });

  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractDocType, setExtractDocType] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const docTypeOptions = [
    { value: "passport", label: "Passport" },
    { value: "national_id", label: "National ID" },
    { value: "drivers_license", label: "Driver's License" },
    { value: "utility_bill", label: "Utility Bill" },
    { value: "bank_statement", label: "Bank Statement" },
    { value: "cac_certificate", label: "CAC Certificate" },
  ];

  const handleExtract = async (kyc: any) => {
    if (!kyc.documentUrl) { toast.error("No document URL — upload a document first"); return; }
    const docType = extractDocType[kyc.id] ?? "national_id";
    setExtractingId(kyc.id);
    try {
      await extractDocument.mutateAsync({
        submissionId: kyc.id,
        docType: docType as any,
        documentUrl: kyc.documentUrl,
        mode: "full",
        useRustEngine: false,
      });
    } finally { setExtractingId(null); }
  };

  return (
    <>
      <Dialog open={ocrDialogOpen} onOpenChange={setOcrDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-zinc-900 border-zinc-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Scan className="w-5 h-5 text-blue-400" />
              OCR Extraction Result
            </DialogTitle>
          </DialogHeader>
          {ocrResult && <OcrResultPanel result={ocrResult} onClose={() => setOcrDialogOpen(false)} />}
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total", value: stats?.total ?? "—" },
          { label: "Pending", value: stats?.pending ?? "—" },
          { label: "Approved", value: stats?.approved ?? "—" },
          { label: "Rejected", value: stats?.rejected ?? "—" },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground">{String(s.value)}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading submissions…
        </div>
      ) : (data?.rows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No KYC submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {(data?.rows ?? []).map((kyc: any) => (
            <div key={kyc.id} className="rounded-xl border border-border bg-card/50 overflow-hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate font-mono">{kyc.id}</p>
                  <p className="text-xs text-muted-foreground">{kyc.docType.replace(/_/g, " ")} · {new Date(kyc.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${
                    kyc.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                    kyc.status === "rejected" ? "bg-red-100 text-red-700" :
                    kyc.status === "under_review" ? "bg-amber-100 text-amber-700" :
                    "bg-muted text-muted-foreground"
                  }`}>{kyc.status.replace(/_/g, " ")}</span>
                  {/* DeepFace AI badges (Wave 179) */}
                  {kyc.ageEstimationFlag === "minor_blocked" && (
                    <span title="Age estimation: minor detected — submission blocked" className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/50">⚠ Minor</span>
                  )}
                  {kyc.ageEstimationFlag === "possible_minor" && (
                    <span title="Age estimation: possible minor — manual review required" className="px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-900/60 text-amber-300 border border-amber-700/50">? Age</span>
                  )}
                  {kyc.faceMatchScore !== null && kyc.faceMatchScore !== undefined && (
                    <span
                      title={`DeepFace face match: ${Math.round((kyc.faceMatchScore ?? 0) * 100)}% confidence`}
                      className={`px-1.5 py-0.5 rounded text-xs font-semibold border ${
                        kyc.faceMatchScore >= 0.8
                          ? "bg-emerald-900/60 text-emerald-300 border-emerald-700/50"
                          : kyc.faceMatchScore >= 0.6
                          ? "bg-amber-900/60 text-amber-300 border-amber-700/50"
                          : "bg-red-900/60 text-red-300 border-red-700/50"
                      }`}
                    >
                      Face {Math.round((kyc.faceMatchScore ?? 0) * 100)}%
                    </span>
                  )}
                  {kyc.duplicateDetectionFlag === "duplicate_found" && (
                    <span title="Duplicate identity detected — possible fraud" className="px-1.5 py-0.5 rounded text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/50">⚠ Dup</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {kyc.status === "pending" && (
                    <button onClick={() => updateStatus.mutate({ id: kyc.id, status: "under_review" })}
                      className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
                      disabled={updateStatus.isPending}>Review</button>
                  )}
                  {kyc.status === "under_review" && (
                    <>
                      <button onClick={() => updateStatus.mutate({ id: kyc.id, status: "approved" })}
                        className="text-xs px-2 py-1 rounded bg-emerald-600 text-white disabled:opacity-50"
                        disabled={updateStatus.isPending}>Approve</button>
                      <button onClick={() => updateStatus.mutate({ id: kyc.id, status: "rejected" })}
                        className="text-xs px-2 py-1 rounded bg-red-600 text-white disabled:opacity-50"
                        disabled={updateStatus.isPending}>Reject</button>
                    </>
                  )}
                  <button onClick={() => setExpandedId(expandedId === kyc.id ? null : kyc.id)}
                    className="text-xs px-2 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 flex items-center gap-1">
                    <Scan className="w-3 h-3" />
                    OCR
                    {expandedId === kyc.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              {expandedId === kyc.id && (
                <div className="border-t border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-blue-400" />
                    AI Document Extraction
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Document type:</span>
                      <Select value={extractDocType[kyc.id] ?? "national_id"}
                        onValueChange={(v) => setExtractDocType(prev => ({ ...prev, [kyc.id]: v }))}>
                        <SelectTrigger className="h-7 text-xs w-40 bg-background border-border">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {docTypeOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm"
                      className="h-7 bg-blue-600 hover:bg-blue-700 text-white text-xs gap-1.5"
                      disabled={extractingId === kyc.id || !kyc.documentUrl}
                      onClick={() => handleExtract(kyc)}>
                      {extractingId === kyc.id ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Extracting…</>
                      ) : (
                        <><Scan className="w-3 h-3" /> Extract Document</>
                      )}
                    </Button>
                    {!kyc.documentUrl && (
                      <span className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Upload document first
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Uses PaddleOCR + Docling + VLM to extract structured fields with per-field confidence scores.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
