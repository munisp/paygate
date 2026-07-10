import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, ArrowLeftRight, Users, CreditCard, BarChart3,
  ShoppingCart, Wallet, AlertTriangle, Key, Webhook, Settings,
  ChevronLeft, ChevronRight, Bell, Search, LogOut, Menu,
  Zap, Globe, Shield, Link2, Brain, Bot, ScrollText, CreditCard as BNPLIcon,
  QrCode, Smartphone, Code2, FileCheck, CheckCircle2, X, AlertOctagon,
  GitBranch, Building2, RefreshCw, Monitor, Map,
  ShieldAlert, Users2, Activity, UtensilsCrossed, ChefHat, Package, DollarSign, Star, Layers, Tag,
  Rocket, Crown, Server, FileText, Banknote, Scale, Coins,
  TrendingUp, Repeat, ArrowUpDown, FileSpreadsheet, FilePlus2,
  ShieldCheck, Fingerprint, BookOpen, Gift, Cpu, LineChart, Flame,
  Umbrella, Leaf, Gem, Bitcoin, Lock, CalendarClock, Clock, Receipt, FlaskConical,
  Landmark, Radio, MessageSquareCode, Network, Layers3, Tablet, Satellite, Palette,
  Database, ShieldPlus, Briefcase, PercentSquare, Volume2, PiggyBank,
  SplitSquareHorizontal, ListChecks, BookMarked, Bookmark, UserCheck, EyeOff,
  BarChart2, Building, ShoppingBag, Send, ChevronDown,
  Calendar, CheckSquare, Mic, Split, TrendingDown, Wifi, MessageSquare, Calculator, MapPin} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocation as useWouterLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import NotificationPanel, { useNotificationCount } from "./NotificationPanel";
import LiveChatWidget from "./LiveChatWidget";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePWA } from "@/hooks/usePWA";
import { Download, WifiOff, Moon, Sun, BellRing, BellOff } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Grouped Navigation ──────────────────────────────────────────────────────
type NavItem = { icon: React.ElementType; label: string; path: string; badge?: string; status?: "live" | "beta" | "degraded" | "new"; tooltip?: string };
type NavGroup = { title: string; icon: React.ElementType; items: NavItem[]; collapsible?: boolean };

const navGroups: NavGroup[] = [
  {
    title: "Overview",
    icon: LayoutDashboard,
    items: [
      { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      { icon: BarChart3, label: "Analytics", path: "/analytics" },
      { icon: BarChart2, label: "Merchant Analytics", path: "/merchant-analytics", badge: "New" },
      { icon: TrendingUp, label: "Market Data", path: "/market-data", badge: "New" },
      { icon: FileText, label: "Reports Center", path: "/reports" },
      { icon: Brain, label: "AI Insights", path: "/ai-insights", badge: "AI" },
      { icon: Bell, label: "Notifications", path: "/notifications" },
      { icon: CheckSquare, label: "Go-Live Checklist", path: "/go-live-checklist" },
    ],
  },
  {
    title: "Payments",
    icon: ArrowLeftRight,
    items: [
      { icon: ArrowLeftRight, label: "Transactions", path: "/transactions" },
      { icon: Users, label: "Customers", path: "/customers" },
      { icon: Bookmark, label: "Saved Beneficiaries", path: "/saved-beneficiaries", badge: "New" },
      { icon: ShoppingCart, label: "Checkout", path: "/checkout" },
      { icon: Link2, label: "Payment Links", path: "/payment-links" },
      { icon: QrCode, label: "QR Payments", path: "/qr-payments" },
      { icon: BarChart3, label: "QR Analytics", path: "/qr-analytics" },
      { icon: Zap, label: "Quick Pay", path: "/quick-pay" },
      { icon: Wifi, label: "NFC Tap-to-Pay", path: "/nfc-pay", badge: "New" },
      { icon: ShoppingBag, label: "Marketplace Pay", path: "/marketplace-pay", badge: "New" },
      { icon: CreditCard, label: "EMI Checkout", path: "/emi-checkout" },
      { icon: Split, label: "Split Payments", path: "/split-payments" },
      { icon: Users2, label: "Split Bill V2", path: "/split-bill-v2", badge: "New" },
      { icon: Layers, label: "Bulk Collections", path: "/bulk-collections" },
      { icon: Lock, label: "Privacy Payments", path: "/privacy-payments" },
      { icon: Mic, label: "Voice Payments", path: "/voice-payments" },
    ],
  },
  {
    title: "Cards & Wallets",
    icon: CreditCard,
    items: [
      { icon: CreditCard, label: "Virtual Cards", path: "/virtual-cards" },
      { icon: Wallet, label: "Multi-Currency Wallet", path: "/multi-currency-wallet" },
      { icon: Banknote, label: "BNPL", path: "/bnpl" },
      { icon: Calculator, label: "BNPL Calculator", path: "/bnpl/calculator" },
      { icon: Banknote, label: "BNPL v2", path: "/bnpl-v2" },
      { icon: DollarSign, label: "USDC Payouts", path: "/usdc-payouts" },
      { icon: DollarSign, label: "USDC V2", path: "/usdc-v2", badge: "New" },
      { icon: DollarSign, label: "USDC V3", path: "/usdc-v3", badge: "New" },
      { icon: TrendingDown, label: "Crypto Off-Ramp", path: "/crypto-offramp", badge: "New" },
      { icon: TrendingUp, label: "Crypto Ramp", path: "/crypto-ramp" },
      { icon: Gem, label: "Digital Gold", path: "/digital-gold" },
    ],
  },
  {
    title: "Subscriptions & Billing",
    icon: RefreshCw,
    items: [
      { icon: RefreshCw, label: "Subscriptions", path: "/subscriptions" },
      { icon: Calendar, label: "Recurring Billing", path: "/recurring-billing" },
      { icon: Receipt, label: "Subscription Billing v2", path: "/subscription-billing-v2" },
      { icon: Globe, label: "DCC Checkout", path: "/dcc-checkout" },
      { icon: CreditCard, label: "Portal Billing", path: "/billing" },
      { icon: Calculator, label: "Billing Engine", path: "/billing-engine", badge: "New" },
      { icon: BarChart2, label: "Billing Analytics", path: "/billing-engine/analytics" },
      { icon: Rocket, label: "Payment Config", path: "/settings/payments", badge: "Go-Live" },
    ],
  },
  {
    title: "FX & Cross-Border",
    icon: Globe,
    items: [
      { icon: TrendingUp, label: "FX & Rates", path: "/fx" },
      { icon: Activity, label: "Corridor Live Stats", path: "/corridor-live", badge: "New" },
      { icon: Globe, label: "Cross-Border", path: "/cross-border" },
      { icon: Send, label: "Remittance", path: "/remittance" },
      { icon: MapPin, label: "Remittance Tracker", path: "/remittance/tracker" },
      { icon: Send, label: "Remittance v2", path: "/remittance-v2" },
      { icon: Landmark, label: "Multi-Currency Ledger", path: "/multi-currency-ledger", badge: "New" },
      { icon: Building, label: "Nodal Accounts", path: "/nodal-accounts" },
      { icon: Radio, label: "RTGS", path: "/rtgs" },
      { icon: MessageSquareCode, label: "ISO 20022", path: "/iso20022" },
      { icon: Network, label: "MojaLoop", path: "/mojaloop" },
      { icon: Activity, label: "Rail Monitor", path: "/cross-border/rail-monitor", badge: "Live" },
      { icon: Globe, label: "CIPS Gateway", path: "/cross-border/cips" },
      { icon: Globe, label: "UPI Gateway", path: "/cross-border/upi" },
      { icon: Globe, label: "PIX Gateway", path: "/cross-border/pix" },
    ],
  },
  {
    title: "Payouts & Settlements",
    icon: Wallet,
    items: [
      { icon: Wallet, label: "Payouts", path: "/payouts" },
      { icon: Layers, label: "Payout Batching", path: "/payout-batching" },
      { icon: RefreshCw, label: "Refunds", path: "/refunds" },
      { icon: Banknote, label: "Settlements", path: "/settlements" },
      { icon: TrendingUp, label: "Settlement Forecast", path: "/settlement-forecast" },
      { icon: Wallet, label: "PTSP Settlement", path: "/ptsp-settlement" },
      { icon: Layers, label: "PTSP Batches", path: "/ptsp-batches" },
      { icon: ArrowLeftRight, label: "MoMo Recon", path: "/mobile-money" },
      { icon: FileSpreadsheet, label: "Recon Engine", path: "/reconciliation" },
      { icon: Scale, label: "Recon Alerts", path: "/reconciliation-alerts" },
    ],
  },
  {
    title: "Fraud & Risk",
    icon: Shield,
    items: [
      { icon: Brain, label: "Fraud & Risk", path: "/fraud-risk", badge: "AI" },
      { icon: Flame, label: "Fraud Heatmap", path: "/fraud-heatmap" },
      { icon: Radio, label: "Live Alerts", path: "/fraud/alerts", badge: "LIVE" },
      { icon: ShieldAlert, label: "WAF Alerts", path: "/infra/waf-alerts" },
      { icon: Shield, label: "Security Audit", path: "/security-audit", badge: "New" },
      { icon: Shield, label: "AML Monitor", path: "/aml-monitor" },
      { icon: Fingerprint, label: "Session Risk", path: "/session-risk" },
      { icon: ShieldAlert, label: "Geofence Alerts", path: "/geofence-alerts" },
      { icon: AlertTriangle, label: "Disputes", path: "/disputes" },
      { icon: AlertOctagon, label: "Dispute Automation", path: "/dispute-automation" },
      { icon: ShieldCheck, label: "Chargeback Auto", path: "/chargeback-automation" },
      { icon: ShieldAlert, label: "Chargeback Cases", path: "/chargeback-cases", badge: "New" },
      { icon: ShieldAlert, label: "Fraud Rules", path: "/fraud-rules", badge: "New" },
      { icon: Zap, label: "Fraud Rule Engine", path: "/fraud-rule-engine", badge: "New" },
      { icon: DollarSign, label: "Fee Schedules", path: "/fee-schedules", badge: "New" },
      { icon: MessageSquare, label: "Alert Comments", path: "/fraud-alert-comments", badge: "New" },
      { icon: Activity, label: "SLA Breaches", path: "/sla-breaches", badge: "New" },
    ],
  },
  {
    title: "Compliance & KYC",
    icon: FileCheck,
    items: [
      { icon: FileCheck, label: "Compliance & KYC", path: "/compliance" },
      { icon: Fingerprint, label: "Liveness Check", path: "/liveness-check", badge: "New" },
      { icon: Fingerprint, label: "Liveness Replay", path: "/liveness-replay", badge: "New" },
      { icon: FileCheck, label: "KYB Workflow", path: "/kyb-workflow" },
      { icon: Building2, label: "KYB Verification", path: "/kyb-verification", badge: "New" },
      { icon: FileCheck, label: "Compliance Reports", path: "/compliance-reports", badge: "New" },
      { icon: Receipt, label: "Tax Filing", path: "/tax-filing", badge: "New" },
      { icon: Receipt, label: "Tax Filing V2", path: "/tax-filing-v2", badge: "New" },
      { icon: Receipt, label: "Tx Receipts", path: "/transaction-receipts", badge: "New" },
      { icon: Receipt, label: "Tax Withholding", path: "/tax-withholding" },
      { icon: Receipt, label: "Tax Engine", path: "/tax-engine" },
      { icon: Scale, label: "Regulatory Reporting", path: "/regulatory-reporting", badge: "New" },
      { icon: FlaskConical, label: "Reg Sandbox", path: "/regulatory-sandbox" },
      { icon: ScrollText, label: "Audit Log", path: "/audit-log" },
      { icon: Shield, label: "Auth Events", path: "/settings/auth-events", badge: "New" },
      { icon: Monitor, label: "Active Sessions", path: "/settings/active-sessions" },
      { icon: Building2, label: "KYB Verifications", path: "/kyb-verifications", badge: "New" },
      { icon: FileCheck, label: "KYB Doc Upload", path: "/kyb-document-upload", badge: "New" },
    ],
  },
  {
    title: "Lending & Credit",
    icon: TrendingUp,
    items: [
      { icon: TrendingUp, label: "Merchant Lending", path: "/lending" },
      { icon: Landmark, label: "Merchant Lending v2", path: "/merchant-lending" },
      { icon: FilePlus2, label: "Invoice Builder", path: "/invoice-builder" },
      { icon: FilePlus2, label: "Invoice Financing V2", path: "/invoice-financing-v2", badge: "New" },
      { icon: FilePlus2, label: "Invoice Financing", path: "/invoice-financing", badge: "New" },
      { icon: Shield, label: "Escrow", path: "/escrow" },
      { icon: Shield, label: "Escrow V2", path: "/escrow-v2", badge: "New" },
      { icon: Shield, label: "Escrow Contracts", path: "/escrow-contracts", badge: "New" },
      { icon: Cpu, label: "Embedded Finance", path: "/embedded-finance" },
      { icon: Banknote, label: "Consumer Loans", path: "/consumer-loans", badge: "New" },
      { icon: RefreshCw, label: "Loan Repayments", path: "/loan-repayments", badge: "New" },
    ],
  },
  {
    title: "Wealth & Insurance",
    icon: PiggyBank,
    items: [
      { icon: TrendingUp, label: "Mutual Funds", path: "/mutual-funds" },
      { icon: ShieldPlus, label: "Consumer Insurance", path: "/consumer-insurance" },
      { icon: Umbrella, label: "Insurance", path: "/insurance" },
      { icon: ShieldPlus, label: "Insurance Hub", path: "/insurance/hub" },
      { icon: ShieldPlus, label: "Insurance Claims", path: "/insurance-claims", badge: "New" },
      { icon: CreditCard, label: "EMI Loans", path: "/emi-loans" },
      { icon: CreditCard, label: "EMI Management", path: "/emi-management" },
      { icon: RefreshCw, label: "Subscription Mgmt", path: "/subscription-management" },
      { icon: Webhook, label: "Webhook Events", path: "/webhook-events" },
      { icon: Tag, label: "Pricing", path: "/pricing" },
      { icon: PiggyBank, label: "Pension & NPS", path: "/pension-nps" },
      { icon: Briefcase, label: "Wealth Management", path: "/wealth-management" },
      { icon: Leaf, label: "Carbon Credits", path: "/carbon-credit" },
      { icon: Leaf, label: "Carbon Credits V2", path: "/carbon-credits-v2", badge: "New" },
      { icon: Leaf, label: "Carbon Ledger", path: "/carbon-credits-ledger", badge: "New" },
      { icon: Shield, label: "Insurance Policies", path: "/insurance-policies", badge: "New" },
      { icon: FileText, label: "Claim Documents", path: "/claim-documents", badge: "New" },
      { icon: BarChart2, label: "Portfolio Rebalancing", path: "/portfolio-rebalancing", badge: "New" },
      { icon: CreditCard, label: "Stripe Subscriptions", path: "/stripe-subscriptions", badge: "New" },
    ],
  },
  {
    title: "Loyalty & Rewards",
    icon: Star,
    items: [
      { icon: Gift, label: "Loyalty Engine", path: "/loyalty-engine" },
      { icon: Star, label: "Loyalty V3", path: "/loyalty-v3", badge: "New" },
      { icon: Gift, label: "Loyalty Ledger", path: "/loyalty-ledger", badge: "New" },
      { icon: Coins, label: "Loyalty Redemption", path: "/loyalty-redemption", badge: "New" },
      // Wave 123
      { icon: Brain, label: "AI Model Admin", path: "/ai-model-admin", badge: "New" },
      { icon: UtensilsCrossed, label: "Menu Management", path: "/menu-management", badge: "New" },
      { icon: Activity, label: "Portal Health", path: "/portal-health", badge: "New" },
      // Wave 124
      { icon: Receipt, label: "Bill Payments", path: "/bill-payments", badge: "New" },
      { icon: Leaf, label: "Carbon Credits", path: "/carbon-credits", badge: "New" },
      { icon: Gift, label: "Referral Program", path: "/referral-program", badge: "New" },
      { icon: Tag, label: "Coupon Management", path: "/coupon-management", badge: "New" },
      { icon: Star, label: "Loyalty Program", path: "/loyalty-program", badge: "New" },
      { icon: Gift, label: "Red Envelopes", path: "/red-envelopes", badge: "New" },
      { icon: PercentSquare, label: "Cashback & Rewards", path: "/cashback-rewards" },
      { icon: Gem, label: "NFT Badges", path: "/nft-badges" },
      { icon: BookOpen, label: "Open Banking", path: "/open-banking" },
      { icon: BookOpen, label: "Open Banking V2", path: "/open-banking-v2", badge: "New" },
      { icon: Network, label: "Open Finance", path: "/open-finance" },
      { icon: BookOpen, label: "Open Banking Portal", path: "/open-banking-portal" },
    ],
  },
  {
    title: "POS & Terminals",
    icon: Monitor,
    items: [
      { icon: Monitor, label: "POS Terminals", path: "/pos-terminals" },
      { icon: ArrowLeftRight, label: "POS Transactions", path: "/pos-transactions", badge: "New" },
      { icon: Map, label: "Terminal Map", path: "/terminal-map" },
      { icon: FileCheck, label: "POS Reconciliation", path: "/pos-reconciliation" },
      { icon: ShoppingBag, label: "Smart Retail POS", path: "/smart-pos" },
      { icon: Tablet, label: "POS v2", path: "/pos-v2" },
      { icon: Tablet, label: "Mobile POS", path: "/mobile-pos" },
      { icon: Activity, label: "Kiosk Health", path: "/kiosk-health" },
    ],
  },
  {
    title: "Agent & USSD",
    icon: Network,
    items: [
      { icon: Users, label: "Agent Banking", path: "/agent-banking" },
      { icon: Users, label: "Agent Banking V4", path: "/agent-banking-v4", badge: "New" },
      { icon: Network, label: "Agent Network v2", path: "/agent-network" },
      { icon: Network, label: "Super-Agent V2", path: "/super-agent-v2", badge: "New" },
      { icon: Users2, label: "Super Agent Mgmt", path: "/super-agent-management", badge: "New" },
      { icon: Radio, label: "USSD Session V2", path: "/ussd-v2", badge: "New" },
      { icon: Radio, label: "USSD Sessions", path: "/ussd-sessions", badge: "New" },
    ],
  },
  {
    title: "Retail & Restaurant",
    icon: UtensilsCrossed,
    items: [
      { icon: UtensilsCrossed, label: "Floor Plan", path: "/restaurant/floor-plan" },
      { icon: UtensilsCrossed, label: "Orders", path: "/restaurant/orders" },
      { icon: UtensilsCrossed, label: "Menu", path: "/restaurant/menu" },
      { icon: Star, label: "Loyalty", path: "/restaurant/loyalty" },
      { icon: Globe, label: "Online Ordering", path: "/restaurant/online-ordering" },
      { icon: ChefHat, label: "Kitchen Display", path: "/kitchen-display" },
      { icon: Package, label: "Inventory", path: "/inventory" },
      { icon: ShoppingCart, label: "Purchase Orders", path: "/purchase-orders" },
      { icon: Building2, label: "Vendor Directory", path: "/vendors" },
      { icon: Tablet, label: "Super App", path: "/super-app" },
    ],
  },
  {
    title: "HR & Payroll",
    icon: DollarSign,
    items: [
      { icon: DollarSign, label: "Payroll", path: "/payroll" },
      { icon: DollarSign, label: "Payroll v2", path: "/payroll-v2" },
      { icon: DollarSign, label: "Payroll V3", path: "/payroll-v3", badge: "New" },
      { icon: UserCheck, label: "Salary Accounts", path: "/salary-accounts" },
      { icon: Users, label: "Team & Roles", path: "/team" },
      { icon: Users2, label: "Staff Management", path: "/staff-management", badge: "New" },
    ],
  },
  {
    title: "Operations",
    icon: Server,
    items: [
      { icon: Server, label: "Service Health", path: "/microservice-health" },
      { icon: Activity, label: "Temporal Workflows", path: "/temporal-workflows", badge: "New" },
      { icon: Server, label: "gRPC Health Check", path: "/grpc-health", badge: "New" },
      { icon: Wifi, label: "Resilience Center", path: "/resilience-center", badge: "New" },
      { icon: Network, label: "Middleware Wiring Audit", path: "/middleware-wiring-audit", badge: "New" },
      { icon: GitBranch, label: "Service Integration Audit", path: "/service-integration-audit", badge: "New" },
      { icon: BarChart3, label: "UI/UX Audit Dashboard", path: "/uiux-audit", badge: "New" },
      { icon: Rocket, label: "Production Readiness", path: "/production-readiness", badge: "New" },
      { icon: GitBranch, label: "Workflows", path: "/workflows" },
      { icon: Database, label: "Lakehouse v2", path: "/lakehouse-v2" },
      { icon: Satellite, label: "White-Label SDK", path: "/white-label-sdk" },
      { icon: Code2, label: "SDK Portal", path: "/sdk-portal" },
      { icon: LineChart, label: "Cohort Analytics", path: "/cohort-analytics" },
      { icon: CalendarClock, label: "Bulk Scheduler", path: "/bulk-scheduler" },
      { icon: Bot, label: "Ollama AI Chat", path: "/ollama-chat", badge: "AI" },
      { icon: Bell, label: "Realtime Notifications", path: "/realtime-notifications", badge: "New" },
      { icon: Clock, label: "Settlement SLA", path: "/settlement-sla", badge: "New" },
      { icon: Download, label: "Data Export", path: "/data-export", badge: "New" },
      { icon: Rocket, label: "Onboarding Status", path: "/onboarding-status", badge: "New" },
    ],
  },
  {
    title: "Platform Admin",
    icon: Crown,
    items: [
      { icon: LayoutDashboard, label: "Admin Overview", path: "/admin", badge: "Admin" },
      { icon: Users, label: "Merchants", path: "/admin/merchants", badge: "Admin" },
      { icon: ShieldCheck, label: "KYC Review", path: "/admin/kyc", badge: "Admin" },
      { icon: AlertTriangle, label: "Disputes", path: "/admin/disputes", badge: "Admin" },
      { icon: Brain, label: "Fraud", path: "/admin/fraud", badge: "Admin" },
      { icon: BarChart3, label: "Revenue", path: "/admin/revenue", badge: "Admin" },
      { icon: ArrowLeftRight, label: "Settlements", path: "/admin/settlements", badge: "Admin" },
      { icon: Shield, label: "Compliance", path: "/admin/compliance", badge: "Admin" },
      { icon: Zap, label: "System Health", path: "/admin/health", badge: "Admin" },
      { icon: ScrollText, label: "Audit Trail", path: "/admin/audit", badge: "Admin" },
      { icon: Settings, label: "Config", path: "/admin/config", badge: "Admin" },
      { icon: Crown, label: "Admin Setup", path: "/admin-setup" },
      { icon: MessageSquare, label: "Support Inbox", path: "/admin/support", badge: "Admin" },
      { icon: MessageSquare, label: "Support Chat", path: "/support-chat", badge: "Admin" },
            { icon: Brain, label: "GNN Training", path: "/admin/gnn-training", badge: "Admin" },
      { icon: Shield, label: "Keycloak SSO", path: "/admin/keycloak", badge: "Admin" },
      { icon: Clock, label: "Settlement SLA", path: "/admin/settlement-sla", badge: "Admin" },
      { icon: AlertTriangle, label: "Dispute Lifecycle", path: "/admin/dispute-lifecycle", badge: "Admin" },
{ icon: Layers3, label: "Data Pipeline", path: "/admin/data-pipeline", badge: "Admin" },
      { icon: Building2, label: "Partner Onboarding", path: "/admin/partner-onboarding", badge: "Admin" },
      { icon: Building2, label: "Partner Admin", path: "/partner/admin", badge: "Admin" },
      { icon: Palette, label: "Tenant Branding", path: "/tenant/branding", badge: "Admin" },
      { icon: Rocket, label: "Tenant Provisioning", path: "/admin/tenant-provisioning", badge: "New" },
      { icon: Globe, label: "FX Corridors", path: "/admin/corridors", badge: "Admin" },
      { icon: DollarSign, label: "Plan Limits", path: "/admin/plan-limits", badge: "Admin" },
      { icon: FileText, label: "Billing Invoices", path: "/admin/billing-invoices", badge: "Admin" },
      { icon: ShieldCheck, label: "SSO Config", path: "/admin/sso-config", badge: "Admin" },
      { icon: Users2, label: "Invite Codes", path: "/admin/invite-codes-v2", badge: "Admin" },
      { icon: ShieldAlert, label: "Fraud Rings", path: "/admin/fraud-rings", badge: "Admin" },
      { icon: Brain, label: "GNN Thresholds", path: "/admin/gnn-threshold", badge: "Admin" },
    ],
  },
  {
    title: "NextHub SRBE",
    icon: Landmark,
    items: [
      { icon: Landmark, label: "Settlement Windows", path: "/nexthub/settlement", badge: "NextHub" },
      { icon: Scale, label: "Reconciliation", path: "/nexthub/reconciliation", badge: "NextHub" },
      { icon: Banknote, label: "Billing Hub", path: "/nexthub/billing", badge: "NextHub" },
      { icon: ShieldAlert, label: "Disputes", path: "/nexthub/disputes", badge: "NextHub" },
      { icon: Network, label: "Security Dashboard", path: "/nexthub/security", badge: "NextHub" },
      { icon: Building2, label: "DFSP Management", path: "/nexthub/dfsps", badge: "NextHub" },
      { icon: Globe, label: "Oracle Registry", path: "/nexthub/oracles", badge: "NextHub" },
      { icon: TrendingUp, label: "FX Dashboard", path: "/nexthub/fx", badge: "NextHub" },
      { icon: Layers, label: "Bulk Transfers", path: "/nexthub/bulk-transfers", badge: "NextHub" },
      { icon: ShieldCheck, label: "PISP Consents", path: "/nexthub/pisp", badge: "NextHub" },
      { icon: Users, label: "Participants", path: "/nexthub/participants", badge: "W220", status: "live" as const, tooltip: "DFSP participant lifecycle, position limits, net debit cap" },
      { icon: Network, label: "DFSP Topology", path: "/nexthub/topology", badge: "W223", status: "live" as const, tooltip: "Visual DFSP network topology map" },
      { icon: Layers, label: "Bulk Transfer", path: "/nexthub/bulk-transfer", badge: "W223", status: "live" as const, tooltip: "Multi-row bulk transfer wizard with CSV upload" },
      { icon: TrendingUp, label: "NDC / Limits", path: "/nexthub/ndc-limits", badge: "W223", status: "live" as const, tooltip: "Edit net debit caps and position limits per participant" },
      { icon: Building2, label: "Settlement Banks", path: "/nexthub/settlement-banks", badge: "W223", status: "live" as const, tooltip: "Manage settlement bank accounts and RTGS/NIP config" },
    ],
  },
  {
    title: "Domain Expansion",
    icon: Globe,
    collapsible: true,
    items: [
      { icon: LayoutDashboard, label: "Domain Overview", path: "/domains/overview", badge: "New", status: "live", tooltip: "Unified metrics dashboard for all 7 domain verticals" },
      { icon: Send, label: "Remittance Corridors", path: "/domains/remittance", badge: "W211", status: "live", tooltip: "Multi-hop FX corridors with FATF Travel Rule enforcement" },
      { icon: Briefcase, label: "Healthcare Claims", path: "/domains/healthcare", badge: "W212", status: "live", tooltip: "NHIA-integrated claims adjudication and payment disbursement" },
      { icon: Umbrella, label: "Insurance Hub", path: "/domains/insurance", badge: "W213", status: "live", tooltip: "Premium collection, lapse detection, and claims lifecycle" },
      { icon: FileText, label: "Supply Chain Finance", path: "/domains/scf", badge: "W214", status: "live", tooltip: "Dynamic discounting, invoice tokenisation, 3-way settlement" },
      { icon: Users, label: "G2P Disbursements", path: "/domains/g2p", badge: "W215", status: "live", tooltip: "Bulk government-to-person disbursements — NASIMS, CCT, N-Power" },
      { icon: Zap, label: "Energy VEND", path: "/domains/energy", badge: "W216", status: "live", tooltip: "DISCO electricity vending with NEPA STS token generation" },
      { icon: Coins, label: "CBDC Rails", path: "/domains/cbdc", badge: "W217", status: "beta", tooltip: "eNaira, ECB TIPS, FedNow, DCEP — TigerBeetle CBDC ledger" },
      { icon: Zap, label: "Saga Visualizer", path: "/domains/sagas", badge: "W221", status: "live", tooltip: "Real-time FHIR payment orchestration and CBDC atomic swap workflow tracker" },
    ],
  },
];

const platformOpsItems: NavItem[] = [
  { icon: Activity, label: "Domain Health", path: "/platform/health", badge: "W221" },
  { icon: BarChart3, label: "Saga Metrics", path: "/platform/saga-metrics", badge: "W221" },
  { icon: Shield, label: "Compliance Score", path: "/platform/compliance", badge: "W221" },
  { icon: Code2, label: "Protocol Validator", path: "/platform/protocol-validator", badge: "W221" },
  { icon: Users, label: "Beneficiary Registry", path: "/platform/beneficiary-registry", badge: "W221" },
  { icon: DollarSign, label: "Cost Centres", path: "/platform/cost-centres", badge: "W221" },
  { icon: Shield, label: "API Rate Limits", path: "/platform/api-rate-limits", badge: "W223" },
  { icon: FileText, label: "KYC Documents", path: "/compliance/kyc-documents", badge: "W223" },
  { icon: CheckCircle2, label: "Merchant Verification", path: "/compliance/merchant-verification", badge: "W223" },
];

const devItems: NavItem[] = [
  { icon: Key, label: "API Keys", path: "/api-keys" },
  { icon: Key, label: "SDK Tokens", path: "/sdk-tokens", badge: "New" },
  { icon: Webhook, label: "Webhooks", path: "/webhooks" },
      { icon: Activity, label: "Live Stream", path: "/webhook-live" },
  { icon: Zap, label: "Webhook Sim V2", path: "/webhook-simulator-v2", badge: "New" },
  { icon: Code2, label: "Developer", path: "/developer" },
  { icon: Code2, label: "Dev Sandbox", path: "/developer-sandbox", badge: "New" },
  { icon: QrCode, label: "QR Generator", path: "/qr-generator", badge: "New" },
  { icon: BookMarked, label: "API Docs Portal", path: "/api-docs" },
  { icon: Shield, label: "Role Sync", path: "/role-sync" },
  { icon: Building2, label: "NIP Banks", path: "/nip-banks", badge: "CBN" },
  { icon: Code2, label: "Developer Settings", path: "/settings/developer", badge: "W221" },
  { icon: Settings, label: "Settings", path: "/settings" },
  { icon: BookOpen, label: "Help Guide", path: "/docs/merchant-guide" },
  { icon: Bell, label: "Notifications", path: "/settings/notifications", badge: "W223" },
  { icon: Monitor, label: "POS Terminals", path: "/settings/pos-terminals", badge: "W223" },
];
const analyticsItems: NavItem[] = [
  { icon: TrendingUp, label: "Revenue Analytics", path: "/analytics/revenue", badge: "W223" },
  { icon: Globe, label: "FX Rates", path: "/fx/rates", badge: "W223" },
  { icon: Link2, label: "Payment Link Builder", path: "/payment-links/builder", badge: "W223" },
  { icon: CreditCard, label: "Subscriptions", path: "/billing/subscriptions", badge: "W223" },
  { icon: Coins, label: "CBDC Wallets", path: "/cbdc/wallets", badge: "W223" },
];
const onboardingHubItems: NavItem[] = [
  { icon: Building2, label: "Onboarding Hub", path: "/onboarding", badge: "W223" },
  { icon: Network, label: "DFSP Onboarding", path: "/onboarding/dfsp", badge: "W223" },
  { icon: Zap, label: "PISP Onboarding", path: "/onboarding/pisp", badge: "W223" },
  { icon: CreditCard, label: "PSP Onboarding", path: "/onboarding/psp", badge: "W223" },
  { icon: Monitor, label: "POS Operator", path: "/onboarding/pos-operator", badge: "W223" },
  { icon: Shield, label: "Regulator", path: "/onboarding/regulator", badge: "W223" },
  { icon: Landmark, label: "Settlement Bank", path: "/onboarding/settlement-bank", badge: "W223" },
];

const ONBOARDING_STEPS = [
  "Create merchant account",
  "Verify business details",
  "Add bank account",
  "Complete KYC",
  "Go live",
];

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const layout60Interval = useAdaptiveInterval(60_000);
  const layout300Interval = useAdaptiveInterval(300_000);
  const layoutInterval = useAdaptiveInterval(30_000);
  const [location, navigate] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // Track which groups are expanded; default: expand the group containing the active route
  const activeGroup = navGroups.find(g => g.items.some(i => i.path === location || (location === "/" && i.path === "/dashboard")));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(activeGroup ? [activeGroup.title] : ["Overview"])
  );

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  // Auto-expand the group of the active route when navigating
  useEffect(() => {
    const group = navGroups.find(g => g.items.some(i => i.path === location));
    if (group) setExpandedGroups(prev => new Set(Array.from(prev).concat(group.title)));
  }, [location]);

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isSubscribed, isLoading: pushLoading, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushNotifications();

  // ─── Fraud Alert Banner ──────────────────────────────────────────────────
  const { data: fraudData, refetch: refetchAlerts } = trpc.fraudRisk.getAlerts.useQuery(
    undefined,
    { refetchInterval: layoutInterval, staleTime: 20_000 }
  );
  const acknowledgeMutation = trpc.fraudRisk.acknowledge.useMutation({
    onSuccess: (_, vars) => {
      setDismissedAlerts(prev => new Set(Array.from(prev).concat(vars.id)));
      refetchAlerts();
      toast.success("Alert acknowledged — moved to investigating");
    },
  });

  const visibleAlerts = (fraudData?.alerts ?? []).filter(
    (a: any) => !dismissedAlerts.has(a.id)
  );

  // ─── Stripe Mode Banner ─────────────────────────────────────────────────
  const { data: checklistData } = trpc.system.goLiveChecklist.useQuery(undefined, {
    refetchInterval: layout300Interval,
    staleTime: 240_000,
  });
  const stripeItem = checklistData?.items.find((i: any) => i.id === "stripe_live_keys");
  const isTestMode = stripeItem?.status !== "ok";
  const [dismissedStripeBanner, setDismissedStripeBanner] = useState(false);

  // ─── SLA Breach Banner ───────────────────────────────────────────────────
  const [dismissedSlaIds, setDismissedSlaIds] = useState<Set<string>>(new Set());
  const { data: slaData } = trpc.settlements.listBreached.useQuery(
    undefined,
    { refetchInterval: layout60Interval, staleTime: 30_000 }
  );
  const visibleSlaBreaches = (slaData?.breached ?? []).filter(
    (s: any) => !dismissedSlaIds.has(s.id)
  );

  // ─── Reconciliation Alert Badge ──────────────────────────────────────────
  const { data: reconStats } = trpc.reconciliation.getStats.useQuery(
    { merchantId: undefined },
    { refetchInterval: layout60Interval, staleTime: 50_000 }
  );
  const { data: reconAlertSettings } = trpc.settings.getReconAlertSettings.useQuery(
    undefined,
    { staleTime: 5 * 60_000 }
  );
  const openReconCount = reconStats?.open ?? 0;
  const reconBadgeEnabled = reconAlertSettings?.reconAlertBadgeEnabled ?? true;
  const reconBadgeThreshold = reconAlertSettings?.reconAlertThreshold ?? 1;
  const showReconBadge = reconBadgeEnabled && openReconCount >= reconBadgeThreshold;

  const [reconDrawerOpen, setReconDrawerOpen] = useState(false);
  const { data: reconAlerts, refetch: refetchReconAlerts } = trpc.reconciliation.listAlerts.useQuery(
    { status: "open", limit: 20, offset: 0 },
    { enabled: reconDrawerOpen, staleTime: 30_000 }
  );
  const dismissReconAlert = trpc.reconciliation.dismissAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert dismissed");
      refetchReconAlerts();
      trpc.useUtils().reconciliation.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const resolveReconAlert = trpc.reconciliation.updateAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert marked as resolved");
      refetchReconAlerts();
      trpc.useUtils().reconciliation.getStats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const inAppUnread = useNotificationCount();
  const { isInstallable, promptInstall, isOnline, dismissInstall } = usePWA();
  const showPwaBanner = isInstallable;

  // ─── Onboarding Status ───────────────────────────────────────────────────
  const { data: onboardingData } = trpc.onboarding.getStatus.useQuery(undefined, {
    staleTime: 60_000,
  });
  const onboardingStep = onboardingData?.merchant?.onboardingStep ?? 0;
  const onboardingComplete = onboardingData?.isComplete ?? false;
  const onboardingPct = Math.round((onboardingStep / ONBOARDING_STEPS.length) * 100);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const merchantName = onboardingData?.merchant?.businessName ?? user?.name ?? "Merchant";
  const merchantEmail = user?.email ?? "";
  const initials = merchantName.slice(0, 2).toUpperCase();

  const renderNavItem = (item: NavItem) => {
    const isActive = location === item.path || (location === "/" && item.path === "/dashboard");
    const isReconItem = item.path === "/reconciliation-alerts";
    const statusDotClass = item.status === "live" ? "bg-emerald-400"
      : item.status === "beta" ? "bg-amber-400"
      : item.status === "degraded" ? "bg-red-400"
      : item.status === "new" ? "bg-blue-400"
      : null;
    const linkContent = (
      <Link
        key={item.path}
        href={item.path}
        className={`sidebar-item relative ${isActive ? "active" : "text-sidebar-foreground/70"}`}
        onClick={() => setMobileOpen(false)}
      >
        <span className="relative flex-shrink-0">
          <item.icon className="w-4 h-4" />
          {statusDotClass && (
            <span className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${statusDotClass} ring-1 ring-sidebar`} />
          )}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-sm">{item.label}</span>
            {isReconItem && showReconBadge && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReconDrawerOpen(true); }}
                className="focus:outline-none"
                title={`${openReconCount} open reconciliation alert${openReconCount !== 1 ? "s" : ""}`}
              >
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-red-500/20 text-red-400 border-0 min-w-[1.25rem] text-center hover:bg-red-500/30 transition-colors">
                  {openReconCount > 99 ? "99+" : openReconCount}
                </Badge>
              </button>
            )}
            {!isReconItem && item.badge && (
              <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${
                item.badge === "Live" ? "bg-emerald-500/20 text-emerald-400 border-0"
                : item.badge === "AI" ? "bg-violet-500/20 text-violet-400 border-0"
                : item.badge === "Admin" ? "bg-amber-500/20 text-amber-400 border-0"
                : item.badge === "NextHub" ? "bg-indigo-500/20 text-indigo-400 border-0"
                : item.badge?.startsWith("W2") ? "bg-teal-500/20 text-teal-400 border-0"
                : "bg-blue-500/20 text-blue-400 border-0"
              }`}>
                {item.badge}
              </Badge>
            )}
          </>
        )}
        {collapsed && isReconItem && showReconBadge && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />
        )}
      </Link>
    );
    if (item.tooltip && collapsed) {
      return (
        <Tooltip key={item.path} delayDuration={300}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[200px] text-xs">{item.label}{item.tooltip ? ` — ${item.tooltip}` : ""}</TooltipContent>
        </Tooltip>
      );
    }
    if (item.tooltip && !collapsed) {
      return (
        <Tooltip key={item.path} delayDuration={500}>
          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
          <TooltipContent side="right" className="max-w-[220px] text-xs">{item.tooltip}</TooltipContent>
        </Tooltip>
      );
    }
    return linkContent;
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-bold text-sidebar-foreground text-lg" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              PayGate
            </span>
            <div className="text-xs text-sidebar-foreground/50">Merchant Portal</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.title);
          const hasActive = group.items.some(i => i.path === location || (location === "/" && i.path === "/dashboard"));

          if (collapsed) {
            // Collapsed: show only icons, no group headers
            return (
              <div key={group.title} className="mb-1">
                {group.items.map(renderNavItem)}
              </div>
            );
          }

          return (
            <div key={group.title} className="mb-1">
              {/* Group header — clickable to expand/collapse */}
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                  hasActive
                    ? "text-sidebar-primary"
                    : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
                }`}
              >
                <group.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 text-left">{group.title}</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2">
                  {group.items.map(renderNavItem)}
                </div>
              )}
            </div>
          );
        })}

        {/* Developer section */}
        {!collapsed && (
          <button
            type="button"
            onClick={() => toggleGroup("__dev__")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors mt-1"
          >
            <Code2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Developer</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedGroups.has("__dev__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__dev__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
            {devItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-blue-500/20 text-blue-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {/* Platform Operations section */}
        {!collapsed && (
          <button
            className="sidebar-section-header w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider hover:text-sidebar-foreground/70 transition-colors"
            onClick={() => toggleGroup("__platform_ops__")}
          >
            <Activity className="w-3 h-3" />
            <span className="flex-1 text-left">Platform Ops</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedGroups.has("__platform_ops__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__platform_ops__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
            {platformOpsItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-purple-500/20 text-purple-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
              {/* Analytics & Monetisation section */}
        {!collapsed && (
          <button
            onClick={() => toggleGroup("__analytics__")}
            className="sidebar-item w-full justify-between text-sidebar-foreground/50 hover:text-sidebar-foreground text-xs uppercase tracking-wider font-semibold mt-2"
          >
            <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" />Analytics & Monetisation</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroups.has("__analytics__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__analytics__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
            {analyticsItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-green-500/20 text-green-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {/* Onboarding Hub section */}
        {!collapsed && (
          <button
            onClick={() => toggleGroup("__onboarding_hub__")}
            className="sidebar-item w-full justify-between text-sidebar-foreground/50 hover:text-sidebar-foreground text-xs uppercase tracking-wider font-semibold mt-2"
          >
            <span className="flex items-center gap-2"><Rocket className="w-3.5 h-3.5" />Onboarding Hub</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroups.has("__onboarding_hub__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__onboarding_hub__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
            {onboardingHubItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-sm">{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-orange-500/20 text-orange-400 border-0">
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
        {/* Regulator Portal section */}
        {!collapsed && (
          <button
            onClick={() => toggleGroup("__regulator__")}
            className="sidebar-item w-full justify-between text-sidebar-foreground/50 hover:text-sidebar-foreground text-xs uppercase tracking-wider font-semibold mt-2"
          >
            <span className="flex items-center gap-2"><ShieldCheck className="w-3.5 h-3.5" />Regulator Portal</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expandedGroups.has("__regulator__") ? "rotate-180" : ""}`} />
          </button>
        )}
        {(collapsed || expandedGroups.has("__regulator__")) && (
          <div className={!collapsed ? "ml-2 pl-2 border-l border-sidebar-border/50 space-y-0.5 mb-2" : ""}>
            {regulatorItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`sidebar-item ${isActive ? "active" : "text-sidebar-foreground/70"}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 text-sm">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
      {/* Onboarding Progress Tracker */}
      {!collapsed && !onboardingComplete && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-blue-400">Getting Started</span>
              <span className="text-xs text-blue-400/70">{onboardingStep}/{ONBOARDING_STEPS.length}</span>
            </div>
            <Progress value={onboardingPct} className="h-1.5 mb-2" />
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {onboardingStep < ONBOARDING_STEPS.length
                ? `Next: ${ONBOARDING_STEPS[onboardingStep]}`
                : "All steps complete!"}
            </p>
            <Link href="/onboarding" className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2">
              Continue setup →
            </Link>
          </div>
        </div>
      )}
      {!collapsed && onboardingComplete && (
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-medium text-amber-400">Test Mode</span>
          </div>
        </div>
      )}

      {/* User profile */}
      <div className="px-3 py-3 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent transition-colors ${collapsed ? "justify-center" : ""}`}>
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{merchantName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{merchantEmail}</p>
            </div>
          )}
          {!collapsed && (
            <div className="flex items-center gap-1">
              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors p-1 rounded"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              {/* Push notifications toggle */}
              <button
                onClick={isSubscribed ? unsubscribePush : subscribePush}
                disabled={pushLoading}
                title={isSubscribed ? 'Disable push notifications' : 'Enable push notifications'}
                className={`transition-colors p-1 rounded ${
                  isSubscribed
                    ? 'text-emerald-400 hover:text-emerald-300'
                    : 'text-sidebar-foreground/40 hover:text-sidebar-foreground'
                }`}
              >
                {isSubscribed ? <BellRing className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              </button>
              {/* Logout */}
              <button onClick={handleLogout} className="text-sidebar-foreground/40 hover:text-red-400 transition-colors p-1 rounded">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Skip to main content — keyboard / screen-reader accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-sidebar transition-all duration-300 flex-shrink-0 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 translate-x-full bg-sidebar border border-sidebar-border rounded-r-lg p-1 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors z-10"
          style={{ left: collapsed ? "3.5rem" : "15.5rem" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-sidebar flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Fraud Alert Banner */}
        {visibleAlerts.length > 0 && (
          <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-3 flex-shrink-0 z-20">
            <AlertOctagon className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                {visibleAlerts.length} High-Severity Fraud Alert{visibleAlerts.length > 1 ? "s" : ""}
              </span>
              <span className="text-sm text-red-100 ml-2 truncate hidden sm:inline">
                {visibleAlerts[0].alertType?.replace(/_/g, " ")} — Risk score: {visibleAlerts[0].riskScore}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/fraud-risk">
                <a className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors">
                  View Alerts
                </a>
              </Link>
              <button
                onClick={() => acknowledgeMutation.mutate({ id: visibleAlerts[0].id })}
                disabled={acknowledgeMutation.isPending}
                className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors disabled:opacity-50"
              >
                Acknowledge
              </button>
              <button
                onClick={() => setDismissedAlerts(prev => new Set(Array.from(prev).concat(visibleAlerts[0].id)))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* SLA Breach Banner */}
        {visibleSlaBreaches.length > 0 && (
          <div className="bg-orange-600 text-white px-4 py-2 flex items-center gap-3 flex-shrink-0 z-20">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">
                {visibleSlaBreaches.length} Settlement SLA Breach{visibleSlaBreaches.length > 1 ? "es" : ""}
              </span>
              <span className="text-sm text-orange-100 ml-2 truncate hidden sm:inline">
                {visibleSlaBreaches[0].reference} — {visibleSlaBreaches[0].severity === "critical" ? "CRITICAL" : "overdue"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href="/settlements">
                <a className="text-xs font-medium bg-white/20 hover:bg-white/30 px-3 py-1 rounded-md transition-colors">
                  View Settlements
                </a>
              </Link>
              <button
                onClick={() => setDismissedSlaIds(prev => new Set(Array.from(prev).concat(visibleSlaBreaches[0].id)))}
                className="p-1 hover:bg-white/20 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* PWA Install Banner */}
        {showPwaBanner && (
          <div className="flex items-center gap-3 px-6 py-2 bg-indigo-600 text-white text-sm">
            <Download className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">Install PayGate as an app for faster access — works offline too.</span>
            <button onClick={() => { promptInstall(); }} className="px-3 py-1 rounded bg-white text-indigo-700 font-semibold text-xs hover:bg-indigo-50 transition-colors">
              Install
            </button>
            <button onClick={() => { dismissInstall(); }} className="p-1 rounded hover:bg-indigo-500 transition-colors" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Offline Banner */}
        {!isOnline && (
          <div className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white text-sm">
            <WifiOff className="w-4 h-4" />
            <span>You are offline. Some features may be unavailable.</span>
          </div>
        )}

        {/* Top Bar */}
        <header className="flex items-center gap-4 px-6 py-4 bg-card border-b border-border flex-shrink-0">
          <button className="lg:hidden text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search transactions, customers..."
                className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {checklistData && !dismissedStripeBanner && (
              isTestMode ? (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  <span className="text-xs font-medium text-orange-700">Test Mode</span>
                  <button onClick={() => setDismissedStripeBanner(true)} className="ml-1 text-orange-400 hover:text-orange-600" title="Dismiss">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700">Live Mode</span>
                </div>
              )
            )}
            {!checklistData && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-700">Live</span>
              </div>
            )}

            <button
              onClick={() => setNotifOpen(true)}
              className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <Bell className="w-5 h-5" />
              {(inAppUnread + visibleAlerts.length) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {inAppUnread + visibleAlerts.length}
                </span>
              )}
            </button>

            <button className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <Globe className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main id="main-content" aria-label="Main content" className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Notification Panel */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <LiveChatWidget />

      {/* Reconciliation Alert Drawer */}
      <Sheet open={reconDrawerOpen} onOpenChange={setReconDrawerOpen}>
        <SheetContent side="right" className="w-[420px] sm:w-[480px] flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Open Reconciliation Alerts
              {openReconCount > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">{openReconCount} open</span>
              )}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {!reconAlerts || reconAlerts.alerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                No open reconciliation alerts
              </div>
            ) : (
              reconAlerts.alerts.map((alert: any) => (
                <div key={alert.id} className="rounded-lg border border-border p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{alert.alertType?.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.merchantId} · {new Date(alert.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Badge variant="secondary" className={`text-xs ${alert.severity === "critical" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400"} border-0`}>
                      {alert.severity}
                    </Badge>
                  </div>
                  {alert.description && <p className="text-xs text-muted-foreground">{alert.description}</p>}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => resolveReconAlert.mutate({ id: alert.id, status: "resolved" })}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => dismissReconAlert.mutate({ id: alert.id })}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
const regulatorItems = [
  { label: "Regulatory Dashboard", path: "/regulator", icon: ShieldCheck },
];

