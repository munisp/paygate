import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronRight, FileText, Copy, Check } from "lucide-react";

const ACORD_MESSAGES = {
  "ACORD 103 — New Business Submission": {
    description: "Submit a new insurance policy application to an insurer.",
    direction: "Fintech → Insurer",
    fields: [
      { name: "TxnControlRec", type: "TxnControlRec", required: true, description: "Transaction control header (source, destination, date)" },
      { name: "InsuranceSvcRq", type: "InsuranceSvcRq", required: true, description: "Service request wrapper" },
      { name: "NewBusiness", type: "NewBusiness", required: true, description: "New business application payload" },
      { name: "Policy", type: "Policy", required: true, description: "Policy details (type, term, coverage)" },
      { name: "Insured", type: "Insured", required: true, description: "Insured party details" },
      { name: "PremiumAmt", type: "Amt", required: false, description: "Calculated premium amount" },
    ],
    example: {
      "ACORD": {
        "SignonRq": { "ClientApp": { "Org": "PayGate", "Name": "NextHub", "Version": "219" } },
        "InsuranceSvcRq": {
          "RqUID": "req-001",
          "TransactionRequestDt": "2024-01-15",
          "NewBusinessRq": {
            "Policy": {
              "LOBCd": "LIFE",
              "EffectiveDt": "2024-02-01",
              "ExpirationDt": "2025-01-31",
              "PolicyAmt": { "Amt": 500000, "CurCd": "NGN" },
            },
            "Insured": {
              "GeneralPartyInfo": {
                "NameInfo": { "PersonName": { "GivenName": "Chukwuemeka", "Surname": "Adeyemi" } },
              },
            },
          },
        },
      },
    },
  },
  "ACORD 121 — Policy Change": {
    description: "Request a mid-term change to an existing policy (endorsement).",
    direction: "Fintech → Insurer",
    fields: [
      { name: "PolicyRef", type: "PolicyRef", required: true, description: "Reference to existing policy" },
      { name: "ChangeTypeCd", type: "code", required: true, description: "Type of change (coverage, beneficiary, address)" },
      { name: "EffectiveDt", type: "date", required: true, description: "Effective date of the change" },
      { name: "ChangedPolicy", type: "Policy", required: true, description: "Updated policy details" },
    ],
    example: {
      "ACORD": {
        "InsuranceSvcRq": {
          "PolicyChngRq": {
            "PolicyRef": { "PolicyNumber": "POL-2024-001234" },
            "ChangeTypeCd": "BeneficiaryChange",
            "EffectiveDt": "2024-03-01",
          },
        },
      },
    },
  },
  "ACORD 261 — Loss Notice (FNOL)": {
    description: "First Notice of Loss — initial claim filing notification.",
    direction: "Fintech → Insurer",
    fields: [
      { name: "PolicyRef", type: "PolicyRef", required: true, description: "Policy under which claim is filed" },
      { name: "LossInfo", type: "LossInfo", required: true, description: "Loss event details (date, cause, description)" },
      { name: "ClaimantInfo", type: "ClaimantInfo", required: true, description: "Claimant party details" },
      { name: "LossAmt", type: "Amt", required: false, description: "Estimated loss amount" },
    ],
    example: {
      "ACORD": {
        "InsuranceSvcRq": {
          "LossNoticeRq": {
            "PolicyRef": { "PolicyNumber": "POL-2024-001234" },
            "LossInfo": {
              "LossDt": "2024-01-10",
              "LossCauseCd": "Death",
              "LossDesc": "Insured passed away due to natural causes",
            },
            "ClaimantInfo": {
              "GeneralPartyInfo": {
                "NameInfo": { "PersonName": { "GivenName": "Ngozi", "Surname": "Adeyemi" } },
              },
            },
          },
        },
      },
    },
  },
  "ACORD 282 — Claim Status": {
    description: "Query the current status of a filed insurance claim.",
    direction: "Fintech ↔ Insurer",
    fields: [
      { name: "ClaimRef", type: "ClaimRef", required: true, description: "Reference to the claim" },
      { name: "ClaimStatusCd", type: "code", required: false, description: "Current status (Open, Closed, Pending, Paid)" },
      { name: "PaymentInfo", type: "PaymentInfo", required: false, description: "Payment details if claim is paid" },
    ],
    example: {
      "ACORD": {
        "InsuranceSvcRs": {
          "ClaimStatusRs": {
            "ClaimRef": { "ClaimNumber": "CLM-2024-005678" },
            "ClaimStatusCd": "Paid",
            "PaymentInfo": {
              "PaymentDt": "2024-01-20",
              "PaymentAmt": { "Amt": 500000, "CurCd": "NGN" },
            },
          },
        },
      },
    },
  },
};

function JsonViewer({ data }: { data: object }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0"
        onClick={() => {
          navigator.clipboard.writeText(json);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
      <ScrollArea className="h-48">
        <pre className="text-xs font-mono p-3 bg-muted/50 rounded-md overflow-x-auto whitespace-pre-wrap">
          {json}
        </pre>
      </ScrollArea>
    </div>
  );
}

function ACORDMessageCard({
  name,
  spec,
}: {
  name: string;
  spec: (typeof ACORD_MESSAGES)[keyof typeof ACORD_MESSAGES];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-border/60">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-orange-50 dark:bg-orange-900/20">
              <FileText className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            </div>
            <span className="font-mono text-sm font-semibold">{name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
              {spec.direction}
            </Badge>
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{spec.description}</p>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4">
          <Tabs defaultValue="fields">
            <TabsList className="h-7 text-xs">
              <TabsTrigger value="fields" className="text-xs">Fields</TabsTrigger>
              <TabsTrigger value="example" className="text-xs">Example XML/JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="mt-2">
              <div className="space-y-1">
                {spec.fields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-start gap-2 text-xs py-1 border-b border-border/30 last:border-0"
                  >
                    <code className="font-mono text-orange-600 dark:text-orange-400 min-w-[160px]">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </code>
                    <span className="text-purple-600 dark:text-purple-400 min-w-[100px] font-mono">
                      {field.type}
                    </span>
                    <span className="text-muted-foreground">{field.description}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="example" className="mt-2">
              <JsonViewer data={spec.example} />
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

export function ACORDSchemaExplorer() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <FileText className="h-3 w-3 text-orange-600 dark:text-orange-400" />
            </div>
            ACORD Message Explorer
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
              ACORD AL3 3.0
            </Badge>
            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
              ⊕ Open Standard
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          ACORD AL3 XML/JSON messages used in the NextHub insurance pipeline. Click any message to explore its fields and example payload.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(ACORD_MESSAGES).map(([name, spec]) => (
          <ACORDMessageCard key={name} name={name} spec={spec} />
        ))}
      </CardContent>
    </Card>
  );
}
