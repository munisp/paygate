import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { QrCode, Download, Copy, Link, DollarSign, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const BASE_URL = "https://pay.paygate.ng";

interface QRConfig {
  type: "payment" | "payment_link" | "checkout";
  amount?: number;
  currency: string;
  description?: string;
  reference?: string;
  paymentLinkId?: string;
}

function generatePaymentUrl(merchantId: string, config: QRConfig): string {
  const params = new URLSearchParams();
  params.set("mid", merchantId);
  params.set("type", config.type);
  if (config.amount) params.set("amount", String(config.amount));
  params.set("currency", config.currency);
  if (config.description) params.set("desc", config.description);
  if (config.reference) params.set("ref", config.reference);
  if (config.paymentLinkId) params.set("link", config.paymentLinkId);
  return `${BASE_URL}/pay?${params.toString()}`;
}

function QRCodeDisplay({ url }: { url: string }) {
  // Use a public QR code API to generate the QR image
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(url)}&format=png&margin=10`;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="border-4 border-primary/20 rounded-xl p-3 bg-white">
        <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
      </div>
      <p className="text-xs text-muted-foreground text-center max-w-xs break-all">{url}</p>
    </div>
  );
}

export default function QRGenerator() {
  const [tab, setTab] = useState("fixed");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [description, setDescription] = useState("");
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");

  const { data: merchantData } = trpc.settings.get.useQuery();
  const { data: linksData } = trpc.paymentLinks.list.useQuery();

  const merchantId = merchantData?.merchant?.id ?? "mid_demo";

  function handleGenerate() {
    const config: QRConfig = {
      type: tab === "link" ? "payment_link" : "payment",
      amount: amount ? parseFloat(amount) * 100 : undefined,
      currency,
      description,
      reference: `REF-${Date.now()}`,
      paymentLinkId: selectedLinkId || undefined,
    };
    const url = generatePaymentUrl(merchantId, config);
    setGeneratedUrl(url);
    toast.success("QR code generated!");
  }

  function handleCopyUrl() {
    navigator.clipboard.writeText(generatedUrl);
    toast.success("URL copied to clipboard");
  }

  function handleDownload() {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(generatedUrl)}&format=png&margin=10`;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `paygate-qr-${Date.now()}.png`;
    a.click();
    toast.success("QR code downloading...");
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">QR Code Generator</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate payment QR codes and deep-links for your business
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Configure QR Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="fixed" className="flex-1">Fixed Amount</TabsTrigger>
                <TabsTrigger value="open" className="flex-1">Open Amount</TabsTrigger>
                <TabsTrigger value="link" className="flex-1">Payment Link</TabsTrigger>
              </TabsList>

              <TabsContent value="fixed" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e: any) => setAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NGN", "USD", "GHS", "KES", "ZAR"].map((c: any) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="e.g. Product purchase"
                    value={description}
                    onChange={(e: any) => setDescription(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="open" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["NGN", "USD", "GHS", "KES", "ZAR"].map((c: any) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Input
                    placeholder="Customer enters amount at checkout"
                    value={description}
                    onChange={(e: any) => setDescription(e.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent value="link" className="space-y-4 mt-4">
                <div className="space-y-1.5">
                  <Label>Payment Link</Label>
                  <Select value={selectedLinkId} onValueChange={setSelectedLinkId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a payment link..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(linksData) ? linksData : (linksData as any)?.links ?? []).map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.title ?? l.id} — {l.currency} {((l.amount ?? 0) / 100).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            <Button className="w-full" onClick={handleGenerate}>
              <QrCode className="h-4 w-4 mr-2" />
              Generate QR Code
            </Button>
          </CardContent>
        </Card>

        {/* Preview panel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>Scan with any camera to test</CardDescription>
          </CardHeader>
          <CardContent>
            {generatedUrl ? (
              <div className="space-y-4">
                <QRCodeDisplay url={generatedUrl} />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={handleCopyUrl}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy URL
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Link className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-xs text-muted-foreground break-all">{generatedUrl}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <QrCode className="h-16 w-16 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm">Configure and generate a QR code to preview it here</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex gap-3">
              <DollarSign className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Fixed Amount</p>
                <p className="text-muted-foreground">Pre-set the price — ideal for products with fixed pricing</p>
              </div>
            </div>
            <div className="flex gap-3">
              <RefreshCw className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Open Amount</p>
                <p className="text-muted-foreground">Customer enters amount — ideal for donations or variable services</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Link className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Payment Link</p>
                <p className="text-muted-foreground">Link to an existing payment page with full customization</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
