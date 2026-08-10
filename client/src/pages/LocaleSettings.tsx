/**
 * Wave 175 — Locale & Internationalisation Settings
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Globe, Save } from "lucide-react";

export default function LocaleSettings() {
  const utils = trpc.useUtils();
  const { data: prefs, isLoading } = trpc.locale.get.useQuery();
  const { data: options } = trpc.locale.options.useQuery();

  const [form, setForm] = useState({
    locale: "en-NG",
    currency: "NGN",
    timezone: "Africa/Lagos",
    dateFormat: "DD/MM/YYYY",
    numberFormat: "1,234.56",
  });

  useEffect(() => {
    if (prefs) {
      setForm({
        locale: prefs.locale,
        currency: prefs.currency,
        timezone: prefs.timezone,
        dateFormat: prefs.dateFormat,
        numberFormat: prefs.numberFormat,
      });
    }
  }, [prefs]);

  const updateMutation = trpc.locale.update.useMutation({
    onSuccess: () => {
      toast.success("Locale preferences saved");
      utils.locale.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground p-4">Loading preferences…</div>;

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Language & Regional Settings
        </CardTitle>
        <CardDescription>
          Customise how dates, numbers, and currencies are displayed across the portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Language</Label>
          <Select value={form.locale} onValueChange={(v) => setForm(f => ({ ...f, locale: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options?.locales.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={form.currency} onValueChange={(v) => setForm(f => ({ ...f, currency: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options?.currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.symbol} — {c.label} ({c.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={form.timezone} onValueChange={(v) => setForm(f => ({ ...f, timezone: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options?.timezones.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Date Format</Label>
          <Select value={form.dateFormat} onValueChange={(v) => setForm(f => ({ ...f, dateFormat: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (17/05/2026)</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (05/17/2026)</SelectItem>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2026-05-17)</SelectItem>
              <SelectItem value="D MMM YYYY">D MMM YYYY (17 May 2026)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Number Format</Label>
          <Select value={form.numberFormat} onValueChange={(v) => setForm(f => ({ ...f, numberFormat: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1,234.56">1,234.56 (comma thousands, dot decimal)</SelectItem>
              <SelectItem value="1.234,56">1.234,56 (dot thousands, comma decimal)</SelectItem>
              <SelectItem value="1 234.56">1 234.56 (space thousands, dot decimal)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Preview */}
        <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Preview</p>
          <p>Date: <span className="font-medium">{new Date().toLocaleDateString(form.locale)}</span></p>
          <p>Amount: <span className="font-medium">
            {new Intl.NumberFormat(form.locale, { style: "currency", currency: form.currency }).format(1234567.89)}
          </span></p>
          <p>Time: <span className="font-medium">
            {new Date().toLocaleTimeString(form.locale, { timeZone: form.timezone })} ({form.timezone})
          </span></p>
        </div>

        <Button
          onClick={() => updateMutation.mutate(form)}
          disabled={updateMutation.isPending}
          className="w-full"
        >
          <Save className="w-3 h-3 mr-1" />
          {updateMutation.isPending ? "Saving…" : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
