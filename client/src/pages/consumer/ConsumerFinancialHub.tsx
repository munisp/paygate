import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, PieChart, Shield, CreditCard, Globe, Umbrella, RefreshCw, TrendingUp } from "lucide-react";

const SERVICES = [
  {
    path: "/consumer/gold",
    icon: Coins,
    label: "Digital Gold",
    description: "Buy & sell 24K gold digitally",
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    badge: "Live",
  },
  {
    path: "/consumer/mutual-funds",
    icon: PieChart,
    label: "Mutual Funds",
    description: "Invest in diversified funds",
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    badge: "12–22% p.a.",
  },
  {
    path: "/consumer/pension",
    icon: Shield,
    label: "Pension",
    description: "Manage your RSA contributions",
    color: "text-blue-500",
    bg: "bg-blue-50",
    badge: "Tax-free",
  },
  {
    path: "/consumer/emi",
    icon: CreditCard,
    label: "EMI Loans",
    description: "Flexible installment loans",
    color: "text-purple-500",
    bg: "bg-purple-50",
    badge: "From 18% p.a.",
  },
  {
    path: "/consumer/remittance",
    icon: Globe,
    label: "Send Abroad",
    description: "International money transfers",
    color: "text-teal-500",
    bg: "bg-teal-50",
    badge: "5 corridors",
  },
  {
    path: "/consumer/insurance",
    icon: Umbrella,
    label: "Insurance",
    description: "Health, life, device & more",
    color: "text-sky-500",
    bg: "bg-sky-50",
    badge: "5 plans",
  },
  {
    path: "/consumer/subscriptions",
    icon: RefreshCw,
    label: "Subscriptions",
    description: "Manage recurring payments",
    color: "text-green-500",
    bg: "bg-green-50",
    badge: null,
  },
  {
    path: "/consumer/savings",
    icon: TrendingUp,
    label: "Savings Goals",
    description: "Set and track savings targets",
    color: "text-orange-500",
    bg: "bg-orange-50",
    badge: null,
  },
];

export default function ConsumerFinancialHub() {
  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold">Financial Services</h1>
        <p className="text-sm text-muted-foreground mt-1">Grow, protect, and manage your money</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((svc) => {
          const Icon = svc.icon;
          return (
            <Link key={svc.path} href={svc.path}>
              <Card className="cursor-pointer hover:border-primary hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 space-y-2">
                  <div className={`w-10 h-10 rounded-xl ${svc.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${svc.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{svc.label}</p>
                      {svc.badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">{svc.badge}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
