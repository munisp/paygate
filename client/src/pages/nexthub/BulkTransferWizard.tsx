import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Send, CheckCircle2, AlertCircle, FileText, ArrowRight, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Step = "upload" | "validate" | "review" | "submit" | "done";

type TransferRow = {
  rowNum: number;
  payeeFsp: string;
  payeeId: string;
  amount: number;
  currency: string;
  note?: string;
  status: "valid" | "invalid";
  error?: string;
};

const STEP_LABELS: Record<Step, string> = {
  upload: "1. Upload CSV",
  validate: "2. Validate",
  review: "3. Review",
  submit: "4. Submit",
  done: "5. Done",
};

export default function BulkTransferWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchName, setBatchName] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const fileRef = useRef<HTMLInputElement>(null);

  const validateMutation = trpc.wave223.bulkTransfers.validate.useMutation({
    onSuccess: (data) => {
      setRows(data.rows);
      setStep("review");
    },
    onError: (e) => toast.error(e.message),
  });

  const submitMutation = trpc.wave223.bulkTransfers.submit.useMutation({
    onSuccess: (data) => {
      setBatchId(data.batchId);
      setStep("done");
      toast.success(`Batch ${data.batchId} submitted — ${data.count} transfers queued.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string ?? "");
    reader.readAsText(file);
  };

  const handleValidate = () => {
    if (!csvText.trim()) { toast.error("Please upload or paste CSV data."); return; }
    validateMutation.mutate({ csvText, defaultCurrency: currency });
    setStep("validate");
  };

  const validRows = rows.filter((r) => r.status === "valid");
  const invalidRows = rows.filter((r) => r.status === "invalid");
  const totalAmount = validRows.reduce((sum, r) => sum + r.amount, 0);

  const reset = () => {
    setStep("upload"); setCsvText(""); setRows([]); setBatchId(null); setBatchName("");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="h-6 w-6 text-blue-500" /> Bulk Transfer Wizard</h1>
        <p className="text-muted-foreground text-sm mt-1">Upload a CSV to initiate multiple FSPIOP transfers in a single batch</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {(Object.keys(STEP_LABELS) as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${step === s ? "bg-primary text-primary-foreground" : ["upload", "validate", "review", "submit", "done"].indexOf(step) > i ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
              {STEP_LABELS[s]}
            </div>
            {i < 4 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Transfer CSV</CardTitle>
            <CardDescription>CSV format: payeeFsp, payeeId, amount, currency (optional), note (optional)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => fileRef.current?.click()}>
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Click to upload CSV or drag and drop</p>
              <p className="text-xs text-muted-foreground mt-1">Max 1000 rows per batch</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
            </div>
            <div className="space-y-2">
              <Label>Or paste CSV directly</Label>
              <Textarea
                placeholder={"payeeFsp,payeeId,amount,currency,note\nGTBANK,2200000001,50000,NGN,Salary\nACCESSBANK,0123456789,25000,NGN,Bonus"}
                rows={6}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Batch Name</Label>
                <Input placeholder="e.g. July Payroll" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["NGN", "USD", "GHS", "KES", "ZAR"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleValidate} disabled={!csvText.trim()} className="w-full">
              Validate CSV <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Validating */}
      {step === "validate" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Validating transfer rows…</p>
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold text-green-600">{validRows.length}</p><p className="text-xs text-muted-foreground">Valid rows</p></CardContent></Card>
            <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold text-red-500">{invalidRows.length}</p><p className="text-xs text-muted-foreground">Invalid rows</p></CardContent></Card>
            <Card className="border-0 bg-muted/40"><CardContent className="p-4"><p className="text-2xl font-bold">{(totalAmount / 100).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total {currency}</p></CardContent></Card>
          </div>

          {invalidRows.length > 0 && (
            <Card className="border-destructive/30">
              <CardHeader><CardTitle className="text-sm text-destructive flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {invalidRows.length} rows will be skipped</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Payee FSP</TableHead><TableHead>Payee ID</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {invalidRows.map((r) => (
                      <TableRow key={r.rowNum}><TableCell>{r.rowNum}</TableCell><TableCell>{r.payeeFsp}</TableCell><TableCell>{r.payeeId}</TableCell><TableCell className="text-destructive text-xs">{r.error}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Valid Transfers Preview (first 10)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Row</TableHead><TableHead>Payee FSP</TableHead><TableHead>Payee ID</TableHead><TableHead>Amount</TableHead><TableHead>Currency</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  {validRows.slice(0, 10).map((r) => (
                    <TableRow key={r.rowNum}>
                      <TableCell>{r.rowNum}</TableCell>
                      <TableCell className="font-mono text-xs">{r.payeeFsp}</TableCell>
                      <TableCell className="font-mono text-xs">{r.payeeId}</TableCell>
                      <TableCell className="font-mono text-sm">{(r.amount / 100).toLocaleString()}</TableCell>
                      <TableCell><Badge variant="outline">{r.currency}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.note ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button variant="outline" onClick={reset}>Start Over</Button>
            <Button onClick={() => submitMutation.mutate({ csvText, batchName, defaultCurrency: currency })} disabled={validRows.length === 0 || submitMutation.isPending} className="flex-1">
              {submitMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting…</> : <>Submit {validRows.length} Transfers <ArrowRight className="h-4 w-4 ml-1" /></>}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="text-lg font-semibold">Batch Submitted Successfully</p>
              <p className="text-muted-foreground text-sm mt-1">Batch ID: <span className="font-mono">{batchId}</span></p>
              <p className="text-muted-foreground text-sm">{validRows.length} transfers are being processed via NextHub</p>
            </div>
            <Button onClick={reset}>Start New Batch</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
