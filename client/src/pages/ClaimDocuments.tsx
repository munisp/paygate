/**
 * ClaimDocuments.tsx
 *
 * Insurance claim document management — upload and list documents
 * attached to insurance claims. Uses trpc.claimDocuments router.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileUp, FileText, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";

export default function ClaimDocuments() {
  const [claimId, setClaimId] = useState("");
  const [searchClaimId, setSearchClaimId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("evidence");
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, isError, refetch } = trpc.claimDocuments.listDocuments.useQuery(
    { claimId: searchClaimId, limit: 50, offset: 0 },
    { enabled: !!searchClaimId }
  );

  const uploadDocument = trpc.claimDocuments.uploadDocument.useMutation({
    onSuccess: () => {
      toast.success("Document uploaded successfully");
      setFile(null);
      setUploading(false);
      if (searchClaimId === claimId) refetch();
    },
    onError: (err) => { toast.error(err.message); setUploading(false); },
  });

  const handleUpload = async () => {
    if (!claimId.trim()) { toast.error("Enter a claim ID"); return; }
    if (!file) { toast.error("Select a file to upload"); return; }
    setUploading(true);
    // Convert file to base64 for upload
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string)?.split(",")[1] ?? "";
      uploadDocument.mutate({
        claimId,
        documentType: docType,
        fileName: file.name,
        fileBase64: base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const docTypeColor = (t: string) => {
    if (t === "evidence") return "bg-blue-100 text-blue-800";
    if (t === "medical") return "bg-green-100 text-green-800";
    if (t === "police_report") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-teal-600" /> Claim Documents
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Upload and manage documents for insurance claims</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={!searchClaimId}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upload Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-teal-500" /> Upload Document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Claim ID</Label>
              <Input
                placeholder="e.g. CLM-2024-001"
                value={claimId}
                onChange={e => setClaimId(e.target.value)}
              />
            </div>
            <div>
              <Label>Document Type</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={docType}
                onChange={e => setDocType(e.target.value)}
              >
                <option value="evidence">Evidence</option>
                <option value="medical">Medical Report</option>
                <option value="police_report">Police Report</option>
                <option value="invoice">Invoice</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label>File</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground mt-1">PDF, images, or Word documents (max 10MB)</p>
            </div>
            <Button
              className="w-full"
              onClick={handleUpload}
              disabled={uploading || uploadDocument.isPending}
            >
              <FileUp className="w-4 h-4 mr-2" />
              {uploading ? "Uploading…" : "Upload Document"}
            </Button>
          </CardContent>
        </Card>

        {/* Search & List Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Search Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter Claim ID to search…"
                value={searchClaimId}
                onChange={e => setSearchClaimId(e.target.value)}
              />
              <Button variant="outline" onClick={() => refetch()}>Search</Button>
            </div>

            {isError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="w-4 h-4" /> Failed to load documents.
              </div>
            )}

            {isLoading && searchClaimId ? (
              <div className="text-muted-foreground text-sm py-4 text-center">Loading documents…</div>
            ) : data?.documents?.length ? (
              <div className="space-y-2">
                {data.documents.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{doc.fileName ?? doc.filename ?? "Document"}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={docTypeColor(doc.documentType ?? doc.type ?? "other")}>
                        {doc.documentType ?? doc.type ?? "other"}
                      </Badge>
                      {doc.url && (
                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : searchClaimId ? (
              <div className="text-center py-6">
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No documents found for this claim</p>
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground text-sm">Enter a claim ID to view documents</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
