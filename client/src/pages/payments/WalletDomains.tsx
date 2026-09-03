// @ts-nocheck
/**
 * Wallet Domains — Apple Pay domain registration / verification / deletion,
 * plus the list of saved wallet instruments (Apple Pay etc.).
 */
import { useState } from "react";
import { Globe, Plus, RefreshCw, Trash2, ShieldCheck, ShieldQuestion, Wallet, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function fmtDate(d: any) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

export default function WalletDomains() {
  const utils = trpc.useUtils();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [domain, setDomain] = useState("");

  const { data: domainsData, isLoading, refetch } = trpc.walletPay.listApplePayDomains.useQuery({}, { staleTime: 15_000 });
  const domains: any[] = domainsData?.domains ?? domainsData?.items ?? (Array.isArray(domainsData) ? domainsData : []);

  const { data: instrumentsData } = trpc.walletPay.listInstruments.useQuery({}, { staleTime: 15_000 });
  const instruments: any[] = instrumentsData?.instruments ?? instrumentsData?.items ?? (Array.isArray(instrumentsData) ? instrumentsData : []);

  const invalidate = () => {
    utils.walletPay.listApplePayDomains.invalidate();
    utils.walletPay.listInstruments.invalidate();
  };

  const register = trpc.walletPay.registerApplePayDomain.useMutation({
    onSuccess: () => {
      toast.success("Domain registered — complete verification by hosting the Apple Pay association file, then click Verify");
      setRegisterOpen(false);
      setDomain("");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const verify = trpc.walletPay.verifyApplePayDomain.useMutation({
    onSuccess: (r: any) => {
      if (r?.verified ?? true) toast.success("Domain verified");
      else toast.warning("Verification failed — is the association file hosted?");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const del = trpc.walletPay.deleteApplePayDomain.useMutation({
    onSuccess: () => { toast.success("Domain deleted"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deactivateInstrument = trpc.walletPay.deactivateInstrument.useMutation({
    onSuccess: () => { toast.success("Instrument deactivated"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const submitRegister = () => {
    const d = domain.trim().toLowerCase();
    if (!/^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/.test(d)) {
      toast.error("Enter a valid domain (e.g. shop.example.com)");
      return;
    }
    register.mutate({ domain: d });
  };

  const idOf = (d: any) => d.id ?? d.domainId ?? d.domain;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Wallet Domains
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Apple Pay web domains and saved customer wallet instruments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setRegisterOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Register Domain
          </Button>
        </div>
      </div>

      {/* Domains table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" /> Apple Pay Domains
          </h2>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-muted/30 rounded animate-pulse" />)}
          </div>
        ) : domains.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No domains registered</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Register the domain where you accept Apple Pay on the web</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Domain</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Registered</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domains.map((d: any) => {
                  const verified = !!(d.verified ?? d.isVerified);
                  return (
                    <tr key={idOf(d)} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground font-mono text-xs">{d.domain ?? d.domainName}</td>
                      <td className="px-4 py-3 text-center">
                        {verified ? (
                          <Badge variant="outline" className="text-xs gap-1 text-green-400 border-green-500/30">
                            <ShieldCheck className="w-3 h-3" /> Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs gap-1 text-amber-400 border-amber-500/30">
                            <ShieldQuestion className="w-3 h-3" /> Unverified
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {!verified && (
                            <Button variant="outline" size="sm" onClick={() => verify.mutate({ id: idOf(d) })} disabled={verify.isPending}>
                              Verify
                            </Button>
                          )}
                          <Button
                            variant="ghost" size="sm" title="Delete"
                            onClick={() => { if (window.confirm(`Delete domain "${d.domain ?? d.domainName}"?`)) del.mutate({ id: idOf(d) }); }}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instruments */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-muted-foreground" /> Wallet Instruments
          </h2>
        </div>
        {instruments.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No saved instruments</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Customer Apple Pay instruments appear here after first use</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instrument</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Added</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {instruments.map((ins: any) => (
                  <tr key={ins.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{ins.type ?? ins.brand ?? "wallet"} ····{ins.last4 ?? ""}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ins.id}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{ins.customerEmail ?? ins.customer ?? "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={`text-xs ${ins.active === false || ins.status === "deactivated" ? "text-red-400 border-red-500/30" : "text-green-400 border-green-500/30"}`}>
                        {ins.status ?? (ins.active === false ? "deactivated" : "active")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{fmtDate(ins.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {ins.active !== false && ins.status !== "deactivated" && (
                        <Button
                          variant="ghost" size="sm" title="Deactivate"
                          onClick={() => { if (window.confirm("Deactivate this instrument?")) deactivateInstrument.mutate({ id: ins.id }); }}
                        >
                          <Ban className="w-4 h-4 text-red-400" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register domain dialog */}
      <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Register Apple Pay Domain</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            Register the top-level domain or subdomain where your checkout runs. You'll need to host Apple's
            domain association file to verify it.
          </p>
          <div className="space-y-2 mt-2">
            <Label>Domain *</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="shop.example.com" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRegisterOpen(false)}>Cancel</Button>
            <Button onClick={submitRegister} disabled={register.isPending}>
              {register.isPending ? "Registering…" : "Register Domain"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
