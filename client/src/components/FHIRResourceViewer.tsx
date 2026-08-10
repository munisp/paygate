import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  User,
  Shield,
  Activity,
  Building2,
  Copy,
  Check,
} from "lucide-react";

// FHIR R4 Resource type definitions (representative subset)
const FHIR_RESOURCES = {
  Patient: {
    icon: User,
    color: "blue",
    description: "Demographics and administrative information about an individual receiving care.",
    fields: [
      { name: "id", type: "string", required: true, description: "Logical id of this artifact" },
      { name: "identifier", type: "Identifier[]", required: false, description: "An identifier for this patient (NIN, BVN, HMO number)" },
      { name: "active", type: "boolean", required: false, description: "Whether this patient record is in active use" },
      { name: "name", type: "HumanName[]", required: false, description: "A name associated with the patient" },
      { name: "telecom", type: "ContactPoint[]", required: false, description: "A contact detail for the individual" },
      { name: "gender", type: "code", required: false, description: "male | female | other | unknown" },
      { name: "birthDate", type: "date", required: false, description: "The date of birth for the individual" },
      { name: "address", type: "Address[]", required: false, description: "An address for the individual" },
    ],
    example: {
      resourceType: "Patient",
      id: "pat-001",
      identifier: [{ system: "https://nhia.gov.ng/patient", value: "NHIA-2024-001234" }],
      active: true,
      name: [{ family: "Adeyemi", given: ["Chukwuemeka"] }],
      gender: "male",
      birthDate: "1985-03-15",
    },
  },
  Claim: {
    icon: FileText,
    color: "green",
    description: "A provider issued list of professional services and products which have been provided, or are to be provided, to a patient.",
    fields: [
      { name: "id", type: "string", required: true, description: "Logical id of this artifact" },
      { name: "status", type: "code", required: true, description: "active | cancelled | draft | entered-in-error" },
      { name: "type", type: "CodeableConcept", required: true, description: "Category or discipline (institutional, oral, pharmacy, professional, vision)" },
      { name: "use", type: "code", required: true, description: "claim | preauthorization | predetermination" },
      { name: "patient", type: "Reference(Patient)", required: true, description: "The recipient of the products and services" },
      { name: "billablePeriod", type: "Period", required: false, description: "Relevant time frame for the claim" },
      { name: "created", type: "dateTime", required: true, description: "Resource creation date" },
      { name: "provider", type: "Reference(Practitioner|Organization)", required: true, description: "Party responsible for the claim" },
      { name: "total", type: "Money", required: false, description: "Total claim cost" },
    ],
    example: {
      resourceType: "Claim",
      id: "claim-001",
      status: "active",
      type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "institutional" }] },
      use: "claim",
      patient: { reference: "Patient/pat-001" },
      created: "2024-01-15T10:30:00Z",
      provider: { reference: "Organization/nhia-hospital-001" },
      total: { value: 45000, currency: "NGN" },
    },
  },
  Coverage: {
    icon: Shield,
    color: "purple",
    description: "Financial instrument which may be used to reimburse or pay for health care products and services.",
    fields: [
      { name: "id", type: "string", required: true, description: "Logical id" },
      { name: "status", type: "code", required: true, description: "active | cancelled | draft | entered-in-error" },
      { name: "type", type: "CodeableConcept", required: false, description: "Coverage category (NHIA, HMO, private)" },
      { name: "subscriber", type: "Reference(Patient)", required: false, description: "Subscriber to the policy" },
      { name: "beneficiary", type: "Reference(Patient)", required: true, description: "Plan beneficiary" },
      { name: "payor", type: "Reference(Organization)[]", required: true, description: "Issuer of the policy" },
      { name: "period", type: "Period", required: false, description: "Coverage start and end dates" },
    ],
    example: {
      resourceType: "Coverage",
      id: "cov-001",
      status: "active",
      type: { coding: [{ system: "https://nhia.gov.ng/coverage-type", code: "NHIA-FORMAL" }] },
      beneficiary: { reference: "Patient/pat-001" },
      payor: [{ reference: "Organization/nhia-001" }],
      period: { start: "2024-01-01", end: "2024-12-31" },
    },
  },
  ClaimResponse: {
    icon: Activity,
    color: "orange",
    description: "This resource provides the adjudication details from the processing of a Claim resource.",
    fields: [
      { name: "id", type: "string", required: true, description: "Logical id" },
      { name: "status", type: "code", required: true, description: "active | cancelled | draft | entered-in-error" },
      { name: "use", type: "code", required: true, description: "claim | preauthorization | predetermination" },
      { name: "patient", type: "Reference(Patient)", required: true, description: "The recipient of the products and services" },
      { name: "outcome", type: "code", required: true, description: "queued | complete | error | partial" },
      { name: "request", type: "Reference(Claim)", required: false, description: "Id of resource triggering adjudication" },
      { name: "total", type: "Adjudication[]", required: false, description: "Adjudication totals" },
    ],
    example: {
      resourceType: "ClaimResponse",
      id: "cr-001",
      status: "active",
      use: "claim",
      patient: { reference: "Patient/pat-001" },
      outcome: "complete",
      request: { reference: "Claim/claim-001" },
      total: [
        { category: { coding: [{ code: "submitted" }] }, amount: { value: 45000, currency: "NGN" } },
        { category: { coding: [{ code: "benefit" }] }, amount: { value: 38250, currency: "NGN" } },
      ],
    },
  },
  Organization: {
    icon: Building2,
    color: "teal",
    description: "A formally or informally recognized grouping of people or organizations formed for the purpose of achieving some form of collective action.",
    fields: [
      { name: "id", type: "string", required: true, description: "Logical id" },
      { name: "identifier", type: "Identifier[]", required: false, description: "Identifies this organization across multiple systems (NHIA provider code)" },
      { name: "active", type: "boolean", required: false, description: "Whether the organization's record is still in active use" },
      { name: "type", type: "CodeableConcept[]", required: false, description: "Kind of organization (hospital, HMO, pharmacy)" },
      { name: "name", type: "string", required: false, description: "Name used for the organization" },
      { name: "telecom", type: "ContactPoint[]", required: false, description: "A contact detail for the organization" },
      { name: "address", type: "Address[]", required: false, description: "An address for the organization" },
    ],
    example: {
      resourceType: "Organization",
      id: "org-001",
      identifier: [{ system: "https://nhia.gov.ng/provider", value: "NHIA-PROV-00123" }],
      active: true,
      type: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/organization-type", code: "hosp" }] }],
      name: "Lagos University Teaching Hospital",
    },
  },
};

const colorMap: Record<string, string> = {
  blue: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400",
  green: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400",
  purple: "text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400",
  orange: "text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400",
  teal: "text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400",
};

function JsonViewer({ data }: { data: object }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-2 right-2 h-7 w-7 p-0"
        onClick={handleCopy}
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

function ResourceCard({
  name,
  spec,
}: {
  name: string;
  spec: (typeof FHIR_RESOURCES)[keyof typeof FHIR_RESOURCES];
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = spec.icon;

  return (
    <Card className="border border-border/60">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${colorMap[spec.color]}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <span className="font-mono text-sm font-semibold">{name}</span>
            <Badge variant="outline" className="text-xs">FHIR R4</Badge>
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{spec.description}</p>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-4 pb-4">
          <Tabs defaultValue="fields">
            <TabsList className="h-7 text-xs">
              <TabsTrigger value="fields" className="text-xs">Fields</TabsTrigger>
              <TabsTrigger value="example" className="text-xs">Example JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="fields" className="mt-2">
              <div className="space-y-1">
                {spec.fields.map((field) => (
                  <div
                    key={field.name}
                    className="flex items-start gap-2 text-xs py-1 border-b border-border/30 last:border-0"
                  >
                    <code className="font-mono text-blue-600 dark:text-blue-400 min-w-[140px]">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </code>
                    <span className="text-purple-600 dark:text-purple-400 min-w-[120px] font-mono">
                      {field.type}
                    </span>
                    <span className="text-muted-foreground">{field.description}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                <span className="text-red-500">*</span> Required field
              </p>
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

export function FHIRResourceViewer() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Activity className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            </div>
            FHIR R4 Resource Explorer
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
              Medplum Server
            </Badge>
            <Badge variant="outline" className="text-xs text-green-600 border-green-300">
              ⊕ Open Source
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          FHIR R4 resources used in the NextHub healthcare claims pipeline. Click any resource to explore its fields and example JSON.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(FHIR_RESOURCES).map(([name, spec]) => (
          <ResourceCard key={name} name={name} spec={spec} />
        ))}
      </CardContent>
    </Card>
  );
}
