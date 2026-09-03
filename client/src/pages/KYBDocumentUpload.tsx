import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload, FileText, CheckCircle2, XCircle, Clock, AlertCircle,
  Eye, Trash2, RefreshCw, Shield
} from "lucide-react";

const DOC_TYPES = [
  { value: "cac_certificate", label: "CAC Certificate", required: true },
  { value: "memorandum", label: "Memorandum & Articles", required: true },
  { value: "directors_id", label: "Directors' ID", required: true },
  { value: "proof_of_address", label: "Proof of Address", required: true },
  { value: "bank_statement", label: "Bank Statement (6 months)", required: true },
  { value: "tax_clearance", label: "Tax Clearance Certificate", required: false },
  { value: "audited_accounts", label: "Audited Accounts", required: false },
  { value: "board_resolution", label: "Board Resolution", required: false },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending Review", color: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30", icon: Clock },
  verified: { label: "Verified", color: "bg-green-500/10 text-green-700 border-green-500/30", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  uploaded: { label: "Uploaded", color: "bg-blue-500/10 text-blue-700 border-blue-500/30", icon: FileText },
};

function DropZone({
  docType,
  onFilesSelected,
  uploading,
}: {
  docType: string;
  onFilesSelected: (files: File[], docType: string) => void;
  uploading: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf" || f.type.startsWith("image/")
      );
      if (files.length) onFilesSelected(files, docType);
    },
    [docType, onFilesSelected]
  );

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
      } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFilesSelected(files, docType);
          e.target.value = "";
        }}
      />
      <Upload className="h-6 w-6 mx-auto mb-1 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">
        {uploading ? "Uploading..." : "Drop files here or click to browse"}
      </p>
      <p className="text-xs text-muted-foreground/60 mt-0.5">PDF or images, max 10MB each</p>
    </div>
  );
}

export default function KYBDocumentUpload() {
  const { user } = useAuth();
  const merchantId = (user as any)?.merchant?.id ?? "demo-merchant";
  const verificationId = (user as any)?.merchant?.verificationId ?? merchantId;
  const [selectedDocType, setSelectedDocType] = useState("cac_certificate");
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [viewDoc, setViewDoc] = useState<any>(null);

  const utils = trpc.useUtils();

  const { data: documentsData, isLoading } = trpc.kybDocUpload.listDocuments.useQuery({ verificationId }, { staleTime: 30_000 });
  const { data: progressData } = trpc.kybDocUpload.getVerificationProgress.useQuery({ verificationId }, { staleTime: 30_000 });

  const getUploadUrl = trpc.kybDocUpload.getUploadUrl.useMutation({
    onError: (e: any) => { toast.error(e.message); setUploadingType(null); setUploadProgress(0); },
  });

  const deleteDoc = trpc.kybDocUpload.deleteDocument.useMutation({
    onSuccess: () => {
      toast.success("Document removed");
      utils.kybDocUpload.listDocuments.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // resubmitForReview not available; using reviewDocument for admin review
  const reviewDoc = trpc.kybDocUpload.reviewDocument.useMutation({
    onSuccess: () => { toast.success("Document reviewed"); utils.kybDocUpload.listDocuments.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleFilesSelected = async (files: File[], docType: string) => {
    const file = files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    setUploadingType(docType);
    setUploadProgress(20);

    // Convert to base64 for upload
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      setUploadProgress(60);
      getUploadUrl.mutate({
        verificationId,
        documentType: docType as any,
        fileName: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
        fileContent: base64,
      }, {
        onSuccess: () => {
          toast.success("Document uploaded successfully");
          utils.kybDocUpload.listDocuments.invalidate();
          setUploadingType(null);
          setUploadProgress(0);
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const documents = (documentsData as any)?.checklist?.flatMap((c: any) => c.allVersions ?? []) ?? [];
  const checklist = (documentsData as any)?.checklist ?? [];
  const completedCount = checklist.filter((c: any) => c.status === "verified").length;
  const requiredCount = checklist.filter((c: any) => c.required).length || DOC_TYPES.filter((d) => d.required).length;
  const overallProgress = requiredCount > 0 ? Math.round((completedCount / requiredCount) * 100) : 0;

  const getDocForType = (docType: string) =>
    checklist.filter((c: any) => c.documentType === docType).flatMap((c: any) => c.allVersions ?? []);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            KYB Document Upload
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload required business verification documents
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Please contact support to resubmit for review")}
          disabled={false}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Resubmit for Review
        </Button>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Verification Progress</span>
            <span className="text-sm text-muted-foreground">
              {completedCount} / {requiredCount} required documents verified
            </span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
              const count = checklist.flatMap((c: any) => c.allVersions ?? []).filter((d: any) => d.status === key).length ?? 0;
              if (!count) return null;
              return (
                <span key={key} className="flex items-center gap-1">
                  <cfg.icon className="h-3 w-3" />
                  {count} {cfg.label}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Document Checklist */}
      <div className="grid gap-4">
        {DOC_TYPES.map((docType) => {
          const docs = getDocForType(docType.value);
          const latestDoc = docs[docs.length - 1];
          const statusCfg = latestDoc ? STATUS_CONFIG[latestDoc.status] : null;
          const isUploading = uploadingType === docType.value;

          return (
            <Card key={docType.value} className={latestDoc?.status === "verified" ? "border-green-500/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{docType.label}</span>
                      {docType.required && (
                        <Badge variant="outline" className="text-xs h-5">Required</Badge>
                      )}
                      {statusCfg && (
                        <Badge className={`text-xs h-5 border ${statusCfg.color}`}>
                          <statusCfg.icon className="h-3 w-3 mr-1" />
                          {statusCfg.label}
                        </Badge>
                      )}
                    </div>

                    {latestDoc?.rejectionReason && (
                      <div className="flex items-start gap-1 text-xs text-destructive mb-2">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        {latestDoc.rejectionReason}
                      </div>
                    )}

                    {docs.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {docs.map((doc: any) => (
                          <div key={doc.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" />
                            <span className="truncate max-w-xs">{doc.fileName}</span>
                            <span className="text-muted-foreground/60">
                              {new Date(doc.uploadedAt).toLocaleDateString()}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5"
                              onClick={() => setViewDoc(doc)}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            {doc.status !== "verified" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 text-destructive"
                                aria-label="Delete" onClick={() => deleteDoc.mutate({ documentId: doc.id })}
                              ><Trash2/>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {isUploading && (
                      <div className="mb-2">
                        <Progress value={uploadProgress} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">Uploading to secure storage...</p>
                      </div>
                    )}

                    {latestDoc?.status !== "verified" && (
                      <DropZone
                        docType={docType.value}
                        onFilesSelected={handleFilesSelected}
                        uploading={isUploading}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* View Document Dialog */}
      <Dialog open={!!viewDoc} onOpenChange={() => setViewDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewDoc?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Type:</span> {viewDoc?.docType}</div>
              <div><span className="text-muted-foreground">Status:</span> {viewDoc?.status}</div>
              <div><span className="text-muted-foreground">Uploaded:</span> {viewDoc && new Date(viewDoc.uploadedAt).toLocaleString()}</div>
              <div><span className="text-muted-foreground">Size:</span> {viewDoc?.fileSizeBytes ? `${Math.round(viewDoc.fileSizeBytes / 1024)} KB` : "—"}</div>
            </div>
            {viewDoc?.fileUrl && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(viewDoc.fileUrl, "_blank")}
              >
                <Eye className="h-4 w-4 mr-2" /> Open Document
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDoc(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
