import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ProtocolSpec = {
  name: string;
  version: string;
  description: string;
  openSource: boolean;
  specUrl: string;
  color: "blue" | "green" | "purple" | "orange" | "teal" | "red" | "indigo";
};

export const DOMAIN_PROTOCOLS: Record<string, ProtocolSpec[]> = {
  healthcare: [
    {
      name: "FHIR",
      version: "R4",
      description: "HL7 FHIR R4 — Fast Healthcare Interoperability Resources. Medplum as FHIR server.",
      openSource: true,
      specUrl: "https://hl7.org/fhir/R4/",
      color: "blue",
    },
    {
      name: "NHIA",
      version: "v2",
      description: "Nigerian Health Insurance Authority API — eligibility, pre-auth, claims.",
      openSource: false,
      specUrl: "https://nhia.gov.ng",
      color: "green",
    },
    {
      name: "HL7 v2",
      version: "2.8",
      description: "HL7 v2.8 — legacy lab and ADT messaging for backward compatibility.",
      openSource: true,
      specUrl: "https://hl7.org/implement/standards/product_brief.cfm?product_id=185",
      color: "purple",
    },
  ],
  insurance: [
    {
      name: "ACORD",
      version: "AL3 3.0",
      description: "ACORD AL3 XML/JSON — Association for Cooperative Operations Research and Development. Industry-standard insurance data exchange.",
      openSource: true,
      specUrl: "https://www.acord.org/standards-architecture/acord-standards",
      color: "orange",
    },
    {
      name: "IFRS 17",
      version: "2023",
      description: "IFRS 17 Insurance Contracts — accounting standard for insurance liability measurement.",
      openSource: false,
      specUrl: "https://www.ifrs.org/issued-standards/list-of-standards/ifrs-17-insurance-contracts/",
      color: "teal",
    },
  ],
  scf: [
    {
      name: "GS1 EPCIS",
      version: "2.0",
      description: "GS1 EPCIS 2.0 — Electronic Product Code Information Services for supply chain event tracking.",
      openSource: true,
      specUrl: "https://www.gs1.org/standards/epcis",
      color: "green",
    },
    {
      name: "UBL",
      version: "2.1",
      description: "OASIS Universal Business Language 2.1 — XML invoice and procurement document standard.",
      openSource: true,
      specUrl: "https://docs.oasis-open.org/ubl/UBL-2.1.html",
      color: "blue",
    },
    {
      name: "EDIFACT",
      version: "D.01B",
      description: "UN/EDIFACT — Electronic Data Interchange for Administration, Commerce and Transport.",
      openSource: true,
      specUrl: "https://unece.org/trade/uncefact/introducing-unedifact",
      color: "purple",
    },
  ],
  g2p: [
    {
      name: "OpenG2P",
      version: "1.0",
      description: "OpenG2P — open-source platform for government-to-person payment programs.",
      openSource: true,
      specUrl: "https://openg2p.org",
      color: "teal",
    },
    {
      name: "MOSIP",
      version: "1.2",
      description: "Modular Open Source Identity Platform — biometric identity verification for beneficiary deduplication.",
      openSource: true,
      specUrl: "https://mosip.io",
      color: "green",
    },
    {
      name: "FSPIOP",
      version: "v1.1",
      description: "Mojaloop FSPIOP API — interoperable payment transfer to DFSP accounts.",
      openSource: true,
      specUrl: "https://mojaloop.io/mojaloop-specification/",
      color: "blue",
    },
  ],
  energy: [
    {
      name: "DLMS/COSEM",
      version: "IEC 62056",
      description: "Device Language Message Specification / Companion Specification for Energy Metering — smart meter communication protocol.",
      openSource: true,
      specUrl: "https://www.dlms.com/dlms-cosem/overview",
      color: "orange",
    },
    {
      name: "STS",
      version: "IEC 62055-41",
      description: "Standard Transfer Specification — AES-128 encrypted prepayment electricity token generation.",
      openSource: true,
      specUrl: "https://www.sts.org.za",
      color: "red",
    },
    {
      name: "OpenADR",
      version: "2.0b",
      description: "Open Automated Demand Response — demand response signalling for grid management.",
      openSource: true,
      specUrl: "https://www.openadr.org",
      color: "green",
    },
    {
      name: "OCPP",
      version: "2.0.1",
      description: "Open Charge Point Protocol — EV charging station management.",
      openSource: true,
      specUrl: "https://openchargealliance.org",
      color: "teal",
    },
  ],
  cbdc: [
    {
      name: "ISO 20022",
      version: "pacs.008",
      description: "ISO 20022 pacs.008 — Financial Institution Credit Transfer for CBDC payments.",
      openSource: true,
      specUrl: "https://www.iso20022.org",
      color: "blue",
    },
    {
      name: "mBridge",
      version: "BIS 2024",
      description: "BIS mBridge — multi-CBDC platform for cross-border payments between central banks.",
      openSource: false,
      specUrl: "https://www.bis.org/about/bisih/topics/cbdc/mcbdc_bridge.htm",
      color: "purple",
    },
    {
      name: "OpenCBDC",
      version: "MIT",
      description: "MIT Digital Currency Initiative OpenCBDC — open-source CBDC research platform.",
      openSource: true,
      specUrl: "https://dci.mit.edu/opencbdc",
      color: "teal",
    },
    {
      name: "eNaira",
      version: "CBN v1",
      description: "Central Bank of Nigeria eNaira RTGS API — Nigerian CBDC.",
      openSource: false,
      specUrl: "https://www.cbn.gov.ng/enaira",
      color: "green",
    },
  ],
  remittance: [
    {
      name: "SWIFT gpi",
      version: "2024",
      description: "SWIFT Global Payments Innovation — real-time tracking for cross-border payments.",
      openSource: false,
      specUrl: "https://www.swift.com/our-solutions/swift-gpi",
      color: "blue",
    },
    {
      name: "ISO 20022",
      version: "pain.001",
      description: "ISO 20022 pain.001 — Customer Credit Transfer Initiation for remittance.",
      openSource: true,
      specUrl: "https://www.iso20022.org",
      color: "purple",
    },
    {
      name: "IVMS 101",
      version: "FATF 2020",
      description: "InterVASP Messaging Standard 101 — Travel Rule data format for VASP-to-VASP transfers.",
      openSource: true,
      specUrl: "https://intervasp.org",
      color: "red",
    },
    {
      name: "SEPA",
      version: "SCT Inst",
      description: "SEPA Credit Transfer Instant — European instant payment scheme.",
      openSource: true,
      specUrl: "https://www.europeanpaymentscouncil.eu/what-we-do/sepa-instant-credit-transfer",
      color: "orange",
    },
  ],
};

const colorMap: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  green: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300",
  purple: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
  orange: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300",
  teal: "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300",
  red: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300",
  indigo: "bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300",
};

interface ProtocolBadgeProps {
  protocol: ProtocolSpec;
  size?: "sm" | "md";
}

export function ProtocolBadge({ protocol, size = "sm" }: ProtocolBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium cursor-help ${colorMap[protocol.color]}`}
        >
          {protocol.openSource && (
            <span className="text-[10px]">⊕</span>
          )}
          {protocol.name}
          <span className="opacity-60">{protocol.version}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-semibold">{protocol.name} {protocol.version}</div>
          <div className="text-xs text-muted-foreground">{protocol.description}</div>
          {protocol.openSource && (
            <div className="text-xs text-green-600 dark:text-green-400">⊕ Open-source specification</div>
          )}
          <a
            href={protocol.specUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline block"
          >
            View specification →
          </a>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

interface DomainProtocolBannerProps {
  domain: keyof typeof DOMAIN_PROTOCOLS;
}

export function DomainProtocolBanner({ domain }: DomainProtocolBannerProps) {
  const protocols = DOMAIN_PROTOCOLS[domain] ?? [];
  if (protocols.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-lg border border-border/50">
      <span className="text-xs text-muted-foreground font-medium mr-1">Protocols:</span>
      {protocols.map((p) => (
        <ProtocolBadge key={p.name} protocol={p} />
      ))}
    </div>
  );
}
