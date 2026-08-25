// @ts-nocheck
/**
 * AP Bill Inbox — upload supplier invoice documents (PDF/image), watch OCR
 * extraction progress (5s polling while pending_extraction), and confirm the
 * extracted fields through an editable human-in-the-loop form.
 */
import { useEffect, useRef, useState } from "react";
import {
  Inbox, UploadCloud, RefreshCw, FileText, Loader2, CheckCircle2,
  AlertTriangle, Plus, Trash2, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format((kobo ?? 0) / 100);
}
function koboToNairaStr(kobo: number | null | undefined): string {
  return kobo != null ? (kobo / 100).toFixed(2) : "";
}
function nairaToKobo(v: string): number | null {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_extraction: { label: "Extracting…", color: "text-violet-400", bg: "bg-violet-500/15" },
  extracted:          { label: "Ready to Confirm", color: "text-amber-400", bg: "bg-amber-500/15" },
  draft:              { label: "Confirmed (Draft)", color: "text-blue-400", bg: "bg-blue-500/15" },
  pending_approval:   { label: "Pending Approval", color: "text-amber-400", bg: "bg-amber-500/15" },
  approved:           { label: "Approved", color: "text-blue-400", bg: "bg-blue-500/15" },
  scheduled:          { label: "Scheduled", color: "text-cyan-400", bg: "bg-cyan-500/15" },
  paid:               { label: "Paid", color: "text-green-400", bg: "bg-green-500/15" },
  partially_paid:     { label: "Partially Paid", color: "text-teal-400", bg: "bg-teal-500/15" },
  rejected:           { label: "Rejected", color: "text-red-400", bg: "bg-red-500/15" },
  void:               { label: "Void", color: "text-muted-foreground", bg: "bg-muted" },
};

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/tiff"];

type ConfirmForm = {
  vendorName: string;
  billNumber: string;
  dueDate: string;
  currency: string;
  subtotal: string;
  tax: string;
  total: string;
  lineItems: Array<{ description: string; quantity: string; unitPrice: string }>;
};

function formFromExtraction(ex: any): ConfirmForm {
  return {
    vendorName: ex?.vendor_name ?? "",
    billNumber: ex?.bill_number ?? "",
    dueDate: typeof ex?.due_date === "string" && ex.due_date ? ex.due_date.slice(0, 10) : "",
    currency: ex?.currency ?? "NGN",
    subtotal: koboToNairaStr(ex?.subtotal_kobo),
    tax: koboToNairaStr(ex?.tax_kobo),
    total: koboToNairaStr(ex?.total_kobo),
    lineItems: Array.isArray(ex?.line_items) && ex.line_items.length > 0
      ? ex.line_items.map((li: any) => ({
          description: li?.description ?? "",
          quantity: li?.quantity != null ? String(li.quantity) : "1",
          unitPrice: koboToNairaStr(li?.unit_price_kobo),
        }))
      : [{ description: "", quantity: "1", unitPrice: "" }],
  };
}

export default function BillInbox() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmBillId, setConfirmBillId] = useState<string | null>(null);
  const [form, setForm] = useState<ConfirmForm | null>(null);

  // ── inbox list; poll every 5s while anything is pending extraction ──
  const { data: inbox, isLoading, refetch } = trpc.apBillInbox.listInbox.useQuery(
    { limit: 100 },
    {
      staleTime: 5_000,
      refetchInterval: (q) =>
        (q.state.data ?? []).some((b: any) => b.status === "pending_extraction") ? 5_000 : false,
    },
  );
  const bills: any[] = inbox ?? [];

  // ── extraction status polling for the bill open in the confirm dialog ──
  const { data: extraction } = trpc.apBillInbox.getExtractionStatus.useQuery(
    { billId: confirmBillId! },
    {
      enabled: !!confirmBillId,
      refetchInterval: (q) => (q.state.data?.status === "pending_extraction" ? 5_000 : false),
    },
  );

  // When extraction completes for the open bill, seed the editable form.
  useEffect(() => {
    if (extraction?.status === "extracted" && confirmBillId === extraction.billId) {
      setForm(formFromExtraction(extraction.extractedData));
    }
  }, [extraction, confirmBillId]);

  const uploadMutation = trpc.apBillInbox.uploadBillDocument.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const confirmMutation = trpc.apBillInbox.confirmExtractedBill.useMutation({
    onSuccess: () => {
      toast.success("Bill confirmed — saved as draft in Bill Pay");
      setConfirmBillId(null);
      setForm(null);
      utils.apBillInbox.listInbox.invalidate();
      utils.apBillPay.listBills.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!ACCEPTED.includes(file.type)) {
      toast.error(`Unsupported file type ${file.type || "unknown"} — upload a PDF or image`);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("Document exceeds the 15 MB limit");
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.split(",")[1] ?? "";
      const res = await uploadMutation.mutateAsync({
        fileName: file.name,
        contentType: file.type,
        base64Data,
      });
      toast.success(`Uploaded ${file.name} — extraction started`);
      utils.apBillInbox.listInbox.invalidate();
      // Open the confirm dialog immediately; it polls until extraction completes.
      setConfirmBillId(res.billId);
      setForm(null);
    } catch {
      // onError already toasted
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const openBill = (b: any) => {
    setConfirmBillId(b.billId);
    setForm(b.status === "extracted" ? null : null); // form seeds from getExtractionStatus
  };

  const submitConfirm = () => {
    if (!form || !confirmBillId) return;
    const lineItems = form.lineItems
      .filter((li) => li.description.trim() && nairaToKobo(li.unitPrice) != null)
      .map((li) => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 1,
        unit_price_kobo: nairaToKobo(li.unitPrice),
        amount_kobo: Math.round((parseFloat(li.quantity) || 1) * (nairaToKobo(li.unitPrice) ?? 0)),
      }));
    const corrections: Record<string, unknown> = {
      vendor_name: form.vendorName.trim() || null,
      bill_number: form.billNumber.trim() || null,
      due_date: form.dueDate || null,
      currency: form.currency.trim().toUpperCase() || "NGN",
      subtotal_kobo: nairaToKobo(form.subtotal),
      tax_kobo: nairaToKobo(form.tax),
      total_kobo: nairaToKobo(form.total),
      line_items: lineItems,
    };
    confirmMutation.mutate({
      billId: confirmBillId,
      corrections,
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const openStatus = extraction?.status;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Bill Inbox
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload supplier invoices — OCR extracts the fields, you confirm</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {/* Upload dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {uploading ? (
          <Loader2 className="w-10 h-10 text-primary mx-auto mb-3 animate-spin" />
        ) : (
          <UploadCloud className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        )}
        <p className="text-sm font-medium text-foreground">
          {uploading ? "Uploading…" : "Drop an invoice here, or click to browse"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPEG, WebP or TIFF — up to 15 MB</p>
      </div>

      {/* Inbox list */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading inbox…</div>
        ) : bills.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Inbox is empty</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Upload a supplier invoice to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Uploaded</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bills.map((b) => {
                  const meta = STATUS_META[b.status] ?? STATUS_META.draft;
                  return (
                    <tr key={b.billId} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openBill(b)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-foreground">{b.billNumber ?? `#${b.billId.slice(0, 8)}`}</p>
                            {b.documentUrl && (
                              <a
                                href={b.documentUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                              >
                                View document <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{b.source}</td>
                      <td className="px-4 py-3 text-right font-semibold">{(b.totalKobo ?? 0) > 0 ? formatNGN(b.totalKobo) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(b.dueDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                            {b.status === "pending_extraction" && <Loader2 className="w-3 h-3 animate-spin" />}
                            {meta.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(b.createdAt)}</td>
                      <td className="px-4 py-3">
                        {b.status === "extracted" && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.stopPropagation(); openBill(b); }}>
                            Review & Confirm
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Confirm extraction dialog ── */}
      <Dialog open={!!confirmBillId} onOpenChange={(o) => { if (!o) { setConfirmBillId(null); setForm(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Extracted Bill</DialogTitle>
          </DialogHeader>

          {openStatus === "pending_extraction" ? (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
              <p className="text-sm font-medium text-foreground">Extracting invoice fields…</p>
              <p className="text-xs text-muted-foreground">This usually takes a few seconds — the form appears automatically.</p>
            </div>
          ) : openStatus === "extracted" && !form ? (
            <div className="py-10 text-center">
              <Loader2 className="w-8 h-8 text-primary mx-auto animate-spin" />
            </div>
          ) : openStatus !== "extracted" ? (
            <div className="py-10 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm font-medium text-foreground">
                This bill is not awaiting confirmation (status: {openStatus ?? "loading…"})
              </p>
              <p className="text-xs text-muted-foreground">
                {openStatus === "draft" ? "Extraction failed or was already confirmed — the bill is editable in Bill Pay." : "Only extracted bills can be confirmed here."}
              </p>
            </div>
          ) : form ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-xs text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Review the OCR results below — correct anything before confirming.
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor Name</Label>
                  <Input value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Bill Number</Label>
                  <Input value={form.billNumber} onChange={(e) => setForm({ ...form, billNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
                </div>
                <div className="space-y-2">
                  <Label>Subtotal (₦)</Label>
                  <Input type="number" min="0" step="0.01" value={form.subtotal} onChange={(e) => setForm({ ...form, subtotal: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tax (₦)</Label>
                  <Input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Total (₦)</Label>
                  <Input type="number" min="0" step="0.01" value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" className="gap-1"
                    onClick={() => setForm({ ...form, lineItems: [...form.lineItems, { description: "", quantity: "1", unitPrice: "" }] })}>
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </Button>
                </div>
                {form.lineItems.map((li, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_130px_36px] gap-2 items-center">
                    <Input placeholder="Description" value={li.description}
                      onChange={(e) => setForm({ ...form, lineItems: form.lineItems.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x) })} />
                    <Input type="number" min="0" step="any" placeholder="Qty" value={li.quantity}
                      onChange={(e) => setForm({ ...form, lineItems: form.lineItems.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x) })} />
                    <Input type="number" min="0" step="0.01" placeholder="Unit ₦" value={li.unitPrice}
                      onChange={(e) => setForm({ ...form, lineItems: form.lineItems.map((x, idx) => idx === i ? { ...x, unitPrice: e.target.value } : x) })} />
                    <button type="button" disabled={form.lineItems.length === 1}
                      onClick={() => setForm({ ...form, lineItems: form.lineItems.filter((_, idx) => idx !== i) })}
                      className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setConfirmBillId(null); setForm(null); }}>Cancel</Button>
                <Button onClick={submitConfirm} disabled={confirmMutation.isPending} className="gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {confirmMutation.isPending ? "Confirming…" : "Confirm Bill"}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
