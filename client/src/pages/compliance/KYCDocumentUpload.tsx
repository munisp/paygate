// @ts-nocheck
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, Clock, XCircle, Trash2, Eye } from "lucide-react";

const DOC_TYPES = [
  { value: "cac_certificate", label: "CAC Certificate of Incorporation" },
  { value: "cbn_license", label: "CBN Operating License" },
  { value: "tax_clearance", label: "Tax Clearance Certificate" },
  { value: "utility_bill", label: "Utility Bill (address proof)" },
  { value: "director_id", label: "Director's Government ID" },
  { value: "bank_statement", label: "Bank Statement (6 months)" },
  { value: "audited_accounts", label: "Audited Financial Accounts" },
  { value: "aml_policy", label: "AML/CFT Policy Document" },
  { value: "pci_dss_cert", label: "PCI DSS Certificate" },
  { value: "other", label: "Other Supporting Document" },
];

const statusConfig = {
  pending: { label: "Pending Review", icon: Clock, color: "text-amber-500", badge: "secondary" as const },
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green-500", badge: "default" as const },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-500", badge: "destructive" as const },
};

export default function KYCDocumentUpload() {
  const [docType, setDocType] = useState("");
  const [docName, setDocName] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs, refetch, isLoading } = trpc.wave223.kycDocuments.list.useQuery();

  const uploadMutation = trpc.wave223.kycDocuments.upload.useMutation({
    onSuccess: () => { toast.success("Document uploaded for review."); setDocType(""); setDocName(""); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.wave223.kycDocuments.delete.useMutation({
    onSuccess: () => { toast.success("Document removed."); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const handleUpload = async () => {
    if (!docType || !docName) { toast.error("Select document type and enter a name."); return; }
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Select a file to upload."); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("File must be under 10 MB."); return; }

    setUploading(true);
    try {
      // Convert file to base64 for upload via tRPC
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(",")[1];
        await uploadMutation.mutateAsync({
          documentType: docType as any,
          documentName: docName,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          fileBase64: base64,
        });
        if (fileRef.current) fileRef.current.value = "";
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  const pendingCount = docs?.filter((d) => d.status === "pending").length ?? 0;
  const approvedCount = docs?.filter((d) => d.status === "approved").length ?? 0;
  const rejectedCount = docs?.filter((d) => d.status === "rejected").length ?? 0;

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">KYC Document Upload</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload compliance documents for merchant verification and regulatory review</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending Review", value: pendingCount, color: "text-amber-500" },
          { label: "Approved", value: approvedCount, color: "text-green-500" },
          { label: "Rejected", value: rejectedCount, color: "text-red-500" },
        ].map((s) => (
          <Card key={s.label} className="border-0 bg-muted/40">
            <CardContent className="p-4">
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Upload form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Upload New Document</CardTitle>
          <CardDescription>Accepted formats: PDF, JPG, PNG, DOCX (max 10 MB)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input placeholder="e.g. CAC Certificate 2024" value={docName} onChange={(e) => setDocName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.docx" />
            </div>
          </div>
          <Button className="mt-4 gap-2" onClick={handleUpload} disabled={uploading || uploadMutation.isPending}>
            <Upload className="h-4 w-4" />
            {uploading || uploadMutation.isPending ? "Uploading…" : "Upload Document"}
          </Button>
        </CardContent>
      </Card>

      {/* Document list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {!docs?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {docs.map((doc) => {
                const cfg = statusConfig[doc.status as keyof typeof statusConfig] ?? statusConfig.pending;
                const Icon = cfg.icon;
                return (
                  <div key={doc.id} className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="p-2 bg-muted rounded-lg">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.documentName}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {doc.documentType?.replace(/_/g, ' ')} · {doc.fileName} · {doc.fileSize ? `${(doc.fileSize / 1024).toFixed(0)} KB` : ""}
                      </p>
                      {doc.reviewNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">"{doc.reviewNotes}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${cfg.color}`} />
                      <Badge variant={cfg.badge}>{cfg.label}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : ""}
                    </span>
                    <div className="flex gap-1">
                      {doc.fileUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"><Eye className="h-4 w-4" /></a>
                        </Button>
                      )}
                      {doc.status === "pending" && (
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate({ id: doc.id })} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
