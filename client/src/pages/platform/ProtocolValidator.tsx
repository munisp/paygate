import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Play, Code2 } from "lucide-react";

const PROTOCOL_SAMPLES: Record<string, string> = {
  "ISO 20022 pacs.008": `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>MSG-001</MsgId>
      <CreDtTm>2024-01-15T10:30:00</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
  </FIToFICstmrCdtTrf>
</Document>`,
  "FSPIOP Transfer": `{
  "transferId": "b51ec534-ee48-4575-b6a9-ead2955b8069",
  "payerFsp": "firstbank",
  "payeeFsp": "zenithbank",
  "amount": { "amount": "100", "currency": "NGN" },
  "ilpPacket": "AYIBgQAAAAAAAASwNGxldmVsb25lLmRmc3AxLm1lci45T2RTOF81MDBtbFJ...",
  "condition": "HOr22-H3AfTDHrSkPjJtVPRiWUkhflPtaykFGnIBHVc",
  "expiration": "2024-01-15T10:31:00.000Z"
}`,
  "FHIR R4 Claim": `{
  "resourceType": "Claim",
  "id": "claim-001",
  "status": "active",
  "type": { "coding": [{ "system": "http://terminology.hl7.org/CodeSystem/claim-type", "code": "institutional" }] },
  "use": "claim",
  "patient": { "reference": "Patient/patient-001" },
  "created": "2024-01-15",
  "provider": { "reference": "Organization/org-001" },
  "priority": { "coding": [{ "code": "normal" }] },
  "insurance": [{ "sequence": 1, "focal": true, "coverage": { "reference": "Coverage/cov-001" } }]
}`,
};

export default function ProtocolValidator() {
  const [isLoading, setIsLoading] = useState(false);
  const [protocol, setProtocol] = useState("ISO 20022 pacs.008");
  const [payload, setPayload] = useState(PROTOCOL_SAMPLES["ISO 20022 pacs.008"]);
  const [result, setResult] = useState<{ valid: boolean; errors: string[]; warnings: string[]; info: string[] } | null>(null);

  const validate = trpc.wave221.protocolValidator.validate.useMutation({
    onSuccess: (data) => setResult(data),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Protocol Validator</h1>
        <p className="text-muted-foreground text-sm">Validate ISO 20022, FSPIOP, FHIR R4, and CBDC message payloads against scheme specifications</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Code2 className="h-4 w-4 text-primary" /> Input Payload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Protocol / Message Type</Label>
                <Select value={protocol} onValueChange={(v) => { setProtocol(v); setPayload(PROTOCOL_SAMPLES[v] ?? ""); setResult(null); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["ISO 20022 pacs.008", "ISO 20022 pain.001", "FSPIOP Transfer", "FSPIOP Quote", "FHIR R4 Claim", "FHIR R4 Coverage", "CBDC Token", "NIP Name Enquiry"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Payload (XML or JSON)</Label>
                <Textarea
                  value={payload}
                  onChange={(e) => { setPayload(e.target.value); setResult(null); }}
                  className="font-mono text-xs min-h-[280px] resize-none"
                  placeholder="Paste your message payload here…"
                />
              </div>
              <Button className="w-full" onClick={() => validate.mutate({ protocol, payload })} disabled={!payload.trim() || validate.isPending}>
                {validate.isPending ? <><span className="animate-spin mr-2">⚙️</span> Validating…</> : <><Play className="h-4 w-4 mr-2" /> Validate</>}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className={result ? (result.valid ? "border-green-500/30" : "border-destructive/30") : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Validation Result</CardTitle>
                {result && (
                  <Badge variant={result.valid ? "default" : "destructive"} className="text-sm">
                    {result.valid ? "✓ Valid" : "✗ Invalid"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Code2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Paste a payload and click Validate to see results</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {result.errors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-destructive flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Errors ({result.errors.length})</p>
                      {result.errors.map((e, i) => (
                        <div key={i} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2 font-mono">{e}</div>
                      ))}
                    </div>
                  )}
                  {result.warnings.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-yellow-600 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Warnings ({result.warnings.length})</p>
                      {result.warnings.map((w, i) => (
                        <div key={i} className="text-xs bg-yellow-500/5 border border-yellow-500/20 rounded p-2 font-mono">{w}</div>
                      ))}
                    </div>
                  )}
                  {result.info.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-blue-600 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Info ({result.info.length})</p>
                      {result.info.map((info, i) => (
                        <div key={i} className="text-xs bg-blue-500/5 border border-blue-500/20 rounded p-2">{info}</div>
                      ))}
                    </div>
                  )}
                  {result.valid && result.errors.length === 0 && (
                    <div className="flex items-center gap-2 text-green-600 py-4 justify-center">
                      <CheckCircle2 className="h-6 w-6" />
                      <span className="font-medium">Payload is valid and conforms to {protocol} specification</span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
