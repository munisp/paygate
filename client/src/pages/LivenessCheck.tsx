/**
 * LivenessCheck.tsx — Web Liveness Verification Page
 *
 * Capabilities:
 *  - Passive liveness (single image capture)
 *  - Active liveness (video/motion challenge: blink, nod, smile, turn)
 *  - Face detection with bounding box overlay
 *  - 68-point facial landmark visualisation
 *  - Face feature extraction (ArcFace 512-dim embedding)
 *  - Face matching (two-image cosine similarity)
 *  - Anti-spoofing classification with 6 spoof types
 *  - Confidence score display
 *  - Spoof rejection UX with detailed reason
 *  - Real-time camera feed with challenge overlay
 *  - Result persistence via tRPC → DB
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Camera, Eye, Scan, Fingerprint, Users, ShieldX, ShieldCheck,
  RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, Info
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckMode = "passive" | "active" | "full" | "detect" | "landmarks" | "extract" | "match";
type ChallengeType = "blink" | "nod" | "smile" | "turn_left" | "turn_right";
type Decision = "real" | "spoof" | "uncertain" | null;

interface SpoofScores {
  printed_photo: number;
  screen_replay: number;
  paper_mask: number;
  "3d_mask": number;
  deepfake: number;
  high_quality_photo: number;
}

interface LivenessResult {
  session_id: string;
  decision: Decision;
  spoof_type?: string;
  liveness_score: number;
  confidence: number;
  spoof_scores?: SpoofScores;
  face_detected: boolean;
  face_count: number;
  passive_score?: number;
  active_score?: number;
  challenge_passed?: boolean;
  quality_score?: number;
  processing_ms: number;
}

interface LandmarkPoint { x: number; y: number; z: number; visibility: number; }
interface FaceBox { bbox: number[]; confidence: number; }

const CHALLENGES: { type: ChallengeType; label: string; instruction: string; icon: string }[] = [
  { type: "blink", label: "Blink", instruction: "Slowly blink both eyes", icon: "👁️" },
  { type: "nod", label: "Nod", instruction: "Nod your head up and down", icon: "↕️" },
  { type: "smile", label: "Smile", instruction: "Give a natural smile", icon: "😊" },
  { type: "turn_left", label: "Turn Left", instruction: "Slowly turn your head left", icon: "⬅️" },
  { type: "turn_right", label: "Turn Right", instruction: "Slowly turn your head right", icon: "➡️" },
];

const SPOOF_TYPE_LABELS: Record<string, string> = {
  printed_photo: "Printed Photo",
  screen_replay: "Screen Replay Attack",
  paper_mask: "Paper Mask",
  "3d_mask": "3D Mask",
  deepfake: "Deepfake Video",
  high_quality_photo: "High-Quality Photo",
  passive_spoof: "Passive Spoof",
  challenge_failed: "Challenge Failed",
};

// ─── Camera hook ──────────────────────────────────────────────────────────────

function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStreaming(true);
        setError(null);
      }
    } catch (e: any) {
      setError(e.message ?? "Camera access denied");
      setStreaming(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streaming) return null;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    // Return base64 without data URI prefix
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
  }, [streaming]);

  useEffect(() => () => { stopCamera(); }, [stopCamera]);

  return { videoRef, canvasRef, streaming, error, startCamera, stopCamera, captureFrame };
}

// ─── Score bar component ───────────────────────────────────────────────────────

function ScoreBar({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className={danger && pct > 30 ? "text-destructive font-medium" : ""}>{pct}%</span>
      </div>
      <Progress
        value={pct}
        className={`h-2 ${danger && pct > 30 ? "[&>div]:bg-destructive" : pct > 60 ? "[&>div]:bg-green-500" : "[&>div]:bg-amber-500"}`}
      />
    </div>
  );
}

// ─── Result panel ─────────────────────────────────────────────────────────────

function ResultPanel({ result, onReset }: { result: LivenessResult; onReset: () => void }) {
  const isReal = result.decision === "real";
  const isSpoof = result.decision === "spoof";

  return (
    <div className="space-y-4">
      {/* Decision banner */}
      <div className={`rounded-xl p-5 flex items-center gap-4 ${
        isReal ? "bg-green-50 border border-green-200 dark:bg-green-950/30 dark:border-green-800"
        : isSpoof ? "bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800"
        : "bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
      }`}>
        {isReal ? <ShieldCheck className="h-10 w-10 text-green-600 shrink-0" />
          : isSpoof ? <ShieldX className="h-10 w-10 text-red-600 shrink-0" />
          : <AlertTriangle className="h-10 w-10 text-amber-600 shrink-0" />}
        <div>
          <div className={`text-lg font-bold ${isReal ? "text-green-700 dark:text-green-400" : isSpoof ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
            {isReal ? "Liveness Verified" : isSpoof ? "Spoof Detected" : "Uncertain — Retry"}
          </div>
          {isSpoof && result.spoof_type && (
            <div className="text-sm text-red-600 dark:text-red-400 mt-0.5">
              Attack type: <strong>{SPOOF_TYPE_LABELS[result.spoof_type] ?? result.spoof_type}</strong>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            Session: {result.session_id} · {result.processing_ms}ms
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Score Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ScoreBar label="Liveness Score" value={result.liveness_score} />
          <ScoreBar label="Confidence" value={result.confidence} />
          {result.passive_score !== undefined && (
            <ScoreBar label="Passive Score" value={result.passive_score} />
          )}
          {result.active_score !== undefined && result.active_score > 0 && (
            <ScoreBar label="Active Score" value={result.active_score} />
          )}
          {result.quality_score !== undefined && (
            <ScoreBar label="Image Quality" value={result.quality_score} />
          )}
        </CardContent>
      </Card>

      {/* Spoof type scores */}
      {result.spoof_scores && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Anti-Spoofing Analysis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ScoreBar label="Printed Photo" value={result.spoof_scores.printed_photo} danger />
            <ScoreBar label="Screen Replay" value={result.spoof_scores.screen_replay} danger />
            <ScoreBar label="Paper Mask" value={result.spoof_scores.paper_mask} danger />
            <ScoreBar label="3D Mask" value={result.spoof_scores["3d_mask"]} danger />
            <ScoreBar label="Deepfake" value={result.spoof_scores.deepfake} danger />
            <ScoreBar label="High-Quality Photo" value={result.spoof_scores.high_quality_photo} danger />
          </CardContent>
        </Card>
      )}

      {/* Face metadata */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-bold">{result.face_count}</div>
          <div className="text-xs text-muted-foreground">Faces</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-bold">{result.challenge_passed !== undefined ? (result.challenge_passed ? "✓" : "✗") : "—"}</div>
          <div className="text-xs text-muted-foreground">Challenge</div>
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-center">
          <div className="text-lg font-bold">{Math.round((result.quality_score ?? 0) * 100)}%</div>
          <div className="text-xs text-muted-foreground">Quality</div>
        </div>
      </div>

      <Button aria-label="Refresh" onClick={onReset} variant="outline" className="w-full"><RefreshCw/> Run Another Check
      </Button>
    </div>
  );
}

// ─── Landmark canvas overlay ──────────────────────────────────────────────────

function LandmarkOverlay({ landmarks, faces, width, height }: {
  landmarks: LandmarkPoint[]; faces: FaceBox[]; width: number; height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // Draw face bounding boxes
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    faces.forEach(f => {
      const [x1, y1, x2, y2] = f.bbox;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = "#22c55e";
      ctx.font = "12px sans-serif";
      ctx.fillText(`${Math.round(f.confidence * 100)}%`, x1, y1 - 4);
    });

    // Draw 68-point landmarks
    ctx.fillStyle = "#3b82f6";
    landmarks.forEach(lm => {
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });
  }, [landmarks, faces, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
    />
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LivenessCheck() {
  const { user } = useAuth();
  const { videoRef, canvasRef, streaming, error: cameraError, startCamera, stopCamera, captureFrame } = useCamera();

  const [mode, setMode] = useState<CheckMode>("passive");
  const [challenge, setChallenge] = useState<ChallengeType>("blink");
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [landmarks, setLandmarks] = useState<LandmarkPoint[]>([]);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [embedding, setEmbedding] = useState<number[]>([]);
  const [frame1B64, setFrame1B64] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"idle" | "capture1" | "challenge" | "capture2" | "processing" | "done">("idle");
  const [videoSize, setVideoSize] = useState({ w: 640, h: 480 });

  const checkLiveness = trpc.kyc.checkLiveness.useMutation();
  const isLoading = checkLiveness.isPending;
  const faceDetect = trpc.kyc.faceDetect.useMutation();
  const landmarksMut = trpc.kyc.landmarks.useMutation();
  const extractEmbedding = trpc.kyc.extractEmbedding.useMutation();
  const faceMatch = trpc.kyc.faceMatch.useMutation();
  const saveLiveness = trpc.kyc.saveLivenessResult.useMutation();

  const handleVideoLoad = useCallback(() => {
    if (videoRef.current) {
      setVideoSize({ w: videoRef.current.videoWidth || 640, h: videoRef.current.videoHeight || 480 });
    }
  }, [videoRef]);

  const reset = useCallback(() => {
    setResult(null);
    setLandmarks([]);
    setFaces([]);
    setEmbedding([]);
    setFrame1B64(null);
    setStep("idle");
    setIsProcessing(false);
  }, []);

  // ── Passive / Full: single capture ────────────────────────────────────────
  const runPassive = useCallback(async () => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setIsProcessing(true);
    setStep("processing");
    try {
      const res = await checkLiveness.mutateAsync({
        submissionId: `web-${Date.now()}`,
        imageB64: b64,
        mode: "passive",
      });
      setResult(res as unknown as LivenessResult);
      setStep("done");
    } catch (e: any) {
      toast.error(`Liveness check failed: ${e.message}`);
      setStep("idle");
    } finally {
      setIsProcessing(false);
    }
  }, [captureFrame, checkLiveness]);

  // ── Active: two-frame challenge ────────────────────────────────────────────
  const startActiveChallenge = useCallback(() => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setFrame1B64(b64);
    setStep("challenge");
    toast.info(`Challenge: ${CHALLENGES.find(c => c.type === challenge)?.instruction}`);
  }, [captureFrame, challenge]);

  const completeActiveChallenge = useCallback(async () => {
    if (!frame1B64) return;
    const b64_2 = captureFrame();
    if (!b64_2) { toast.error("Could not capture second frame"); return; }
    setIsProcessing(true);
    setStep("processing");
    try {
      const res = await checkLiveness.mutateAsync({
        submissionId: `web-active-${Date.now()}`,
        imageB64: frame1B64,
        imageB64_2: b64_2,
        mode: "active",
        challenge,
      });
      setResult(res as unknown as LivenessResult);
      setStep("done");
    } catch (e: any) {
      toast.error(`Active liveness failed: ${e.message}`);
      setStep("idle");
    } finally {
      setIsProcessing(false);
    }
  }, [frame1B64, captureFrame, checkLiveness, challenge]);

  // ── Face detect ────────────────────────────────────────────────────────────
  const runDetect = useCallback(async () => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setIsProcessing(true);
    try {
      const res = await faceDetect.mutateAsync({ imageB64: b64 });
      setFaces(res.faces ?? []);
      toast.success(`Detected ${res.face_count} face(s) in ${res.processing_ms}ms`);
    } catch (e: any) {
      toast.error(`Detection failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [captureFrame, faceDetect]);

  // ── Landmarks ──────────────────────────────────────────────────────────────
  const runLandmarks = useCallback(async () => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setIsProcessing(true);
    try {
      const res = await landmarksMut.mutateAsync({ imageB64: b64 });
      setLandmarks(res.landmarks_68 ?? []);
      toast.success(`Extracted ${res.landmark_count} landmarks in ${res.processing_ms}ms`);
    } catch (e: any) {
      toast.error(`Landmark extraction failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [captureFrame, landmarksMut]);

  // ── Embedding extraction ───────────────────────────────────────────────────
  const runExtract = useCallback(async () => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setIsProcessing(true);
    try {
      const res = await extractEmbedding.mutateAsync({ imageB64: b64 });
      setEmbedding(res.embedding ?? []);
      toast.success(`Extracted ${res.embedding_dim}-dim embedding in ${res.processing_ms}ms`);
    } catch (e: any) {
      toast.error(`Embedding extraction failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [captureFrame, extractEmbedding]);

  // ── Face match ─────────────────────────────────────────────────────────────
  const [matchEmb1, setMatchEmb1] = useState<number[]>([]);
  const [matchEmb2, setMatchEmb2] = useState<number[]>([]);
  const [matchResult, setMatchResult] = useState<{ similarity: number; match: boolean; threshold: number } | null>(null);

  const captureMatchFrame = useCallback(async (slot: 1 | 2) => {
    const b64 = captureFrame();
    if (!b64) { toast.error("Could not capture frame"); return; }
    setIsProcessing(true);
    try {
      const res = await extractEmbedding.mutateAsync({ imageB64: b64 });
      if (slot === 1) { setMatchEmb1(res.embedding); toast.success("Face 1 captured"); }
      else { setMatchEmb2(res.embedding); toast.success("Face 2 captured"); }
    } catch (e: any) {
      toast.error(`Capture failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [captureFrame, extractEmbedding]);

  const runFaceMatch = useCallback(async () => {
    if (!matchEmb1.length || !matchEmb2.length) {
      toast.error("Capture both faces first");
      return;
    }
    setIsProcessing(true);
    try {
      const res = await faceMatch.mutateAsync({ embedding1: matchEmb1, embedding2: matchEmb2 });
      setMatchResult({ similarity: res.similarity, match: res.match, threshold: res.threshold });
      toast[res.match ? "success" : "warning"](
        res.match ? `Match! Similarity: ${(res.similarity * 100).toFixed(1)}%` : `No match. Similarity: ${(res.similarity * 100).toFixed(1)}%`
      );
    } catch (e: any) {
      toast.error(`Face match failed: ${e.message}`);
    } finally {
      setIsProcessing(false);
    }
  }, [matchEmb1, matchEmb2, faceMatch]);

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Fingerprint className="h-6 w-6 text-primary" />
          Liveness Verification
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Biometric anti-spoofing with passive, active, and face-match verification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera panel */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              {/* Camera feed */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  onLoadedMetadata={handleVideoLoad}
                  muted
                  playsInline
                />
                <canvas ref={canvasRef} className="hidden" />
                {(landmarks.length > 0 || faces.length > 0) && (
                  <LandmarkOverlay
                    landmarks={landmarks}
                    faces={faces}
                    width={videoSize.w}
                    height={videoSize.h}
                  />
                )}
                {!streaming && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center text-white space-y-3">
                      <Camera className="h-12 w-12 mx-auto opacity-50" />
                      <p className="text-sm opacity-70">Camera not active</p>
                    </div>
                  </div>
                )}
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="bg-black/80 rounded-xl px-6 py-4 flex items-center gap-3 text-white">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-sm">Analysing...</span>
                    </div>
                  </div>
                )}
                {step === "challenge" && (
                  <div className="absolute bottom-3 left-3 right-3 bg-primary/90 rounded-lg p-3 text-white text-center text-sm font-medium">
                    {CHALLENGES.find(c => c.type === challenge)?.icon}{" "}
                    {CHALLENGES.find(c => c.type === challenge)?.instruction}
                  </div>
                )}
              </div>

              {cameraError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{cameraError}</AlertDescription>
                </Alert>
              )}

              {/* Camera controls */}
              <div className="flex gap-2">
                {!streaming ? (
                  <Button onClick={startCamera} className="flex-1">
                    <Camera className="h-4 w-4 mr-2" /> Start Camera
                  </Button>
                ) : (
                  <Button onClick={stopCamera} variant="outline" className="flex-1">
                    Stop Camera
                  </Button>
                )}
                {result && (
                  <Button aria-label="Refresh" onClick={reset} variant="ghost" size="icon"><RefreshCw/>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Mode selector */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Check Mode</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "passive", label: "Passive", icon: Eye, desc: "Single image" },
                  { value: "active", label: "Active", icon: RefreshCw, desc: "Motion challenge" },
                  { value: "detect", label: "Detect", icon: Scan, desc: "Face detection" },
                  { value: "landmarks", label: "Landmarks", icon: Info, desc: "68-point mesh" },
                  { value: "extract", label: "Extract", icon: Fingerprint, desc: "ArcFace embed" },
                  { value: "match", label: "Match", icon: Users, desc: "Two-face compare" },
                ].map(m => (
                  <button
                    key={m.value}
                    onClick={() => { setMode(m.value as CheckMode); reset(); }}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      mode === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <m.icon className={`h-4 w-4 ${mode === m.value ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-sm font-medium">{m.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                  </button>
                ))}
              </div>

              {/* Active challenge selector */}
              {mode === "active" && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Challenge Type</p>
                  <div className="flex flex-wrap gap-2">
                    {CHALLENGES.map(c => (
                      <Badge
                        key={c.type}
                        variant={challenge === c.type ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => setChallenge(c.type)}
                      >
                        {c.icon} {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2">
                {mode === "passive" && (
                  <Button
                    onClick={runPassive}
                    disabled={!streaming || isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
                    Run Passive Check
                  </Button>
                )}

                {mode === "active" && step === "idle" && (
                  <Button onClick={startActiveChallenge} disabled={!streaming || isProcessing} className="w-full">
                    <Camera className="h-4 w-4 mr-2" /> Capture Before Frame
                  </Button>
                )}
                {mode === "active" && step === "challenge" && (
                  <Button onClick={completeActiveChallenge} disabled={!streaming || isProcessing} className="w-full">
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Capture After Frame
                  </Button>
                )}

                {mode === "detect" && (
                  <Button onClick={runDetect} disabled={!streaming || isProcessing} className="w-full">
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Scan className="h-4 w-4 mr-2" />}
                    Detect Faces
                  </Button>
                )}

                {mode === "landmarks" && (
                  <Button onClick={runLandmarks} disabled={!streaming || isProcessing} className="w-full">
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Info className="h-4 w-4 mr-2" />}
                    Extract Landmarks
                  </Button>
                )}

                {mode === "extract" && (
                  <Button onClick={runExtract} disabled={!streaming || isProcessing} className="w-full">
                    {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Fingerprint className="h-4 w-4 mr-2" />}
                    Extract Embedding
                  </Button>
                )}

                {mode === "match" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => captureMatchFrame(1)}
                        disabled={!streaming || isProcessing}
                        variant={matchEmb1.length > 0 ? "outline" : "default"}
                        size="sm"
                      >
                        {matchEmb1.length > 0 ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" /> : null}
                        Face 1
                      </Button>
                      <Button
                        onClick={() => captureMatchFrame(2)}
                        disabled={!streaming || isProcessing}
                        variant={matchEmb2.length > 0 ? "outline" : "default"}
                        size="sm"
                      >
                        {matchEmb2.length > 0 ? <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" /> : null}
                        Face 2
                      </Button>
                    </div>
                    <Button
                      onClick={runFaceMatch}
                      disabled={!matchEmb1.length || !matchEmb2.length || isProcessing}
                      className="w-full"
                    >
                      {isProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
                      Compare Faces
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results panel */}
        <div className="space-y-4">
          {/* Liveness result */}
          {result && step === "done" ? (
            <ResultPanel result={result} onReset={reset} />
          ) : (
            <Card className="h-full min-h-[200px] flex items-center justify-center">
              <div className="text-center text-muted-foreground p-8">
                <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Results will appear here after verification</p>
              </div>
            </Card>
          )}

          {/* Face match result */}
          {mode === "match" && matchResult && (
            <Card className={matchResult.match ? "border-green-300 dark:border-green-700" : "border-red-300 dark:border-red-700"}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  {matchResult.match
                    ? <CheckCircle2 className="h-8 w-8 text-green-500 shrink-0" />
                    : <XCircle className="h-8 w-8 text-red-500 shrink-0" />}
                  <div>
                    <div className="font-semibold">{matchResult.match ? "Same Person" : "Different Person"}</div>
                    <div className="text-sm text-muted-foreground">
                      Similarity: {(matchResult.similarity * 100).toFixed(2)}% (threshold: {(matchResult.threshold * 100).toFixed(0)}%)
                    </div>
                  </div>
                </div>
                <Progress
                  value={matchResult.similarity * 100}
                  className={`mt-3 h-2 ${matchResult.match ? "[&>div]:bg-green-500" : "[&>div]:bg-red-500"}`}
                />
              </CardContent>
            </Card>
          )}

          {/* Embedding preview */}
          {mode === "extract" && embedding.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">ArcFace Embedding ({embedding.length}-dim)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-xs text-muted-foreground bg-muted/50 rounded p-3 overflow-x-auto">
                  [{embedding.slice(0, 8).map(v => v.toFixed(4)).join(", ")}, ...]
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  L2 norm: {Math.sqrt(embedding.reduce((s, v) => s + v * v, 0)).toFixed(4)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Landmark count */}
          {mode === "landmarks" && landmarks.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  <div>
                    <div className="font-medium">{landmarks.length} landmarks extracted</div>
                    <div className="text-xs text-muted-foreground">
                      Visualised on camera feed above
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Face detection count */}
          {mode === "detect" && faces.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Scan className="h-6 w-6 text-blue-500" />
                  <div>
                    <div className="font-medium">{faces.length} face(s) detected</div>
                    <div className="text-xs text-muted-foreground">
                      Bounding boxes shown on camera feed
                    </div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {faces.map((f, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex justify-between">
                      <span>Face {i + 1}: [{f.bbox.join(", ")}]</span>
                      <span>{Math.round(f.confidence * 100)}% confidence</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Capability legend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">System Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  "Passive liveness (single image)",
                  "Active liveness (video/motion)",
                  "Face matching (two images)",
                  "Face detection",
                  "68-point landmarks",
                  "Feature extraction (ArcFace)",
                  "Anti-spoofing classification",
                  "Confidence scoring",
                  "DB persistence",
                  "Event publishing (Kafka)",
                  "Go API gateway",
                  "Rust signal processing",
                  "Printed photo detection",
                  "Screen replay detection",
                  "Paper mask detection",
                  "3D mask detection",
                  "Deepfake detection",
                  "High-quality photo detection",
                ].map(cap => (
                  <div key={cap} className="flex items-center gap-1.5 text-xs">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    <span className="text-muted-foreground">{cap}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
