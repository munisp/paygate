import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Building2, Zap, CreditCard, Monitor, Shield, Landmark,
  ArrowRight, CheckCircle2, Clock, Users
} from "lucide-react";

interface StakeholderCard {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  steps: number;
  estimatedTime: string;
  requirements: string[];
  path: string;
  badge?: string;
}

const STAKEHOLDERS: StakeholderCard[] = [
  {
    id: "dfsp",
    title: "DFSP Onboarding",
    description: "Onboard a Digital Financial Service Provider onto the NextHub interoperability switch. Covers CBN licensing, FSPIOP endpoint configuration, TLS certificates, and settlement account setup.",
    icon: Building2,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    steps: 6,
    estimatedTime: "3–5 business days",
    requirements: ["CBN License", "FSPIOP Endpoint", "TLS Certificate", "JWKS URL", "Settlement Account"],
    path: "/onboarding/dfsp",
    badge: "Regulated",
  },
  {
    id: "pisp",
    title: "PISP Onboarding",
    description: "Register a Payment Initiation Service Provider to initiate payments on behalf of end-users via the Open Finance consent framework. Requires CBN PISP license and redirect URL registration.",
    icon: Zap,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    steps: 5,
    estimatedTime: "2–4 business days",
    requirements: ["CBN PISP License", "Redirect URLs", "Webhook URL", "Consent Scope Declaration"],
    path: "/onboarding/pisp",
    badge: "Open Finance",
  },
  {
    id: "psp",
    title: "PSP / Acquirer Onboarding",
    description: "Onboard a Payment Service Provider or Acquirer to process card and digital payments. Covers PCI DSS compliance, MCC allowlist, transaction limits, and settlement bank linkage.",
    icon: CreditCard,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/30",
    steps: 5,
    estimatedTime: "2–3 business days",
    requirements: ["CBN PSP License", "PCI DSS Certificate", "MCC Allowlist", "Settlement Bank"],
    path: "/onboarding/psp",
  },
  {
    id: "pos-operator",
    title: "POS Operator Onboarding",
    description: "Register a POS terminal operator or PTSP to deploy and manage payment terminals. Covers NIBSS approval, terminal provisioning, and deployment location registration.",
    icon: Monitor,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    steps: 4,
    estimatedTime: "1–2 business days",
    requirements: ["NIBSS Approval", "PTSP Code", "Terminal Count", "Deployment Locations"],
    path: "/onboarding/pos-operator",
  },
  {
    id: "regulator",
    title: "Regulator / Observer Onboarding",
    description: "Onboard a regulatory body (CBN, SEC, NDIC) as a read-only observer with configurable data access levels, reporting frequency, and secure API or webhook delivery.",
    icon: Shield,
    color: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    steps: 3,
    estimatedTime: "Same day",
    requirements: ["Regulator Code", "Data Access Level", "Reporting Frequency", "API/Webhook Endpoint"],
    path: "/onboarding/regulator",
    badge: "Admin Only",
  },
  {
    id: "settlement-bank",
    title: "Settlement Bank Registration",
    description: "Register a commercial bank as a settlement partner. Configures NIP and RTGS capabilities, CBN license validation, and settlement account details for interbank clearing.",
    icon: Landmark,
    color: "text-teal-600",
    bgColor: "bg-teal-50 dark:bg-teal-950/30",
    steps: 3,
    estimatedTime: "Same day",
    requirements: ["Bank Code", "NIP Code", "SWIFT Code (optional)", "CBN License Number"],
    path: "/onboarding/settlement-bank",
    badge: "Admin Only",
  },
];

export default function OnboardingHub() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">NextHub Onboarding Centre</h1>
        <p className="text-muted-foreground text-lg">
          Register and onboard all stakeholder types onto the PayGate NextHub interoperability platform.
          Each wizard guides you through the required documentation, technical configuration, and compliance checks.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Stakeholder Types", value: "6", icon: Users },
          { label: "Total Wizard Steps", value: "26", icon: CheckCircle2 },
          { label: "Avg. Approval Time", value: "2 days", icon: Clock },
          { label: "Compliance Checks", value: "8", icon: Shield },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 bg-muted/40">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stakeholder cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {STAKEHOLDERS.map((s) => (
          <Card
            key={s.id}
            className="group hover:shadow-lg transition-all duration-200 cursor-pointer border hover:border-primary/30"
            onClick={() => navigate(s.path)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-lg ${s.bgColor} w-fit`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                {s.badge && (
                  <Badge variant="secondary" className="text-xs">{s.badge}</Badge>
                )}
              </div>
              <CardTitle className="text-lg mt-3">{s.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{s.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {s.steps} steps
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {s.estimatedTime}
                </span>
              </div>

              {/* Requirements */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">KEY REQUIREMENTS</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.requirements.map((req) => (
                    <span
                      key={req}
                      className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground"
                    >
                      {req}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <Button
                className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); navigate(s.path); }}
              >
                Start Onboarding
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info footer */}
      <Card className="border-0 bg-muted/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-sm">Compliance & Approval Process</p>
              <p className="text-sm text-muted-foreground">
                All onboarding submissions are reviewed by the PayGate compliance team. DFSP and PISP applications
                require CBN license verification and may take 2–5 business days. Regulator and Settlement Bank
                registrations are admin-only and take effect immediately upon approval.
                All submitted documents are encrypted at rest and accessible only to authorised reviewers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
