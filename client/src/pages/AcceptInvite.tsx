import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function AcceptInvite() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    const e = params.get("email");
    setToken(t);
    setEmail(e);
    if (!t) {
      setStatus("error");
      setErrorMessage("Invalid invitation link. No token found.");
    }
  }, []);

  const acceptInvite = trpc.team.acceptInvite.useMutation({
    onSuccess: () => {
      setStatus("success");
    },
    onError: (e: any) => {
      setStatus("error");
      setErrorMessage(e.message ?? "Failed to accept invitation. The link may have expired.");
    },
  });

  const handleAccept = () => {
    if (!token) return;
    if (!email) {
      setStatus("error");
      setErrorMessage("Invalid invitation link. No email address found.");
      return;
    }
    setStatus("loading");
    acceptInvite.mutate({ token, email });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Shield className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            PayGate
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Merchant Portal</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          {/* Idle / Confirm state */}
          {status === "idle" && token && (
            <div className="text-center space-y-6">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Team Invitation</h2>
                <p className="text-muted-foreground text-sm">
                  You've been invited to join a merchant team on PayGate.
                  {email && (
                    <span className="block mt-1 font-medium text-foreground">{email}</span>
                  )}
                </p>
              </div>

              <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground text-left space-y-2">
                <p className="font-medium text-foreground">By accepting, you'll be able to:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>Access the merchant dashboard</li>
                  <li>View transactions and analytics</li>
                  <li>Manage features based on your assigned role</li>
                </ul>
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleAccept}
                  disabled={acceptInvite.isPending}
                  className="w-full"
                >
                  {acceptInvite.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Accepting...</>
                  ) : (
                    <>Accept Invitation <ArrowRight className="w-4 h-4 ml-2" /></>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  className="w-full text-muted-foreground"
                >
                  Decline
                </Button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {status === "loading" && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
              <p className="text-muted-foreground">Accepting your invitation...</p>
            </div>
          )}

          {/* Success state */}
          {status === "success" && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Invitation Accepted!</h2>
                <p className="text-muted-foreground text-sm">
                  You've successfully joined the team. You can now access the merchant portal.
                </p>
              </div>
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Error state */}
          {status === "error" && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mx-auto">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground mb-2">Invitation Error</h2>
                <p className="text-muted-foreground text-sm">{errorMessage}</p>
              </div>
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate("/dashboard")} className="w-full">
                  Go to Dashboard
                </Button>
                <Button variant="outline" onClick={() => navigate("/login")} className="w-full">
                  Sign In
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Having trouble? Contact{" "}
          <a href="mailto:support@paygate.ng" className="text-primary hover:underline">
            support@paygate.ng
          </a>
        </p>
      </div>
    </div>
  );
}
