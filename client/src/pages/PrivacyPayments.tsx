import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function PrivacyPayments() {
  const [privateId, setPrivateId] = useState<{ privateId: string; qrCode: string; expiresAt: string } | null>(null);

  const { data: settings } = trpc4.privacyPayments.getPrivacySettings.useQuery();
  const { data: history } = trpc4.privacyPayments.getPrivateTransactionHistory.useQuery({ page: 1, limit: 20 });

  const updateMutation = trpc4.privacyPayments.updatePrivacySettings.useMutation({
    onSuccess: () => toast.success("Privacy settings updated"),
    onError: (e) => toast.error(e.message),
  });
  const generateIdMutation = trpc4.privacyPayments.generatePrivatePaymentId.useMutation({
    onSuccess: (d) => setPrivateId(d),
    onError: (e) => toast.error(e.message),
  });

  const toggle = (field: string, value: boolean) => {
    if (!settings) return;
    updateMutation.mutate({ ...settings, privateAlias: settings.privateAlias ?? undefined, [field]: value });
  };

  const ToggleRow = ({ label, field, value, description }: { label: string; field: string; value: boolean; description: string }) => (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-gray-200"}`}
        onClick={() => toggle(field, !value)}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Privacy Payments</h1>
        <Badge variant="outline" className="text-purple-600 border-purple-600">🔒 Enhanced Privacy</Badge>
      </div>

      {/* Privacy Settings */}
      {settings && (
        <Card>
          <CardHeader><CardTitle>Privacy Settings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow label="Hide Transaction Amounts" field="hideTransactionAmounts" value={settings.hideTransactionAmounts} description="Mask amounts in transaction history" />
            <ToggleRow label="Hide Recipient Names" field="hideRecipientNames" value={settings.hideRecipientNames} description="Show only masked recipient identifiers" />
            <ToggleRow label="Mask Account Numbers" field="maskAccountNumbers" value={settings.maskAccountNumbers} description="Show only last 4 digits of account numbers" />
            <ToggleRow label="Use Private Alias" field="usePrivateAlias" value={settings.usePrivateAlias} description="Use an alias instead of your real name" />
            <ToggleRow label="2FA on Payment" field="twoFactorOnPayment" value={settings.twoFactorOnPayment} description="Require 2FA for every payment" />
            {settings.privateAlias && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Your Private Alias</p>
                <p className="font-mono font-bold">{settings.privateAlias}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Private Payment ID */}
      <Card>
        <CardHeader><CardTitle>Private Payment ID</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Generate a one-time private payment ID that expires in 24 hours. Share this instead of your account number.</p>
          <Button disabled={generateIdMutation.isPending} onClick={() => generateIdMutation.mutate()}>
            {generateIdMutation.isPending ? "Generating..." : "Generate Private ID"}
          </Button>
          {privateId && (
            <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Private Payment ID</p>
                  <p className="font-mono font-bold text-lg">{privateId.privateId}</p>
                  <p className="text-xs text-muted-foreground">Expires: {new Date(privateId.expiresAt).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(privateId.privateId); toast.success("Copied"); }}>Copy</Button>
              </div>
              {privateId.qrCode && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">QR Code</p>
                  <img src={privateId.qrCode} alt="Private Payment QR" className="w-32 h-32 border rounded" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Private Transaction History */}
      <Card>
        <CardHeader><CardTitle>Private Transaction History</CardTitle></CardHeader>
        <CardContent>
          {!history?.transactions?.length ? <p className="text-muted-foreground text-sm">No private transactions yet</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Recipient</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Status</th><th className="text-right py-2">Date</th></tr></thead>
              <tbody>
                {history.transactions.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 font-mono text-xs">{t.maskedRecipient}</td>
                    <td className="text-right font-mono">{t.maskedAmount}</td>
                    <td className="text-right"><Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge></td>
                    <td className="text-right text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
