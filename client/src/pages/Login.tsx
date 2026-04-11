import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Zap, ArrowRight, Shield, Globe, Loader2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("merchant@acme.ng");
  const [password, setPassword] = useState("merchant123");
  const [error, setError] = useState<string | null>(null);

  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();
  const { data: keycloakConfig } = trpc.middleware.keycloak.isConfigured.useQuery(undefined, { staleTime: 300_000 });
  const ssoEnabled = keycloakConfig?.configured ?? false;

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!meLoading && me) {
      navigate("/dashboard");
    }
  }, [me, meLoading, navigate]);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => {
      navigate("/dashboard");
    },
    onError: (err) => {
      setError(err.message ?? "Login failed. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    loginMutation.mutate({ email, password });
  };

  /** Redirect to Keycloak SSO — the server handles the OIDC flow */
  const handleSSOLogin = () => {
    const returnPath = "/dashboard";
    window.location.href = `/api/oauth/keycloak/login?returnPath=${encodeURIComponent(returnPath)}`;
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div
        className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{ background: "oklch(0.13 0.03 255)" }}
      >
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-white text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            PayGate
          </span>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Africa's most powerful payment infrastructure
          </h1>
          <p className="text-white/60 text-lg leading-relaxed">
            Process payments across 54 African countries with a single API. Cards, Mobile Money, Bank Transfer, USSD — all in one platform.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { value: "1M+", label: "TPS Capacity" },
              { value: "54", label: "Countries" },
              { value: "99.99%", label: "Uptime SLA" },
            ].map((stat) => (
              <div key={stat.label} className="text-center p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.05)" }}>
                <div className="text-2xl font-bold text-white" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {stat.value}
                </div>
                <div className="text-xs text-white/50 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Features */}
          <div className="space-y-3 pt-2">
            {[
              { icon: Shield, text: "PCI DSS Level 1 Certified" },
              { icon: Globe, text: "PAPSS & BRICS Pay Integration" },
              { icon: Zap, text: "Sub-100ms Transaction Processing" },
            ].map((feature) => (
              <div key={feature.text} className="flex items-center gap-3 text-white/70">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/30 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-sm">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-white/30 text-sm">
          © 2026 PayGate Technologies Ltd. All rights reserved.
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>PayGate</span>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              Sign in to your account
            </h2>
            <p className="text-muted-foreground mt-2">
              Access your merchant dashboard and manage payments.
            </p>
          </div>

          {meLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Enterprise SSO button — only shown when KEYCLOAK_URL is configured */}
              {ssoEnabled && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full bg-background"
                    onClick={handleSSOLogin}
                  >
                    <Building2 className="mr-2 w-4 h-4 text-indigo-500" />
                    Sign in with Enterprise SSO ({keycloakConfig?.realm ?? "Keycloak"})
                  </Button>

                  <div className="relative">
                    <Separator />
                    <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
                      or sign in with email
                    </span>
                  </div>
                </>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e: any) => setEmail(e.target.value)}
                    placeholder="merchant@acme.ng"
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e: any) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </>
                  )}
                </Button>

                {/* Demo credentials hint */}
                <div className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Demo credentials (pre-filled)</p>
                  <p className="text-xs text-foreground/70">Email: <span className="font-mono text-primary">merchant@acme.ng</span></p>
                  <p className="text-xs text-foreground/70">Password: <span className="font-mono text-primary">merchant123</span></p>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
