// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Zap, Building2, Rocket } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 0,
    currency: "NGN",
    icon: Zap,
    description: "For new merchants testing the platform",
    features: [
      "Up to 100 transactions/month",
      "Card & bank transfer payments",
      "Basic fraud detection",
      "Email support",
      "API access",
      "Webhook notifications",
    ],
    limits: {
      monthlyVolume: "₦1,000,000",
      merchants: "1",
      gnn: "Disabled",
    },
    cta: "Get Started Free",
    priceId: null,
    highlight: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 25_000,
    currency: "NGN",
    icon: Rocket,
    description: "For growing businesses processing real volume",
    features: [
      "Up to 10,000 transactions/month",
      "All payment channels",
      "GNN fraud detection (₦100k+)",
      "Priority email & chat support",
      "Advanced analytics",
      "BNPL integration",
      "Virtual cards",
      "Custom webhooks",
      "FX corridors",
    ],
    limits: {
      monthlyVolume: "₦50,000,000",
      merchants: "10",
      gnn: "₦100,000+",
    },
    cta: "Start Growth Plan",
    priceId: "price_growth_monthly",
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 100_000,
    currency: "NGN",
    icon: Building2,
    description: "For fintechs and large merchants at scale",
    features: [
      "Unlimited transactions",
      "All payment channels",
      "GNN fraud detection (₦50k+)",
      "Dedicated account manager",
      "SLA guarantees",
      "Custom integrations",
      "Multi-tenant support",
      "Compliance & KYC tools",
      "Wealth management module",
      "International remittance",
      "White-label option",
    ],
    limits: {
      monthlyVolume: "Unlimited",
      merchants: "Unlimited",
      gnn: "₦50,000+",
    },
    cta: "Contact Sales",
    priceId: "price_enterprise_monthly",
    highlight: false,
  },
];

export default function PricingPage() {
  const isLoading = false; // Data loaded synchronously

  const { user, isAuthenticated } = useAuth();

  const createCheckout = trpc.portalBilling.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      toast.info("Redirecting to checkout...");
      window.open(data.url, "_blank");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSelectPlan = (plan: typeof PLANS[0]) => {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    if (!plan.priceId) {
      toast.success("You're already on the free Starter plan!");
      return;
    }
    if (plan.id === "enterprise") {
      toast.info("Contact our sales team at sales@paygate.ng for Enterprise pricing");
      return;
    }
    createCheckout.mutate({
      priceId: plan.priceId,
      successUrl: `${window.location.origin}/billing?success=1`,
      cancelUrl: `${window.location.origin}/pricing`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge className="mb-4">Transparent Pricing</Badge>
          <h1 className="text-4xl font-bold mb-4">Choose your plan</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Start free, scale as you grow. All plans include access to PayGate's core payment infrastructure.
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {PLANS.map(plan => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.id}
                className={`relative ${plan.highlight ? "border-primary shadow-lg scale-105" : ""}`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-lg ${plan.highlight ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <div className="mt-2">
                    {plan.price === 0 ? (
                      <div className="text-3xl font-bold">Free</div>
                    ) : (
                      <div>
                        <span className="text-3xl font-bold">₦{plan.price.toLocaleString()}</span>
                        <span className="text-muted-foreground">/month</span>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Limits */}
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Plan Limits</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Monthly Volume</span>
                      <span className="font-medium">{plan.limits.monthlyVolume}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Merchants</span>
                      <span className="font-medium">{plan.limits.merchants}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">GNN Fraud Detection</span>
                      <span className="font-medium">{plan.limits.gnn}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    disabled={createCheckout.isPending}
                    onClick={() => handleSelectPlan(plan)}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {[
              {
                q: "Can I switch plans at any time?",
                a: "Yes. You can upgrade or downgrade your plan at any time. Changes take effect at the start of the next billing cycle.",
              },
              {
                q: "What payment methods are supported?",
                a: "PayGate supports card payments (Visa, Mastercard), bank transfers (NIP/NIBSS), mobile money, USSD, QR codes, and BNPL.",
              },
              {
                q: "Is there a transaction fee on top of the plan fee?",
                a: "Yes. A small per-transaction fee applies: 1.5% for cards, 0.5% for bank transfers, 1.0% for mobile money. Enterprise plans have custom pricing.",
              },
              {
                q: "What is GNN fraud detection?",
                a: "Our GraphSAGE Graph Neural Network analyzes transaction graphs to detect coordinated fraud rings. It runs in addition to our rule-based scorer for high-value transactions.",
              },
            ].map(faq => (
              <div key={faq.q} className="border rounded-lg p-4">
                <div className="font-semibold mb-1">{faq.q}</div>
                <div className="text-sm text-muted-foreground">{faq.a}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
