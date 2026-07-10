import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ShieldCheck,
  Mail,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Link } from "wouter";

export default function RegulatorLogin() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [devMagicLink, setDevMagicLink] = useState<string | null>(null);

  const requestLink = trpc.regulatorAuth.requestMagicLink.useMutation({
    onSuccess: (data) => {
      setSubmitted(true);
      if (data.magicLink) setDevMagicLink(data.magicLink);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    requestLink.mutate({ email: email.trim(), origin: window.location.origin });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Regulatory Portal</h1>
          <p className="text-slate-400 text-sm">
            Secure access for authorised regulators and supervisory bodies
          </p>
        </div>

        {/* Card */}
        <Card className="bg-slate-800/60 border-slate-700/50 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg">
              {submitted ? "Check Your Email" : "Request Access Link"}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {submitted
                ? "A secure one-time access link has been sent to your registered email address."
                : "Enter your registered email address to receive a secure one-time login link."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-slate-300 text-sm">
                    Registered Email Address
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="regulator@cbn.gov.ng"
                      className="pl-9 bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      required
                      disabled={requestLink.isPending}
                    />
                  </div>
                </div>

                {requestLink.isError && (
                  <Alert className="bg-red-900/30 border-red-700/50">
                    <AlertDescription className="text-red-300 text-sm">
                      {requestLink.error?.message ??
                        "Failed to send access link. Please try again."}
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={requestLink.isPending || !email.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                  {requestLink.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending Link…
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send Access Link
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-green-900/20 border border-green-700/30">
                  <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
                  <div className="text-sm text-green-300">
                    <p className="font-medium mb-1">Access link sent</p>
                    <p className="text-green-400/80">
                      The link will expire in{" "}
                      <strong>30 minutes</strong> and can only be used once.
                      Check your spam folder if you don't see it within a few
                      minutes.
                    </p>
                  </div>
                </div>

                {/* Dev-mode magic link */}
                {devMagicLink && (
                  <Alert className="bg-amber-900/20 border-amber-700/30">
                    <AlertDescription className="text-amber-300 text-xs space-y-2">
                      <p className="font-semibold">
                        Development mode — magic link:
                      </p>
                      <a
                        href={devMagicLink}
                        className="flex items-center gap-1 underline break-all hover:text-amber-200"
                      >
                        {devMagicLink}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  variant="outline"
                  className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                  onClick={() => {
                    setSubmitted(false);
                    setDevMagicLink(null);
                    setEmail("");
                    requestLink.reset();
                  }}
                >
                  Send to a different address
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-slate-500 text-xs">
          Not a registered regulator?{" "}
          <Link
            href="/dashboard"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Return to merchant portal
          </Link>
        </p>
      </div>
    </div>
  );
}
