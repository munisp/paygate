/**
 * QR Scan-to-Pay (Consumer)
 * Scans a merchant QR code and pays from the consumer wallet with PIN gate.
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { QrCode, CheckCircle, Loader2, ArrowLeft, Camera, Keyboard } from "lucide-react";
import { useLocation } from "wouter";
import { useOnboardingGate } from "@/hooks/useOnboardingGate";
import jsQR from "jsqr";

function PinDialog({ open, onClose, onConfirm, isPending, amount, merchantName }: {
  open: boolean; onClose: () => void; onConfirm: (pin: string) => void;
  isPending: boolean; amount: number; merchantName: string;
}) {
  const [pin, setPin] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o: any) => { if (!o) { onClose(); setPin(""); } }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader><DialogTitle>Confirm Payment</DialogTitle></DialogHeader>
        <div className="py-2 space-y-3">
          <div className="text-center">
            <p className="text-2xl font-bold">&#8358;{(amount / 100).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">to {merchantName}</p>
          </div>
          <Input type="password" inputMode="numeric" maxLength={4} placeholder="Enter PIN (••••)"
            className="text-center text-2xl tracking-widest" value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setPin(""); }} disabled={isPending}>Cancel</Button>
          <Button onClick={() => { if (pin.length !== 4) return; onConfirm(pin); setPin(""); }} disabled={pin.length !== 4 || isPending}>
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Pay Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function QRScanPay() {
  useOnboardingGate();
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualCode, setManualCode] = useState("");
  const [scannedData, setScannedData] = useState<{ qrToken: string; amount?: number; merchantName?: string } | null>(null);
  const [step, setStep] = useState<"scan" | "confirm" | "pin" | "success">("scan");
  const [txRef, setTxRef] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const payQR = trpc.consumerQrPay.pay.useMutation({
    onSuccess: (data) => {
      setTxRef(data.reference);
      setStep("success");
      utils.consumerWallet.getBalance.invalidate();
      utils.consumerWallet.history.invalidate();
      stopCamera();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scanFrame();
      }
    } catch (err) {
      setCameraError("Camera access denied. Use manual code entry instead.");
      setMode("manual");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    setScanning(false);
  };

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code) {
        handleQRData(code.data);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  };

  const handleQRData = (raw: string) => {
    stopCamera();
    try {
      // QR format: paygate://pay?token=xxx&amount=5000&merchant=StoreName
      const url = new URL(raw.startsWith("paygate://") ? raw.replace("paygate://", "https://") : raw);
      const token = url.searchParams.get("token") ?? raw;
      const amount = url.searchParams.get("amount") ? parseInt(url.searchParams.get("amount")!) : undefined;
      const merchantName = url.searchParams.get("merchant") ?? "Merchant";
      setScannedData({ qrToken: token, amount, merchantName });
      setStep("confirm");
    } catch {
      // Try treating entire string as token
      setScannedData({ qrToken: raw, merchantName: "Merchant" });
      setStep("confirm");
    }
  };

  const handleManualSubmit = () => {
    if (!manualCode.trim()) { toast.error("Enter a QR code or payment token"); return; }
    handleQRData(manualCode.trim());
  };

  useEffect(() => {
    if (mode === "scan" && step === "scan") startCamera();
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const [customAmount, setCustomAmount] = useState("");

  const finalAmount = scannedData?.amount ?? (customAmount ? Math.round(parseFloat(customAmount) * 100) : 0);

  if (step === "success") {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-emerald-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Payment Sent!</h2>
          <p className="text-muted-foreground text-sm mt-1">&#8358;{(finalAmount / 100).toLocaleString()} paid to {scannedData?.merchantName}</p>
          {txRef && <p className="text-xs text-muted-foreground mt-1 font-mono">Ref: {txRef}</p>}
        </div>
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={() => { setStep("scan"); setScannedData(null); setManualCode(""); setCustomAmount(""); startCamera(); }}>Scan Again</Button>
          <Button onClick={() => navigate("/consumer")}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => { stopCamera(); navigate("/consumer"); }}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">Scan to Pay</h1>
        <div className="ml-auto flex gap-1">
          <Button variant={mode === "scan" ? "default" : "ghost"} size="sm" onClick={() => { setMode("scan"); setStep("scan"); }}>
            <Camera className="w-4 h-4" />
          </Button>
          <Button variant={mode === "manual" ? "default" : "ghost"} size="sm" onClick={() => { setMode("manual"); stopCamera(); setStep("scan"); }}>
            <Keyboard className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {step === "scan" && mode === "scan" && (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-sm mx-auto">
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            <canvas ref={canvasRef} className="hidden" />
            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-56 border-2 border-white/70 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              </div>
            </div>
          </div>
          {cameraError && <p className="text-sm text-destructive text-center">{cameraError}</p>}
          {!scanning && !cameraError && (
            <Button className="w-full" onClick={startCamera}><Camera className="w-4 h-4 mr-2" />Start Camera</Button>
          )}
          <p className="text-xs text-muted-foreground text-center">Point your camera at a PayGate QR code</p>
        </div>
      )}

      {step === "scan" && mode === "manual" && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 py-8">
            <QrCode className="w-16 h-16 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Enter the payment code manually</p>
          </div>
          <div className="space-y-1.5">
            <Input placeholder="Paste QR token or payment code" value={manualCode} onChange={e => setManualCode(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleManualSubmit} disabled={!manualCode.trim()}>Continue</Button>
        </div>
      )}

      {step === "confirm" && scannedData && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="text-center space-y-1">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <QrCode className="w-7 h-7 text-primary" />
              </div>
              <p className="font-semibold text-lg">{scannedData.merchantName}</p>
              {scannedData.amount ? (
                <p className="text-3xl font-bold">&#8358;{(scannedData.amount / 100).toLocaleString()}</p>
              ) : (
                <div className="space-y-1.5 mt-3">
                  <p className="text-sm text-muted-foreground">Enter amount to pay</p>
                  <Input type="number" placeholder="Amount (NGN)" value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)} className="text-center text-xl font-bold" />
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("scan"); setScannedData(null); if (mode === "scan") startCamera(); }}>Cancel</Button>
              <Button className="flex-1" onClick={() => setStep("pin")}
                disabled={!scannedData.amount && !customAmount}>
                Enter PIN
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <PinDialog
        open={step === "pin"}
        onClose={() => setStep("confirm")}
        onConfirm={(pin) => payQR.mutate({ qrId: scannedData!.qrToken, amountKobo: finalAmount, pin })}
        isPending={payQR.isPending}
        amount={finalAmount}
        merchantName={scannedData?.merchantName ?? "Merchant"}
      />
    </div>
  );
}
