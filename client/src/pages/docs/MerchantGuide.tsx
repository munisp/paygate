/**
 * MerchantGuide.tsx
 *
 * Comprehensive in-app user guide for PayGate merchants.
 * Covers every major feature available in the merchant portal.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  BookOpen,
  LayoutDashboard,
  CreditCard,
  Users,
  BarChart3,
  Link2,
  AlertTriangle,
  Settings,
  Bell,
  Key,
  Webhook,
  DollarSign,
  Globe,
  Shield,
  Layers,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Guide content data
// ─────────────────────────────────────────────
const sections = [
  {
    id: "getting-started",
    icon: BookOpen,
    title: "Getting Started",
    color: "text-blue-500",
    content: [
      {
        heading: "Welcome to PayGate",
        body: `PayGate is a full-stack payment processing platform that enables you to accept payments online and in-person, manage customers, issue virtual cards, run analytics, and automate payouts — all from a single dashboard. This guide walks you through every feature so you can get the most out of your account.`,
      },
      {
        heading: "Onboarding & KYC",
        body: `After signing up, you will be guided through the onboarding wizard. You must provide your business name, registration number, and bank account details. PayGate requires Know-Your-Business (KYB) verification before you can process live payments. Upload your CAC certificate, utility bill, and director IDs in the Compliance section. Verification typically completes within one business day. You will receive an email notification once approved.`,
      },
      {
        heading: "Dashboard Overview",
        body: `The Dashboard is your command centre. It displays real-time metrics including today's transaction volume, success rate, pending payouts, and active disputes. The live feed on the right shows the most recent transactions as they arrive. Use the date-range picker to compare performance across custom periods. Key performance indicators (KPIs) at the top of the page update every 30 seconds.`,
      },
    ],
  },
  {
    id: "transactions",
    icon: CreditCard,
    title: "Transactions",
    color: "text-green-500",
    content: [
      {
        heading: "Transaction List",
        body: `Navigate to Transactions to see a paginated, searchable log of every payment processed through your account. You can filter by status (pending, successful, failed, reversed), date range, amount range, channel (card, bank transfer, USSD, QR, wallet), and currency. Click any row to open the transaction detail sheet, which shows the full payload, metadata, customer information, and timeline of status changes.`,
      },
      {
        heading: "Refunds & Reversals",
        body: `To issue a refund, open the transaction detail and click Refund. You can issue a full or partial refund. Partial refunds are capped at the original transaction amount. Refunds are processed within 3–5 business days for card payments and within 24 hours for wallet payments. A refund confirmation email is automatically sent to the customer.`,
      },
      {
        heading: "Exports",
        body: `Use the Export button to download transactions as CSV or PDF. Exports respect the active filters, so you can export exactly the subset you need. Scheduled exports can be configured in Settings → Reports to be delivered to your email on a daily, weekly, or monthly cadence.`,
      },
    ],
  },
  {
    id: "customers",
    icon: Users,
    title: "Customers",
    color: "text-purple-500",
    content: [
      {
        heading: "Customer Profiles",
        body: `The Customers page lists every consumer who has transacted with your business. Each profile shows lifetime spend, transaction count, last active date, and KYC status. Click a customer to open their full profile, which includes a complete transaction history, saved payment methods, and any active subscriptions or BNPL plans.`,
      },
      {
        heading: "Segments & Tags",
        body: `You can tag customers with custom labels (e.g., "VIP", "High Risk", "Wholesale") and filter the customer list by those tags. Segments are useful for targeted payment link campaigns and for configuring fraud rules that apply only to specific customer groups.`,
      },
    ],
  },
  {
    id: "payouts",
    icon: DollarSign,
    title: "Payouts & Settlements",
    color: "text-yellow-500",
    content: [
      {
        heading: "Automatic Settlements",
        body: `By default, PayGate settles your balance to your registered bank account every business day (T+1). You can change the settlement frequency to weekly or manual in Settings → Payouts. The minimum settlement amount is ₦5,000. Settlements below this threshold are held and rolled over to the next cycle.`,
      },
      {
        heading: "Manual Payouts",
        body: `Use the Payouts page to initiate an on-demand payout to any registered bank account. Enter the amount, select the destination account, and submit. Payouts above ₦1,000,000 require two-factor approval from a second team member with the Approver role. You will receive an email and in-app notification when the payout is processed.`,
      },
      {
        heading: "USDC Payouts",
        body: `If you have enabled the USDC payout feature, you can settle directly to a USDC wallet address on the Ethereum or Polygon network. Navigate to USDC Payouts, enter your wallet address, and specify the amount. The conversion rate is locked at the time of submission and displayed before you confirm.`,
      },
      {
        heading: "Settlement Forecast",
        body: `The Settlement Forecast page projects your expected payout amounts for the next 7 and 30 days based on current transaction velocity and your fee structure. Use this to plan cash flow and avoid surprises.`,
      },
    ],
  },
  {
    id: "payment-links",
    icon: Link2,
    title: "Payment Links",
    color: "text-cyan-500",
    content: [
      {
        heading: "Creating a Payment Link",
        body: `Payment Links let you accept payments without a website. Go to Payment Links → Create, enter a name, amount (or leave blank for a customer-specified amount), description, and optional expiry date. You can attach a product image and set a maximum number of uses. Once created, share the link via email, WhatsApp, or social media.`,
      },
      {
        heading: "Recurring Payment Links",
        body: `Enable the Recurring toggle to create a subscription-style link. Choose the billing interval (weekly, monthly, quarterly, annually) and the number of billing cycles. Customers who pay via a recurring link are automatically enrolled in a subscription and charged on the configured schedule.`,
      },
      {
        heading: "Link Analytics",
        body: `Each payment link has its own analytics panel showing views, conversion rate, total collected, and a time-series chart. Use this data to optimise your campaigns.`,
      },
    ],
  },
  {
    id: "virtual-cards",
    icon: CreditCard,
    title: "Virtual Cards",
    color: "text-pink-500",
    content: [
      {
        heading: "Issuing Virtual Cards",
        body: `Virtual Cards allow you to issue Visa or Mastercard virtual cards to your customers or team members for controlled spending. Navigate to Virtual Cards → Issue Card, select the card type, set a spending limit, and assign it to a customer or team member. Cards are issued instantly and can be used for online purchases immediately.`,
      },
      {
        heading: "Card Controls",
        body: `You can freeze, unfreeze, or terminate any card at any time. Set merchant category code (MCC) restrictions to limit spending to specific categories (e.g., only SaaS subscriptions, only travel). Transaction alerts are sent to the cardholder for every spend.`,
      },
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics",
    color: "text-orange-500",
    content: [
      {
        heading: "Revenue Analytics",
        body: `The Analytics dashboard provides deep insights into your payment performance. Charts include daily/weekly/monthly revenue trends, payment method breakdown, geographic distribution of customers, peak transaction hours, and average transaction value over time. All charts support drill-down by clicking on data points.`,
      },
      {
        heading: "Cohort Analysis",
        body: `The Cohort Analytics page groups customers by their first transaction month and tracks their retention and repeat purchase behaviour over subsequent months. This helps you understand customer lifetime value and identify the cohorts with the highest long-term revenue potential.`,
      },
      {
        heading: "Fraud Heatmap",
        body: `The Fraud Heatmap visualises the geographic distribution of declined and flagged transactions on an interactive map. Hotspots indicate areas with elevated fraud risk. Use this data to configure location-based fraud rules in the Fraud Risk section.`,
      },
    ],
  },
  {
    id: "fraud-risk",
    icon: Shield,
    title: "Fraud Risk",
    color: "text-red-500",
    content: [
      {
        heading: "Risk Scoring",
        body: `Every transaction is automatically scored by PayGate's fraud engine, which analyses over 50 signals including device fingerprint, IP geolocation, velocity, behavioural biometrics, and historical patterns. The score (0–100) is displayed on every transaction detail page. Scores above 70 are flagged for review; scores above 90 trigger automatic blocking.`,
      },
      {
        heading: "Custom Rules",
        body: `Navigate to Fraud Risk → Rules to create custom fraud rules. Rules can trigger on conditions such as transaction amount above a threshold, more than N transactions per hour from the same IP, card BIN from a blocked country, or customer tag matching a segment. Actions include block, flag for review, require 3DS, or send an alert.`,
      },
      {
        heading: "Reconciliation Alerts",
        body: `The Reconciliation Alerts page highlights discrepancies between your expected settlements and actual bank credits. Alerts are generated automatically when a settlement amount differs from the expected value by more than 0.5%. Click an alert to see the detailed breakdown and initiate a dispute with PayGate support.`,
      },
    ],
  },
  {
    id: "disputes",
    icon: AlertTriangle,
    title: "Disputes & Chargebacks",
    color: "text-amber-500",
    content: [
      {
        heading: "Managing Disputes",
        body: `When a customer files a chargeback with their bank, PayGate creates a dispute record and notifies you by email and in-app notification. You have 7 days to respond with evidence. Navigate to Disputes, open the dispute, and upload supporting documents (order confirmation, delivery proof, customer communication). PayGate submits the evidence to the card network on your behalf.`,
      },
      {
        heading: "Dispute Workflow",
        body: `The dispute detail page shows a full timeline: when the chargeback was filed, when evidence was submitted, and the expected resolution date. Statuses progress through: Open → Evidence Submitted → Under Review → Won / Lost. You will receive a notification at each stage transition.`,
      },
      {
        heading: "Chargeback Automation",
        body: `Enable Chargeback Automation in Settings to have PayGate automatically compile and submit evidence for common dispute types (non-receipt, duplicate charge) using transaction data already in the system. This reduces manual work and improves win rates for straightforward cases.`,
      },
    ],
  },
  {
    id: "bnpl",
    icon: Layers,
    title: "Buy Now Pay Later (BNPL)",
    color: "text-indigo-500",
    content: [
      {
        heading: "Enabling BNPL",
        body: `BNPL allows your customers to split purchases into instalments at checkout. To enable BNPL, go to BNPL → Settings and configure the available plans (e.g., 3 months, 6 months, 12 months), the minimum order value, and whether you absorb the BNPL fee or pass it to the customer.`,
      },
      {
        heading: "BNPL Dashboard",
        body: `The BNPL dashboard shows active plans, upcoming instalments, default rates, and total outstanding balance. You receive the full purchase amount upfront; PayGate manages the instalment collection from the customer. Defaults are handled by PayGate's collections team.`,
      },
    ],
  },
  {
    id: "fx",
    icon: Globe,
    title: "FX & Cross-Border",
    color: "text-teal-500",
    content: [
      {
        heading: "Multi-Currency Acceptance",
        body: `PayGate supports accepting payments in over 30 currencies. Enable the currencies you want to accept in Settings → FX. Customers will be charged in their local currency, and you will receive the equivalent in your settlement currency at the prevailing mid-market rate plus a 0.5% FX spread.`,
      },
      {
        heading: "Dynamic Currency Conversion (DCC)",
        body: `If you have international customers, enable DCC to show them the price in their home currency at checkout. The exchange rate is displayed transparently, and customers can choose to pay in the displayed currency or in your base currency. DCC transactions are flagged in your transaction log.`,
      },
      {
        heading: "Cross-Border Transfers",
        body: `The Cross-Border page allows you to send international wire transfers to suppliers or partners. Supported corridors include NGN→USD, NGN→GBP, NGN→EUR, and NGN→KES. Transfers are processed via SWIFT or local payment rails depending on the destination.`,
      },
    ],
  },
  {
    id: "team",
    icon: Users,
    title: "Team & Roles",
    color: "text-violet-500",
    content: [
      {
        heading: "Inviting Team Members",
        body: `Go to Team → Invite to add colleagues to your PayGate account. Enter their email address and select a role. An invitation email is sent with a secure link that expires in 48 hours. Invited users must complete email verification before accessing the portal.`,
      },
      {
        heading: "Roles & Permissions",
        body: `PayGate supports four built-in roles. The Owner has full access and is the only role that can delete the account or change the settlement bank. Admins can access all features except account deletion and billing. Developers have read access to all data plus the ability to manage API keys and webhooks. Viewers have read-only access to transactions and analytics. Custom roles can be created in Team → Roles.`,
      },
    ],
  },
  {
    id: "api-webhooks",
    icon: Webhook,
    title: "API Keys & Webhooks",
    color: "text-slate-400",
    content: [
      {
        heading: "API Keys",
        body: `Navigate to API Keys to generate test and live API keys. Test keys (prefixed with pk_test_ and sk_test_) are used in your development environment and do not process real money. Live keys (prefixed with pk_live_ and sk_live_) are used in production. Never expose your secret key (sk_) in client-side code. Rotate keys immediately if you suspect a compromise.`,
      },
      {
        heading: "Configuring Webhooks",
        body: `Webhooks allow PayGate to push real-time event notifications to your server. Go to Webhooks → Add Endpoint, enter your HTTPS URL, and select the events you want to receive (e.g., payment.success, payout.completed, dispute.created). PayGate signs every webhook payload with your webhook secret using HMAC-SHA256. Verify the signature on your server before processing the event.`,
      },
      {
        heading: "Webhook Delivery Log",
        body: `The Webhook Deliveries page shows every delivery attempt for each event, including the HTTP response code, response body, and latency. Failed deliveries are retried up to 5 times with exponential backoff. You can manually retry any failed delivery from this page.`,
      },
    ],
  },
  {
    id: "notifications",
    icon: Bell,
    title: "Notifications",
    color: "text-sky-500",
    content: [
      {
        heading: "Notification Channels",
        body: `PayGate can notify you via email, in-app notifications, and push notifications (if you have installed the PWA). Go to Notifications → Preferences to configure which events trigger notifications on which channels. You can enable or disable notifications for payment success, payment failure, payout completion, dispute creation, KYC status changes, and more.`,
      },
      {
        heading: "Digest Emails",
        body: `Enable digest emails to receive a periodic summary of your account activity instead of individual notifications for every event. Choose from daily, weekly, or monthly digest frequency. The digest includes total volume, transaction count, top customers, and any pending actions requiring your attention.`,
      },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    title: "Settings & Billing",
    color: "text-gray-400",
    content: [
      {
        heading: "Business Settings",
        body: `Update your business name, logo, support email, and website URL in Settings → Business. These details appear on payment pages, receipts, and customer-facing communications. Changes take effect immediately.`,
      },
      {
        heading: "Checkout Customisation",
        body: `Go to Checkout to customise the appearance of your hosted payment page. You can set a brand colour, upload a logo, choose a font, and add a custom success message. Preview changes in real time before publishing.`,
      },
      {
        heading: "Billing & Fees",
        body: `The Billing page shows your current fee plan, monthly invoice, and payment history. PayGate charges a flat 1.5% on local card transactions, 3.5% on international cards, and 0.75% on bank transfers, capped at ₦2,000 per transaction. Volume discounts are available for merchants processing above ₦50M per month — contact support to negotiate a custom rate.`,
      },
      {
        heading: "Go-Live Checklist",
        body: `Before switching to live mode, review the Go-Live Checklist in Settings. It verifies that your KYB is approved, your settlement account is confirmed, your webhook endpoint is responding, and your integration has been tested with at least one successful test transaction. All items must be green before live payments can be processed.`,
      },
    ],
  },
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function MerchantGuide() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>("getting-started");

  const filtered = sections.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.content.some(
        (c) => c.heading.toLowerCase().includes(q) || c.body.toLowerCase().includes(q)
      )
    );
  });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Merchant User Guide
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Everything you need to know about using PayGate as a merchant — from onboarding and
              accepting payments to managing disputes, issuing virtual cards, and configuring
              advanced fraud rules.
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 mt-1">
            v10.0
          </Badge>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search the guide…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Quick Nav */}
        {!search && (
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setExpanded(s.id);
                    document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted hover:bg-accent transition-colors"
                >
                  <Icon className={cn("w-3.5 h-3.5", s.color)} />
                  {s.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Sections */}
        <div className="space-y-3">
          {filtered.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No results found for "{search}". Try a different search term.
              </CardContent>
            </Card>
          )}
          {filtered.map((section) => {
            const Icon = section.icon;
            const isOpen = expanded === section.id || !!search;
            return (
              <Card key={section.id} id={`section-${section.id}`} className="overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors"
                  onClick={() => setExpanded(isOpen && !search ? null : section.id)}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn("w-5 h-5", section.color)} />
                    <span className="font-semibold text-base">{section.title}</span>
                  </div>
                  {!search &&
                    (isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    ))}
                </button>
                {isOpen && (
                  <CardContent className="pt-0 pb-6 px-5 space-y-6 border-t">
                    {section.content.map((item) => (
                      <div key={item.heading}>
                        <h3 className="font-semibold text-sm text-foreground mb-2">{item.heading}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pt-4 border-t">
          PayGate Merchant Guide · Last updated April 2026 · For support, email{" "}
          <a href="mailto:support@paygate.ng" className="underline">
            support@paygate.ng
          </a>
        </div>
      </div>
    </Layout>
  );
}
