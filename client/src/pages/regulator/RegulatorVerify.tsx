import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { ShieldCheck, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

/**
 * RegulatorVerify — handles /regulator/verify?token=...
 *
 * On mount reads the `token` query param, calls verifyMagicLink, and
 * redirects to /regulator on success. On failure shows an error state.
 */
export default function RegulatorVerify() {
  const [, navigate] = useLocation();
  const hasRun = useRef(false);

  const verify = trpc.regulatorAuth.verifyMagicLink.useMutation({
    onSuccess: () => {
      navigate("/regulator");
    },
  });

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) return; // will show "no token" error below
    verify.mutate({ token });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );
  const hasToken = Boolean(params.get("token"));

  const isVerifying =
    verify.isPending || (!verify.isError && !verify.isSuccess && hasToken);
  const isError = verify.isError || !hasToken;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30">
          {isVerifying ? (
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          ) : isError ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : (
            <ShieldCheck className="w-8 h-8 text-green-400" />
          )}
        </div>

        {/* State: Verifying */}
        {isVerifying && (
          <>
            <h1 className="text-xl font-bold text-white">
              Verifying your link…
            </h1>
            <p className="text-slate-400 text-sm">
              Please wait while we validate your access token.
            </p>
          </>
        )}

        {/* State: Error */}
        {isError && (
          <>
            <h1 className="text-xl font-bold text-white">
              Link Invalid or Expired
            </h1>
            <p className="text-slate-400 text-sm">
              {!hasToken
                ? "No access token was found in this URL."
                : (verify.error?.message ??
                  "This magic link has already been used or has expired.")}
            </p>
            <p className="text-slate-500 text-xs">
              Magic links are single-use and expire after 30 minutes.
            </p>
            <Link href="/regulator/login">
              <Button className="bg-blue-600 hover:bg-blue-500 text-white w-full">
                Request a new access link
              </Button>
            </Link>
          </>
        )}

        {/* State: Success (brief flash before redirect) */}
        {verify.isSuccess && (
          <>
            <h1 className="text-xl font-bold text-white">Access Granted</h1>
            <p className="text-slate-400 text-sm">
              Redirecting you to the Regulatory Portal…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
