/**
 * QR Payments Page
 * Adapted from PayGate PWA archive — uses qrcode.react + jsqr for camera scanning.
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
import { QrCode, Scan, Download, Share2, DollarSign, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  generateQRPaymentData,
  qrDataToString,
  parseQRCode,
  getRecentQRScans,
  saveQRScan,
  QRPaymentData,
  QRScanRecord,
} from "@/services/qr-payment.service";

export default function QRPayments() {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [qrData, setQRData] = useState("");
  const [scanning, setScanning] = useState(false);
  const [recentScans, setRecentScans] = useState<QRScanRecord[]>(getRecentQRScans());
  const [scanError, setScanError] = useState("");
  const [scannedPayment, setScannedPayment] = useState<QRPaymentData | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, []);

  const generateQR = () => {
    if (!amount && !description) {
      toast.error("Enter an amount or description to generate a QR code");
      return;
    }
    const paymentData = generateQRPaymentData(
      amount ? parseFloat(amount) : undefined,
      description || undefined
    );
    setQRData(qrDataToString(paymentData));
    toast.success("QR code generated");
  };

  const downloadQR = () => {
    const svg = document.querySelector("#qr-code-svg") as SVGElement;
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paygate-qr-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded");
  };

  const shareQR = async () => {
    if (navigator.share) {
      await navigator.share({ title: "PayGate QR Payment", text: qrData });
    } else {
      await navigator.clipboard.writeText(qrData);
      toast.success("QR data copied to clipboard");
    }
  };

  const startScanning = async () => {
    setScanError("");
    setScannedPayment(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setScanning(true);
        animFrameRef.current = requestAnimationFrame(scanQRCode);
      }
    } catch {
      setScanError("Camera access denied. Please allow camera access to scan QR codes.");
    }
  };

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setScanning(false);
  };

  const scanQRCode = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        const parsed = parseQRCode(code.data);
        if (parsed) {
          stopScanning();
          setScannedPayment(parsed);
          saveQRScan(parsed);
          setRecentScans(getRecentQRScans());
          toast.success("QR code scanned successfully");
          return;
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(scanQRCode);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          QR Payments
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Generate payment QR codes or scan to receive payments</p>
      </div>

      <Tabs defaultValue="generate">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate" className="gap-2"><QrCode className="w-4 h-4" />Generate QR</TabsTrigger>
          <TabsTrigger value="scan" className="gap-2"><Scan className="w-4 h-4" />Scan QR</TabsTrigger>
        </TabsList>

        {/* GENERATE TAB */}
        <TabsContent value="generate" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Payment QR Code</CardTitle>
              <CardDescription>Generate a QR code for customers to scan and pay</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Amount (USD)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input
                    placeholder="Payment for…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={generateQR} className="w-full gap-2">
                <QrCode className="w-4 h-4" />Generate QR Code
              </Button>
            </CardContent>
          </Card>

          {qrData && (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-4">
                <div className="p-4 bg-white rounded-xl shadow-sm border">
                  <QRCodeSVG id="qr-code-svg" value={qrData} size={200} level="H" />
                </div>
                <div className="text-center">
                  {amount && <p className="text-2xl font-bold text-foreground">${parseFloat(amount).toFixed(2)}</p>}
                  {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1 gap-2" onClick={downloadQR}>
                    <Download className="w-4 h-4" />Download
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2" onClick={shareQR}>
                    <Share2 className="w-4 h-4" />Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SCAN TAB */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scan Payment QR Code</CardTitle>
              <CardDescription>Use your camera to scan a PayGate QR code</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {scanError && (
                <Alert variant="destructive">
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription>{scanError}</AlertDescription>
                </Alert>
              )}

              {!scanning && !scannedPayment && (
                <Button onClick={startScanning} className="w-full gap-2">
                  <Scan className="w-4 h-4" />Start Camera Scan
                </Button>
              )}

              {scanning && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-48 h-48 border-2 border-white rounded-lg opacity-60" />
                    </div>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                  <Button variant="outline" onClick={stopScanning} className="w-full">Stop Scanning</Button>
                </div>
              )}

              {scannedPayment && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-emerald-600 font-medium">
                    <CheckCircle className="w-5 h-5" />QR Code Scanned Successfully
                  </div>
                  <Card className="bg-muted/40">
                    <CardContent className="pt-4 space-y-2">
                      {scannedPayment.amount && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Amount</span>
                          <span className="font-semibold">${scannedPayment.amount.toFixed(2)} {scannedPayment.currency}</span>
                        </div>
                      )}
                      {scannedPayment.description && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Description</span>
                          <span className="text-sm">{scannedPayment.description}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Reference</span>
                        <span className="text-xs font-mono text-muted-foreground">{scannedPayment.id}</span>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="flex gap-2">
                    <Button className="flex-1">Process Payment</Button>
                    <Button variant="outline" onClick={() => { setScannedPayment(null); startScanning(); }}>
                      Scan Again
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {recentScans.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4" />Recent Scans
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentScans.slice(0, 5).map((scan) => (
                  <div key={scan.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {scan.data.amount ? `$${scan.data.amount.toFixed(2)}` : "No amount"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {scan.data.description || "No description"} · {new Date(scan.scannedAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">Scanned</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
