import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  Shield, Zap, Globe, BarChart3, CreditCard, Lock,
  ArrowRight, CheckCircle2, TrendingUp, Users, DollarSign
} from "lucide-react";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold">PayGate</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/docs" className="text-slate-400 hover:text-white text-sm transition-colors">Docs</a>
          <Button
            variant="outline"
            size="sm"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => window.location.href = getLoginUrl("/dashboard")}
          >
            Sign In
          </Button>
          <Button
            size="sm"
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => window.location.href = getLoginUrl("/onboarding")}
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-emerald-400 text-sm mb-8">
          <CheckCircle2 className="w-4 h-4" />
          Now with AI-powered fraud detection &amp; FalkorDB knowledge graph
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
          Payments infrastructure<br />
          <span className="text-emerald-400">built for Africa</span>
        </h1>
        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Accept payments, manage payouts, detect fraud, and grow your business — all from one unified platform.
          NIBSS, Mojaloop, USSD, and Stripe in one API.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 h-12 text-base"
            onClick={() => window.location.href = getLoginUrl("/onboarding")}
          >
            Start for free <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white px-8 h-12 text-base"
            onClick={() => window.location.href = getLoginUrl("/dashboard")}
          >
            View Dashboard
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-slate-800 py-12">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: "₦2.4T+", label: "Processed monthly", icon: DollarSign },
            { value: "50K+", label: "Active merchants", icon: Users },
            { value: "99.99%", label: "Uptime SLA", icon: TrendingUp },
            { value: "< 2s", label: "Settlement time", icon: Zap },
          ].map(({ value, label, icon: Icon }) => (
            <div key={label}>
              <div className="flex justify-center mb-2">
                <Icon className="w-6 h-6 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-white">{value}</div>
              <div className="text-slate-400 text-sm mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Everything you need to scale</h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">From startup to enterprise — PayGate grows with you.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: CreditCard, title: "Multi-channel Payments", desc: "Accept cards, bank transfers, USSD, mobile money, QR codes, and BNPL in one integration.", color: "text-blue-400", bg: "bg-blue-400/10" },
            { icon: Shield, title: "AI Fraud Detection", desc: "GNN-based fraud scoring, Qdrant vector similarity, FalkorDB fraud ring detection, and ART reasoning.", color: "text-emerald-400", bg: "bg-emerald-400/10" },
            { icon: Globe, title: "Cross-border & FX", desc: "Send and receive payments across 50+ countries with real-time FX rates and corridor management.", color: "text-purple-400", bg: "bg-purple-400/10" },
            { icon: BarChart3, title: "Analytics & Insights", desc: "Real-time dashboards, cohort analysis, revenue forecasting, and AI-powered business insights.", color: "text-orange-400", bg: "bg-orange-400/10" },
            { icon: Lock, title: "Compliance & KYC", desc: "Automated KYB/KYC, AML monitoring, CBN reporting, ISO 20022, and PCI-DSS compliance.", color: "text-red-400", bg: "bg-red-400/10" },
            { icon: Zap, title: "Developer-first API", desc: "tRPC + REST APIs, SDKs for JS/Python/Go, webhooks, sandbox environment, and full API docs.", color: "text-yellow-400", bg: "bg-yellow-400/10" },
          ].map(({ icon: Icon, title, desc, color, bg }) => (
            <div key={title} className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors">
              <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 pb-24">
        <div className="bg-gradient-to-r from-emerald-900/50 to-slate-900 border border-emerald-800/50 rounded-2xl p-12 text-center">
          <h2 className="text-4xl font-bold mb-4">Ready to get started?</h2>
          <p className="text-slate-400 text-lg mb-8 max-w-lg mx-auto">Join 50,000+ merchants who trust PayGate to power their payments.</p>
          <Button
            size="lg"
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-10 h-12 text-base"
            onClick={() => window.location.href = getLoginUrl("/onboarding")}
          >
            Create free account <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 px-6 text-center text-slate-500 text-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-500 rounded flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-300">PayGate</span>
          </div>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-slate-300 transition-colors">Terms</a>
            <a href="/security" className="hover:text-slate-300 transition-colors">Security</a>
          </div>
          <span>© 2026 PayGate Technologies Ltd. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}
