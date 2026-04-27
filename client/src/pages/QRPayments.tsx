/**
 * QR Payments Page — wired to tRPC qrPayments router
 */
import { useState, useRef, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { QrCode, Scan, Download, Share2, Clock, CheckCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAdaptiveInterval } from "@/lib/networkQuality";

export default function QRPayments() {
  const qrPaymentsInterval = useAdaptiveInterval(30000);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [qrPaymentUrl, setQrPaymentUrl] = useState("");
  const [qrMeta, setQrMeta] = useState<{ qrId: string; merchantName: string; expiresAt: Date } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scannedUrl, setScannedUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  const generateMutation = trpc.qrPayments.generate.useMutation({
    onSuccess: (data) => {
      setQrPaymentUrl(data.paymentUrl);
      setQrMeta({ qrId: data.qrId, merchantName: data.merchantName, expiresAt: data.expiresAt });
      toast.success("QR code generated — valid for 1 hour");
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: recentData, isLoading: recentLoading, refetch: refetchRecent } =
    trpc.qrPayments.recentScans.useQuery({ limit: 20 }, { refetchInterval: qrPaymentsInterval });

  useEffect(() => { return () => { stopScanning(); }; }, []);

  const handleGenerate = () => {
    if (!amount && !description) {
      toast.error("Enter an amount or description to generate a QR code");
      return;
    }
    generateMutation.mutate({
      amount: amount ? Math.round(parseFloat(amount) * 100) : undefined,
      currency: "NGN",
      description: description || undefined,
    });
  };

  const downloadQR = () => {
    const svg = document.querySelector("#qr-code-svg") as SVGElement;
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paygate-qr-${qrMeta?.qrId ?? "code"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded");
  };

  const shareQR = async () => {
    if (!qrPaymentUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "PayGate QR Payment", url: qrPaymentUrl });
    } else {
      navigator.clipboard.writeText(qrPaymentUrl);
      toast.success("Payment URL copied to clipboard");
    }
  };

  const startScanning = async () => {
    setScanError(""); setScannedUrl("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setScanning(true);
      scanFrame();
    } catch { setScanError("Camera access denied. Please allow camera permissions."); }
  };

  const stopScanning = () => {
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t: any) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const scanFrame = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame); return;
    }
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
    if (code) { stopScanning(); setScannedUrl(code.data); toast.success("QR code scanned"); }
    else { animFrameRef.current = requestAnimationFrame(scanFrame); }
  };

  const recentRows = (recentData as any)?.rows ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>QR Payments</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Generate QR codes for instant payments and scan incoming QR codes</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchRecent()}>
          <RefreshCw className="w-4 h-4 mr-2" />Refresh
        </Button>
      </div>

      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate"><QrCode className="w-4 h-4 mr-2" />Generate QR</TabsTrigger>
          <TabsTrigger value="scan"><Scan className="w-4 h-4 mr-2" />Scan QR</TabsTrigger>
          <TabsTrigger value="history"><Clock className="w-4 h-4 mr-2" />Recent Scans</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Create Payment QR</CardTitle>
                <CardDescription>Generate a QR code for your customers to scan and pay</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="qr-amount">Amount (NGN) — optional</Label>
                  <Input id="qr-amount" type="number" placeholder="e.g. 5000" value={amount}
                    onChange={(e: any) => setAmount(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="qr-desc">Description — optional</Label>
                  <Input id="qr-desc" placeholder="e.g. Invoice #1234" value={description}
                    onChange={(e: any) => setDescription(e.target.value)} className="mt-1" />
                </div>
                <Button className="w-full" onClick={handleGenerate} disabled={generateMutation.isPending}>
                  {generateMutation.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                    : <><QrCode className="w-4 h-4 mr-2" />Generate QR Code</>}
                </Button>
              </CardContent>
            </Card>

            {qrPaymentUrl && qrMeta && (
              <Card>
                <CardHeader>
                  <CardTitle>Your QR Code</CardTitle>
                  <CardDescription>
                    Valid until {new Date(qrMeta.expiresAt).toLocaleTimeString()} · {qrMeta.qrId.slice(0, 16)}…
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-2xl border border-border shadow-sm">
                    <QRCodeSVG id="qr-code-svg" value={qrPaymentUrl} size={200} level="H" includeMargin />
                  </div>
                  <p className="text-xs text-muted-foreground text-center font-mono break-all max-w-[240px]">{qrPaymentUrl}</p>
                  <div className="flex gap-2 w-full">
                    <Button variant="outline" className="flex-1" onClick={downloadQR}>
                      <Download className="w-4 h-4 mr-2" />Download
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={shareQR}>
                      <Share2 className="w-4 h-4 mr-2" />Share
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="scan" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Scan QR Code</CardTitle>
              <CardDescription>Use your camera to scan a customer's QR code</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scanError && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>{scanError}</AlertDescription>
                </Alert>
              )}
              {scannedUrl && (
                <Alert>
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <AlertDescription>
                    <span className="font-medium">Scanned:</span>{" "}
                    <a href={scannedUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">{scannedUrl}</a>
                  </AlertDescription>
                </Alert>
              )}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-w-sm mx-auto">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                <canvas ref={canvasRef} className="hidden" />
                {!scanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <Scan className="w-12 h-12 text-white opacity-60" />
                  </div>
                )}
              </div>
              <div className="flex justify-center">
                {scanning
                  ? <Button variant="destructive" onClick={stopScanning}>Stop Scanning</Button>
                  : <Button onClick={startScanning}><Scan className="w-4 h-4 mr-2" />Start Camera</Button>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent QR Transactions</CardTitle>
              <CardDescription>Payments received via QR code</CardDescription>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentRows.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <QrCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No QR payments yet. Generate a QR code and share it with customers.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentRows.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <QrCode className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{tx.customerName ?? tx.customerEmail ?? "Customer"}</p>
                          <p className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm">{tx.currency} {Number(tx.amount).toLocaleString()}</p>
                        <Badge variant="secondary" className={`text-xs ${tx.status === "completed" ? "status-success" : "bg-muted text-muted-foreground border-0"}`}>
                          {tx.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
