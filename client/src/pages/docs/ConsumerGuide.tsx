/**
 * ConsumerGuide.tsx
 *
 * Comprehensive in-app user guide for PayGate consumers.
 * Covers wallet, payments, BNPL, loyalty, security, and more.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import ConsumerLayout from "@/pages/consumer/ConsumerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Search,
  BookOpen,
  Wallet,
  Send,
  QrCode,
  Bell,
  Shield,
  CreditCard,
  BarChart3,
  RefreshCw,
  Users,
  Gift,
  Smartphone,
  Globe,
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
        heading: "Welcome to PayGate Wallet",
        body: `PayGate Wallet is your all-in-one digital payment companion. You can send and receive money instantly, pay bills, shop online, split expenses with friends, and earn loyalty rewards — all from your phone or browser. This guide explains every feature so you can get the most out of your account.`,
      },
      {
        heading: "Creating Your Account",
        body: `Download the PayGate app or visit the web portal and tap Sign Up. Enter your phone number, verify the OTP, and set a 6-digit PIN. You will also be asked to enable biometric authentication (fingerprint or Face ID) for faster and more secure logins. Your account is ready to use immediately for receiving money. To unlock sending and higher limits, complete identity verification (KYC).`,
      },
      {
        heading: "Identity Verification (KYC)",
        body: `KYC unlocks your full daily transaction limit (₦1,000,000 for Tier 2 and ₦5,000,000 for Tier 3). Navigate to Profile → Verify Identity and follow the steps: upload a government-issued ID (NIN, BVN, passport, or driver's licence), take a selfie for liveness detection, and submit. Verification typically completes within minutes. You will receive a push notification and email when your status changes.`,
      },
    ],
  },
  {
    id: "wallet",
    icon: Wallet,
    title: "Your Wallet",
    color: "text-green-500",
    content: [
      {
        heading: "Wallet Balance & Statement",
        body: `Your wallet balance is displayed prominently on the home screen. Tap the balance to toggle between showing and hiding it for privacy in public. The Wallet Statement page provides a full downloadable record of all credits and debits, filterable by date range and transaction type. Statements can be exported as PDF or CSV for record-keeping or tax purposes.`,
      },
      {
        heading: "Funding Your Wallet",
        body: `You can add money to your wallet in three ways. First, via bank transfer: your wallet has a dedicated virtual account number — send money to it from any Nigerian bank and it credits instantly. Second, via debit card: tap Add Money, enter your card details, and the amount is credited immediately. Third, via USSD: dial *737*amount# from your registered phone number. Funding is free for bank transfers and carries a small card processing fee for card top-ups.`,
      },
      {
        heading: "Withdrawing to Bank",
        body: `To withdraw your wallet balance to your bank account, go to Wallet → Withdraw, select your registered bank account (or add a new one), enter the amount, and confirm with your PIN or biometrics. Withdrawals are processed instantly for most banks and within 30 minutes for all others. The minimum withdrawal amount is ₦100 and the maximum per transaction is ₦500,000.`,
      },
    ],
  },
  {
    id: "send-receive",
    icon: Send,
    title: "Send & Receive Money",
    color: "text-purple-500",
    content: [
      {
        heading: "Sending Money (P2P Transfer)",
        body: `Tap Send on the home screen to initiate a transfer. You can send to a PayGate username, phone number, or bank account number. Type the recipient's details, enter the amount, add an optional note, and confirm with your PIN. Transfers to other PayGate users are instant and free. Bank transfers carry a flat ₦25 fee for amounts below ₦5,000 and ₦50 for amounts above.`,
      },
      {
        heading: "Receiving Money",
        body: `Share your PayGate username or virtual account number with anyone who wants to pay you. You can also generate a personalised payment request by tapping Request Money, entering the amount and a note, and sharing the link. The sender receives a pre-filled payment form. You get a push notification and email as soon as the money arrives.`,
      },
      {
        heading: "Split Bill",
        body: `The Split Bill feature lets you divide an expense among a group. Tap Split Bill, enter the total amount, add participants from your contacts or by phone number, and choose equal split or custom amounts per person. Each participant receives a payment request. You can track who has paid and send reminders to those who have not.`,
      },
      {
        heading: "Contacts",
        body: `Your Contacts list shows PayGate users you have previously transacted with, making repeat transfers faster. You can also import contacts from your phone's address book (with your permission) to see which of your contacts are on PayGate. Contacts can be starred as favourites for quick access from the home screen.`,
      },
    ],
  },
  {
    id: "qr-payments",
    icon: QrCode,
    title: "QR Payments",
    color: "text-cyan-500",
    content: [
      {
        heading: "Paying with QR",
        body: `Tap Scan on the home screen to open the QR scanner. Point your camera at a merchant's PayGate QR code and the payment form will auto-fill with the merchant's name and amount (if the QR is amount-fixed). Confirm with your PIN or biometrics. The payment is processed instantly and you receive a receipt in your transaction history.`,
      },
      {
        heading: "Your Personal QR Code",
        body: `Tap QR on the home screen to display your personal QR code. Anyone with the PayGate app can scan it to send you money. Your QR code can be set to a fixed amount (useful for selling at a market stall) or open-amount. Download and print your QR code to display at your business.`,
      },
    ],
  },
  {
    id: "bill-pay",
    icon: Smartphone,
    title: "Bill Payments",
    color: "text-orange-500",
    content: [
      {
        heading: "Supported Billers",
        body: `PayGate supports bill payment for electricity (all DISCOs), airtime and data (MTN, Airtel, Glo, 9mobile), cable TV (DSTV, GOtv, Startimes), water bills, and government levies. Tap Bills on the home screen and select the biller category. Enter your meter number, smart card number, or phone number, and the amount. Payments are processed instantly and you receive a confirmation with the transaction reference.`,
      },
      {
        heading: "Recurring Bills",
        body: `Set up automatic bill payments so you never miss a due date. Go to Bills → Recurring, select the biller, enter the amount and payment day, and confirm. PayGate will deduct from your wallet automatically each month. You receive a reminder notification 3 days before each scheduled payment and a confirmation after it processes.`,
      },
      {
        heading: "Airtime & Data",
        body: `Buy airtime or data bundles for yourself or any phone number. Select the network, enter the phone number, choose a bundle or enter a custom airtime amount, and confirm. Data bundles are activated within 60 seconds. You can save frequently topped-up numbers as favourites for one-tap recharge.`,
      },
    ],
  },
  {
    id: "bnpl",
    icon: CreditCard,
    title: "Buy Now Pay Later",
    color: "text-pink-500",
    content: [
      {
        heading: "How BNPL Works",
        body: `Buy Now Pay Later lets you spread the cost of purchases over 3, 6, or 12 monthly instalments. When you check out at a participating merchant, select PayGate BNPL as your payment method. PayGate performs a soft credit check and, if approved, pays the merchant in full on your behalf. You repay PayGate in equal monthly instalments, automatically deducted from your wallet on the due date.`,
      },
      {
        heading: "Eligibility & Limits",
        body: `To use BNPL, your account must be Tier 2 or above (KYC completed). Your BNPL limit is based on your transaction history, wallet activity, and credit score. The minimum purchase for BNPL is ₦5,000 and the maximum is ₦500,000 per transaction. Your available BNPL limit is displayed on the BNPL dashboard.`,
      },
      {
        heading: "Managing Your Plans",
        body: `Go to BNPL in the menu to see all your active plans, upcoming payment dates, and outstanding balances. You can make an early repayment at any time with no penalty. Missing a payment incurs a late fee of 2% of the instalment amount. After two consecutive missed payments, your BNPL access is temporarily suspended.`,
      },
    ],
  },
  {
    id: "loyalty",
    icon: Gift,
    title: "Loyalty & Rewards",
    color: "text-yellow-500",
    content: [
      {
        heading: "Earning Points",
        body: `You earn PayGate Points on every transaction. The earn rate is 1 point per ₦100 spent on P2P transfers, 2 points per ₦100 on bill payments, and 5 points per ₦100 on purchases at participating merchants. Points are credited to your account within 24 hours of the transaction completing.`,
      },
      {
        heading: "Redeeming Points",
        body: `Points can be redeemed for wallet cashback (100 points = ₦10), airtime, data bundles, or vouchers from partner brands. Go to Loyalty → Redeem to see available rewards. Some rewards have a minimum point threshold. Points expire 12 months after they are earned if not redeemed.`,
      },
      {
        heading: "Loyalty Tiers",
        body: `PayGate has four loyalty tiers: Bronze (0–999 points), Silver (1,000–4,999 points), Gold (5,000–19,999 points), and Platinum (20,000+ points). Higher tiers unlock better earn rates, priority customer support, and exclusive merchant offers. Your tier is recalculated monthly based on your points balance.`,
      },
      {
        heading: "Coupons",
        body: `The Coupons page shows discount codes and cashback offers from PayGate's merchant partners. Tap a coupon to see its terms and apply it to your next eligible transaction. Coupons are personalised based on your spending history and location.`,
      },
    ],
  },
  {
    id: "consumer-card",
    icon: CreditCard,
    title: "PayGate Card",
    color: "text-indigo-500",
    content: [
      {
        heading: "Your Virtual Card",
        body: `Every PayGate account comes with a free virtual Visa card that is linked to your wallet balance. Use it to shop online at any merchant that accepts Visa. The card number, expiry date, and CVV are displayed in the Card section of the app. For security, the CVV refreshes every 24 hours.`,
      },
      {
        heading: "Card Controls",
        body: `You can freeze your card instantly from the app if you suspect unauthorised use. Frozen cards cannot be used for any transactions until you unfreeze them. You can also set a daily spending limit on your card, enable or disable online transactions, and configure transaction alerts.`,
      },
    ],
  },
  {
    id: "cross-border",
    icon: Globe,
    title: "Cross-Border Payments",
    color: "text-teal-500",
    content: [
      {
        heading: "International Transfers",
        body: `Send money to over 50 countries directly from your PayGate wallet. Go to Cross-Border, select the destination country, enter the recipient's bank details or mobile money number, and confirm the amount. The exchange rate and fees are displayed transparently before you confirm. Transfers typically arrive within 1–2 business days.`,
      },
      {
        heading: "Receiving International Transfers",
        body: `Your PayGate wallet can receive international transfers from supported corridors. Share your wallet's IBAN or routing details (found in Profile → Bank Details) with the sender. Incoming transfers are converted to NGN at the prevailing rate and credited to your wallet within one business day.`,
      },
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Spending Analytics",
    color: "text-violet-500",
    content: [
      {
        heading: "Spending Breakdown",
        body: `The Analytics page gives you a visual breakdown of your spending by category (transfers, bills, shopping, food, transport, etc.) over the past 30 days, 3 months, or 12 months. Use this to understand your spending habits and identify areas where you can save.`,
      },
      {
        heading: "Transaction History",
        body: `Your full transaction history is available in History. Filter by date, type, amount, and status. Tap any transaction to see the full details including merchant name, reference number, and any notes you added. You can flag a transaction as disputed directly from the detail view.`,
      },
    ],
  },
  {
    id: "security",
    icon: Shield,
    title: "Security & Privacy",
    color: "text-red-500",
    content: [
      {
        heading: "PIN & Biometrics",
        body: `Your 6-digit PIN is required to authorise all transactions. Set up biometric authentication (fingerprint or Face ID) in Profile → Security for faster authentication. If you forget your PIN, tap Forgot PIN on the login screen and follow the account recovery steps using your registered phone number and email.`,
      },
      {
        heading: "Two-Factor Authentication",
        body: `Enable 2FA in Profile → Security → Two-Factor Authentication. Once enabled, you will be asked to enter a one-time code from your authenticator app (Google Authenticator or Authy) in addition to your PIN when logging in from a new device. This significantly reduces the risk of unauthorised access.`,
      },
      {
        heading: "Device Management",
        body: `View all devices that have accessed your account in Profile → Security → Devices. If you see an unrecognised device, tap Remove to revoke its access immediately. You will receive an email notification whenever a new device logs in.`,
      },
      {
        heading: "Privacy Settings",
        body: `Control who can find you on PayGate in Profile → Privacy. You can hide your phone number from search, disable your profile from appearing in contacts suggestions, and opt out of personalised offers. PayGate never sells your personal data to third parties.`,
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
        heading: "Notification Preferences",
        body: `Go to Notifications → Settings to configure which events trigger notifications and on which channels (push, email, or SMS). You can enable or disable notifications for incoming transfers, outgoing transfers, bill payments, BNPL instalments, loyalty points earned, and security alerts. Security alerts (new device login, PIN change) cannot be disabled.`,
      },
      {
        heading: "Digest Emails",
        body: `Enable digest emails to receive a weekly or monthly summary of your account activity instead of individual notifications for every transaction. The digest includes your total spend, top categories, loyalty points earned, and upcoming BNPL payments.`,
      },
      {
        heading: "Notification Centre",
        body: `All your notifications are stored in the Notification Centre (bell icon in the top right). Unread notifications are shown with a badge count. Tap a notification to navigate directly to the relevant transaction or feature. Swipe left on a notification to dismiss it.`,
      },
    ],
  },
  {
    id: "pwa",
    icon: Smartphone,
    title: "Install as App (PWA)",
    color: "text-emerald-500",
    content: [
      {
        heading: "Installing PayGate on Your Phone",
        body: `PayGate is a Progressive Web App (PWA), which means you can install it on your home screen without going through an app store. On Android, tap the Install banner that appears at the bottom of the screen, or go to your browser menu and tap Add to Home Screen. On iOS (Safari), tap the Share button and select Add to Home Screen. Once installed, PayGate opens in full-screen mode and works offline for viewing your balance and transaction history.`,
      },
      {
        heading: "Offline Mode",
        body: `When your device is offline, PayGate shows your last known balance and transaction history from the local cache. Any actions you take offline (such as initiating a transfer) are queued and automatically processed when your connection is restored. An offline indicator appears at the top of the screen when you are not connected.`,
      },
      {
        heading: "Push Notifications",
        body: `After installing the PWA, you will be prompted to enable push notifications. Accept to receive real-time alerts for incoming transfers, bill payment confirmations, and security events even when the app is not open. You can manage push notification permissions in your browser or phone settings at any time.`,
      },
    ],
  },
  {
    id: "disputes",
    icon: RefreshCw,
    title: "Disputes & Support",
    color: "text-amber-500",
    content: [
      {
        heading: "Raising a Dispute",
        body: `If you notice an unauthorised or incorrect transaction, go to History, tap the transaction, and select Dispute Transaction. Describe the issue, attach any supporting evidence (screenshots, receipts), and submit. PayGate's disputes team will investigate and respond within 5 business days. You will receive updates by email and in-app notification.`,
      },
      {
        heading: "Contacting Support",
        body: `For urgent issues, use the in-app live chat (tap the chat bubble icon in the bottom right corner). For non-urgent queries, email support@paygate.ng or call 0800-PAYGATE (0800-729-4283). Support is available Monday to Friday, 8am–8pm, and Saturday, 9am–5pm. Response time for email is within 24 hours.`,
      },
    ],
  },
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function ConsumerGuide() {
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
    <ConsumerLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/consumer")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Wallet
          </Button>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-primary" />
              Consumer Help Guide
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Your complete guide to using PayGate Wallet — sending money, paying bills, earning
              rewards, staying secure, and getting the most from every feature.
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
          PayGate Consumer Guide · Last updated April 2026 · For support, email{" "}
          <a href="mailto:support@paygate.ng" className="underline">
            support@paygate.ng
          </a>{" "}
          or call 0800-PAYGATE
        </div>
      </div>
    </ConsumerLayout>
  );
}
