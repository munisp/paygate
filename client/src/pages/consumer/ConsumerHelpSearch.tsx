// @ts-nocheck
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BookOpen, ChevronDown, ChevronUp, ArrowLeft, Lightbulb } from "lucide-react";
import { Link } from "wouter";
import { useDebounce } from "@/hooks/useDebounce";

const CATEGORIES = [
  { id: "getting-started", label: "Getting Started", icon: "🚀" },
  { id: "wallet", label: "Wallet & Balance", icon: "💳" },
  { id: "payments", label: "Send & Receive", icon: "💸" },
  { id: "bills", label: "Bill Payments", icon: "📄" },
  { id: "bnpl", label: "Buy Now Pay Later", icon: "🛍️" },
  { id: "loyalty", label: "Loyalty & Rewards", icon: "⭐" },
  { id: "security", label: "Security & Privacy", icon: "🔒" },
  { id: "disputes", label: "Disputes & Refunds", icon: "⚖️" },
];

const FAQ_DATA: Record<string, { q: string; a: string }[]> = {
  "getting-started": [
    { q: "How do I create a PayGate account?", a: "Download the PayGate app or visit paygate.ng. Tap 'Create Account', enter your phone number, verify with the OTP sent to you, then set a PIN. Your wallet is ready in under 2 minutes." },
    { q: "What documents do I need for KYC verification?", a: "For Tier 1 (up to ₦50,000/day): just your BVN. For Tier 2 (up to ₦200,000/day): BVN + government-issued ID. For Tier 3 (unlimited): BVN + ID + proof of address." },
    { q: "How do I upgrade my account tier?", a: "Go to Profile → Verification → Upgrade Tier. Upload the required documents and wait 1–2 business days for review. You'll receive a notification when approved." },
  ],
  "wallet": [
    { q: "How do I fund my wallet?", a: "Tap 'Add Money' on the home screen. You can fund via bank transfer (use your unique account number), debit card, or USSD. Funds reflect instantly for card and USSD, within 5 minutes for bank transfer." },
    { q: "What is my wallet account number?", a: "Your wallet has a dedicated virtual account number. Go to Home → Add Money → Bank Transfer to see your unique account number. Share this with anyone to receive transfers." },
    { q: "Is there a limit on my wallet balance?", a: "Tier 1 accounts: ₦300,000 maximum balance. Tier 2: ₦500,000. Tier 3: Unlimited. Upgrade your tier to increase your limit." },
  ],
  "payments": [
    { q: "How do I send money to another PayGate user?", a: "Tap 'Send Money' → search by phone number or username → enter amount → confirm with your PIN. Transfers between PayGate users are instant and free." },
    { q: "Can I send money to a bank account?", a: "Yes. Tap 'Send Money' → 'Bank Transfer' → select bank → enter account number → verify the name → enter amount → confirm with PIN. A small fee applies for interbank transfers." },
    { q: "How do I request money?", a: "Tap 'Request Money' → enter the amount and a note → share the payment link via WhatsApp, SMS, or copy. The sender can pay directly from the link without needing a PayGate account." },
  ],
  "bills": [
    { q: "What bills can I pay on PayGate?", a: "You can pay electricity (all DISCOs), cable TV (DSTV, GOtv, Startimes), airtime & data (all networks), water bills, internet subscriptions, and government levies." },
    { q: "Is there a fee for bill payments?", a: "Most bill payments are free. A small convenience fee (₦50–₦100) applies for some utility payments. The fee is always shown before you confirm." },
    { q: "My bill payment was deducted but not confirmed. What do I do?", a: "Wait 5 minutes — most delayed confirmations resolve automatically. If not, go to Transactions → find the payment → tap 'Get Status'. If still unresolved, tap 'Raise Dispute'." },
  ],
  "bnpl": [
    { q: "How does Buy Now Pay Later work?", a: "BNPL lets you split purchases into 3–6 monthly instalments. At checkout, select 'Pay in Instalments', choose your plan, and confirm. The first instalment is charged immediately; the rest follow monthly." },
    { q: "What is my BNPL limit?", a: "Your limit is based on your transaction history and credit score. Check your current limit in Wallet → BNPL. Limits range from ₦5,000 to ₦500,000." },
    { q: "What happens if I miss a BNPL payment?", a: "A late fee of 2% of the outstanding amount is charged. After 30 days, your BNPL access may be suspended. Contact support immediately if you anticipate difficulty making a payment." },
  ],
  "loyalty": [
    { q: "How do I earn loyalty points?", a: "You earn 1 point for every ₦100 spent on transactions. Bonus points are awarded for bill payments (2x), referrals (500 points each), and special promotions." },
    { q: "How do I redeem my points?", a: "Go to Wallet → Loyalty → Redeem. 100 points = ₦1. You can redeem for wallet credit, airtime, or merchant vouchers. Minimum redemption is 500 points." },
    { q: "Do loyalty points expire?", a: "Points expire after 12 months of account inactivity. As long as you make at least one transaction per year, your points are safe." },
  ],
  "security": [
    { q: "How do I change my transaction PIN?", a: "Go to Profile → Security → Change PIN. You'll need your current PIN and your phone number for OTP verification." },
    { q: "What should I do if I suspect my account is compromised?", a: "Immediately tap Profile → Security → Freeze Account. This blocks all transactions. Then call our 24/7 hotline: 0800-PAYGATE. We'll help you secure your account and investigate." },
    { q: "Does PayGate support biometric login?", a: "Yes. Go to Profile → Security → Biometrics to enable fingerprint or Face ID login. You'll still need your PIN for high-value transactions." },
  ],
  "disputes": [
    { q: "How do I dispute a transaction?", a: "Go to Transactions → find the transaction → tap 'Dispute'. Select the reason (unauthorized, wrong amount, not received, etc.), add a description, and submit. We'll respond within 3 business days." },
    { q: "How long does a dispute take to resolve?", a: "Most disputes are resolved within 3–7 business days. Complex cases (e.g., card disputes) may take up to 45 days per CBN regulations. You'll receive updates via notification." },
    { q: "Can I get a refund for a failed transaction?", a: "Yes. Failed transactions where your wallet was debited are automatically reversed within 24 hours. If not reversed, raise a dispute and we'll process the refund within 48 hours." },
  ],
};

export default function ConsumerHelpSearch() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 500);

  const trackSearch = trpc.wave25.helpSearch.track.useMutation({
    // Silent fail — tracking is non-critical; don't disrupt the user experience
    onError: (err) => console.warn('[HelpSearch] Failed to track search query:', err.message),
  });

  const isSearching = trackSearch.isPending;
  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (q.length > 2) {
      trackSearch.mutate({ query: q, source: "consumer" });
    }
  }, []);

  const allFaqs = Object.entries(FAQ_DATA).flatMap(([cat, items]) =>
    items.map(item => ({ ...item, category: cat }))
  );

  const searchResults = debouncedQuery.length > 1
    ? allFaqs.filter(f =>
        f.q.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        f.a.toLowerCase().includes(debouncedQuery.toLowerCase())
      )
    : [];

  const activeFaqs = activeCategory ? FAQ_DATA[activeCategory] ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-12 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <Link href="/consumer/home">
            <Button variant="ghost" size="sm" className="text-primary-foreground/70 hover:text-primary-foreground mb-4">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Home
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mb-2">How can we help?</h1>
          <p className="text-primary-foreground/80 mb-6">Search our knowledge base or browse by category</p>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search for help..."
              className="pl-10 h-12 text-base bg-white text-foreground"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Search Results */}
        {debouncedQuery.length > 1 ? (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              {searchResults.length > 0
                ? `${searchResults.length} result${searchResults.length !== 1 ? "s" : ""} for "${debouncedQuery}"`
                : `No results for "${debouncedQuery}"`}
            </h2>
            {searchResults.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center">
                  <Lightbulb className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">No articles found. Try different keywords.</p>
                  <Button variant="outline" onClick={() => setQuery("")}>Browse Categories</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {searchResults.map((faq, i) => (
                  <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setExpandedFaq(expandedFaq === `search-${i}` ? null : `search-${i}`)}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs capitalize">{faq.category.replace("-", " ")}</Badge>
                          </div>
                          <p className="font-medium text-sm">{faq.q}</p>
                          {expandedFaq === `search-${i}` && (
                            <p className="text-sm text-muted-foreground mt-2">{faq.a}</p>
                          )}
                        </div>
                        {expandedFaq === `search-${i}` ? <ChevronUp className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Categories */}
            {!activeCategory ? (
              <div>
                <h2 className="text-lg font-semibold mb-4">Browse by Category</h2>
                <div className="grid grid-cols-2 gap-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className="flex items-center gap-3 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                    >
                      <span className="text-2xl">{cat.icon}</span>
                      <span className="font-medium text-sm">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <Button variant="ghost" size="sm" onClick={() => setActiveCategory(null)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> All Categories
                  </Button>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium">
                    {CATEGORIES.find(c => c.id === activeCategory)?.icon}{" "}
                    {CATEGORIES.find(c => c.id === activeCategory)?.label}
                  </span>
                </div>
                <div className="space-y-3">
                  {activeFaqs.map((faq, i) => (
                    <Card key={i} className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setExpandedFaq(expandedFaq === `cat-${i}` ? null : `cat-${i}`)}>
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{faq.q}</p>
                            {expandedFaq === `cat-${i}` && (
                              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{faq.a}</p>
                            )}
                          </div>
                          {expandedFaq === `cat-${i}` ? <ChevronUp className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <ChevronDown className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Contact Support */}
        <Card className="mt-8 bg-muted/50">
          <CardContent className="pt-6 pb-6 text-center">
            <BookOpen className="h-8 w-8 text-primary mx-auto mb-3" />
            <h3 className="font-semibold mb-1">Still need help?</h3>
            <p className="text-sm text-muted-foreground mb-4">Our support team is available 24/7</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button variant="outline" size="sm">📞 Call 0800-PAYGATE</Button>
              <Button variant="outline" size="sm">💬 Live Chat</Button>
              <Button variant="outline" size="sm">📧 Email Support</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
