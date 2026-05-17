/**
 * LivenessCamera — React Native liveness detection widget
 *
 * Modes:
 *  - passive: captures a single frame and sends to /api/trpc checkLiveness (no user action needed)
 *  - active:  presents a random challenge (blink / nod / smile / turn_left / turn_right)
 *             and verifies the user performed it
 *  - full:    passive first, escalates to active if passive score < threshold
 *
 * Usage:
 *   <LivenessCamera
 *     mode="full"
 *     onSuccess={(score) => console.log("Liveness verified", score)}
 *     onFailure={(reason) => console.log("Failed", reason)}
 *     onCancel={() => navigation.goBack()}
 *   />
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { trpc } from "../lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────
export type LivenessMode = "passive" | "active" | "full";
export type ChallengeType = "blink" | "nod" | "smile" | "turn_left" | "turn_right";

interface LivenessCameraProps {
  mode?: LivenessMode;
  passiveThreshold?: number;   // 0–1, escalate to active if below this (default 0.7)
  onSuccess: (score: number, sessionId?: string) => void;
  onFailure: (reason: string) => void;
  onCancel: () => void;
  submissionId?: string;       // KYC submission ID to attach result to
}

type Phase =
  | "requesting_permission"
  | "ready"
  | "capturing"
  | "analyzing"
  | "challenge_shown"
  | "challenge_capturing"
  | "challenge_analyzing"
  | "success"
  | "failed";

const CHALLENGES: ChallengeType[] = ["blink", "nod", "smile", "turn_left", "turn_right"];
const CHALLENGE_LABELS: Record<ChallengeType, string> = {
  blink: "Blink your eyes slowly",
  nod: "Nod your head up and down",
  smile: "Smile naturally",
  turn_left: "Turn your head slightly to the left",
  turn_right: "Turn your head slightly to the right",
};
const CHALLENGE_ICONS: Record<ChallengeType, string> = {
  blink: "👁",
  nod: "↕️",
  smile: "😊",
  turn_left: "⬅️",
  turn_right: "➡️",
};

const { width: SCREEN_W } = Dimensions.get("window");
const OVAL_W = SCREEN_W * 0.72;
const OVAL_H = OVAL_W * 1.35;

// ─── Component ────────────────────────────────────────────────────────────────
export default function LivenessCamera({
  mode = "full",
  passiveThreshold = 0.7,
  onSuccess,
  onFailure,
  onCancel,
  submissionId,
}: LivenessCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [phase, setPhase] = useState<Phase>("requesting_permission");
  const [challenge, setChallenge] = useState<ChallengeType | null>(null);
  const [passiveScore, setPassiveScore] = useState<number | null>(null);
  const [finalScore, setFinalScore] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const MAX_ATTEMPTS = 3;

  // Animated values
  const ovalBorderAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const checkLiveness = trpc.complianceKyc.checkLiveness.useMutation();

  // ── Request camera permission on mount ────────────────────────────────────
  useEffect(() => {
    if (!permission) return;
    if (permission.granted) {
      setPhase("ready");
    } else if (!permission.canAskAgain) {
      setErrorMsg("Camera permission denied. Please enable it in Settings.");
      setPhase("failed");
    } else {
      requestPermission().then((result) => {
        if (result.granted) setPhase("ready");
        else { setErrorMsg("Camera permission is required for liveness check."); setPhase("failed"); }
      });
    }
  }, [permission]);

  // ── Pulse animation while capturing ───────────────────────────────────────
  useEffect(() => {
    if (phase === "capturing" || phase === "challenge_capturing") {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [phase]);

  // ── Oval border color animation ────────────────────────────────────────────
  useEffect(() => {
    const color = phase === "success" ? 1 : phase === "failed" ? -1 : 0;
    Animated.timing(ovalBorderAnim, { toValue: color, duration: 400, useNativeDriver: false }).start();
  }, [phase]);

  const ovalBorderColor = ovalBorderAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ["#ef4444", "#f59e0b", "#22c55e"],
  });

  // ── Capture a single frame as base64 ─────────────────────────────────────
  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (!cameraRef.current) return null;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: true,
      });
      return photo?.base64 ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Capture multiple frames for noise-tolerant ensemble scoring ───────────
  const captureMultipleFrames = useCallback(async (count = 3, intervalMs = 200): Promise<string[]> => {
    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      const frame = await captureFrame();
      if (frame) frames.push(frame);
      if (i < count - 1) await new Promise(r => setTimeout(r, intervalMs));
    }
    return frames;
  }, [captureFrame]);

  // ── Estimate camera noise level from pixel variance ───────────────────────
  // Returns 'low' | 'medium' | 'high' based on how many frames differ significantly
  const estimateNoiseLevel = useCallback(async (): Promise<'low' | 'medium' | 'high'> => {
    // Capture 2 quick frames and compare their sizes as a proxy for motion/noise
    const f1 = await captureFrame();
    await new Promise(r => setTimeout(r, 100));
    const f2 = await captureFrame();
    if (!f1 || !f2) return 'medium';
    // Base64 length difference as a rough noise proxy
    const sizeDiff = Math.abs(f1.length - f2.length) / Math.max(f1.length, f2.length);
    if (sizeDiff > 0.15) return 'high';
    if (sizeDiff > 0.05) return 'medium';
    return 'low';
  }, [captureFrame]);

  // ── Run passive liveness check ─────────────────────────────────────────────
  const runPassive = useCallback(async () => {
    setPhase("capturing");
    // Extended stabilisation (1500ms) to let noisy cameras settle
    await new Promise((r) => setTimeout(r, 1500));
    // Estimate device noise level before capturing
    const noiseLevel = await estimateNoiseLevel();
    // Capture 3-5 frames depending on noise level
    const frameCount = noiseLevel === 'high' ? 5 : noiseLevel === 'medium' ? 4 : 3;
    const frames = await captureMultipleFrames(frameCount, 200);
    if (frames.length === 0) { setErrorMsg("Could not capture image. Please try again."); setPhase("ready"); return; }

    setPhase("analyzing");
    try {
      const result = await checkLiveness.mutateAsync({
        submissionId: submissionId ?? "standalone",
        mode: "passive",
        frameBase64: frames[0],
        multiFrameB64: frames,
        qualityHint: { noiseLevel },
      });
      const score = result?.liveness_score ?? result?.score ?? 0;
      setPassiveScore(score);

      if (mode === "passive" || (mode === "full" && score >= passiveThreshold)) {
        // Passed
        setFinalScore(score);
        setPhase("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => onSuccess(score, result?.session_id), 1200);
      } else if (mode === "full" || mode === "active") {
        // Escalate to active challenge
        const randomChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
        setChallenge(randomChallenge);
        setPhase("challenge_shown");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        setFinalScore(score);
        setPhase("failed");
        setErrorMsg(`Liveness score too low (${Math.round(score * 100)}%). Please try again in better lighting.`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Liveness check failed. Please try again.");
      setPhase("ready");
    }
  }, [mode, passiveThreshold, submissionId, captureMultipleFrames, estimateNoiseLevel, checkLiveness, onSuccess]);

  // ── Run active challenge check ─────────────────────────────────────────────
  const runActiveChallenge = useCallback(async () => {
    if (!challenge) return;
    setPhase("challenge_capturing");
    // Extended wait (2000ms) for noisy cameras — gives user time to complete challenge
    await new Promise((r) => setTimeout(r, 2000));
    // Capture 3 challenge frames 200ms apart
    const challengeFrames = await captureMultipleFrames(3, 200);
    if (challengeFrames.length === 0) { setErrorMsg("Could not capture image."); setPhase("challenge_shown"); return; }

    setPhase("challenge_analyzing");
    try {
      const noiseLevel = await estimateNoiseLevel();
      const result = await checkLiveness.mutateAsync({
        submissionId: submissionId ?? "standalone",
        mode: "active",
        frameBase64: challengeFrames[0],
        challengeFramesBase64: challengeFrames,
        multiFrameB64: challengeFrames,
        challenge,
      });
      const score = result?.liveness_score ?? result?.score ?? 0;
      setFinalScore(score);

      if (score >= 0.6 || result?.challenge_passed) {
        setPhase("success");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => onSuccess(score, result?.session_id), 1200);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= MAX_ATTEMPTS) {
          setPhase("failed");
          setErrorMsg("Maximum attempts reached. Please contact support.");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setTimeout(() => onFailure("max_attempts_exceeded"), 1500);
        } else {
          setErrorMsg(`Challenge not detected. ${MAX_ATTEMPTS - newAttempts} attempt(s) remaining.`);
          const nextChallenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
          setChallenge(nextChallenge);
          setPhase("challenge_shown");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Challenge verification failed.");
      setPhase("challenge_shown");
    }
  }, [challenge, attempts, submissionId, captureMultipleFrames, estimateNoiseLevel, checkLiveness, onSuccess, onFailure]);

  // ── Confidence bar ─────────────────────────────────────────────────────────
  const score = finalScore ?? passiveScore ?? 0;
  const scorePct = Math.round(score * 100);
  const scoreColor = scorePct >= 80 ? "#22c55e" : scorePct >= 60 ? "#f59e0b" : "#ef4444";

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!permission || phase === "requesting_permission") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#f59e0b" />
        <Text style={styles.subText}>Requesting camera access…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera feed */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={"front" as CameraType}
      />

      {/* Dark overlay with oval cutout */}
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <Animated.View
            style={[
              styles.ovalBorder,
              {
                width: OVAL_W,
                height: OVAL_H,
                borderColor: ovalBorderColor,
                transform: [{ scale: pulseAnim }],
              },
            ]}
          />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Liveness Check</Text>
        <View style={{ width: 64 }} />
      </View>

      {/* Instruction / Status */}
      <View style={styles.instructionBox}>
        {phase === "ready" && (
          <Text style={styles.instruction}>Position your face in the oval and tap Start</Text>
        )}
        {(phase === "capturing" || phase === "challenge_capturing") && (
          <Text style={styles.instruction}>Hold still…</Text>
        )}
        {(phase === "analyzing" || phase === "challenge_analyzing") && (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#f59e0b" />
            <Text style={[styles.instruction, { marginLeft: 8 }]}>Analyzing…</Text>
          </View>
        )}
        {phase === "challenge_shown" && challenge && (
          <View style={styles.challengeBox}>
            <Text style={styles.challengeIcon}>{CHALLENGE_ICONS[challenge]}</Text>
            <Text style={styles.challengeLabel}>{CHALLENGE_LABELS[challenge]}</Text>
            {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
          </View>
        )}
        {phase === "success" && (
          <View style={styles.row}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={[styles.instruction, { color: "#22c55e" }]}>Liveness verified!</Text>
          </View>
        )}
        {phase === "failed" && (
          <Text style={[styles.instruction, { color: "#ef4444" }]}>{errorMsg ?? "Verification failed"}</Text>
        )}
      </View>

      {/* Confidence bar (shown after first analysis) */}
      {(passiveScore !== null || finalScore !== null) && (
        <View style={styles.confidenceContainer}>
          <View style={styles.confidenceRow}>
            <Text style={styles.confidenceLabel}>Liveness Score</Text>
            <Text style={[styles.confidenceValue, { color: scoreColor }]}>{scorePct}%</Text>
          </View>
          <View style={styles.confidenceTrack}>
            <Animated.View style={[styles.confidenceFill, { width: `${scorePct}%` as any, backgroundColor: scoreColor }]} />
          </View>
          <Text style={styles.confidenceHint}>
            {scorePct >= 80 ? "High confidence" : scorePct >= 60 ? "Medium — challenge required" : "Low — retrying"}
          </Text>
        </View>
      )}

      {/* CTA Button */}
      <View style={styles.ctaContainer}>
        {phase === "ready" && (
          <TouchableOpacity style={styles.primaryBtn} onPress={runPassive}>
            <Text style={styles.primaryBtnText}>Start Liveness Check</Text>
          </TouchableOpacity>
        )}
        {phase === "challenge_shown" && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: "#3b82f6" }]} onPress={runActiveChallenge}>
            <Text style={styles.primaryBtnText}>I'm Ready — Capture</Text>
          </TouchableOpacity>
        )}
        {phase === "failed" && attempts < MAX_ATTEMPTS && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: "#6b7280" }]} onPress={() => { setPhase("ready"); setErrorMsg(null); setPassiveScore(null); setFinalScore(null); }}>
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Attempt counter */}
      {attempts > 0 && phase !== "success" && (
        <Text style={styles.attemptText}>Attempt {attempts} of {MAX_ATTEMPTS}</Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f0f0f" },
  subText: { color: "#9ca3af", marginTop: 12, fontSize: 14 },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  overlayMiddle: { flexDirection: "row", height: OVAL_H },
  overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  ovalBorder: {
    borderRadius: 999,
    borderWidth: 3,
    borderStyle: "solid",
  },

  // Header
  header: {
    position: "absolute",
    top: Platform.OS === "ios" ? 56 : 24,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  cancelText: { color: "#f59e0b", fontSize: 15, fontWeight: "600" },
  title: { color: "#fff", fontSize: 17, fontWeight: "700" },

  // Instruction
  instructionBox: {
    position: "absolute",
    bottom: 260,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  instruction: { color: "#fff", fontSize: 16, textAlign: "center", fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center" },
  challengeBox: { alignItems: "center", gap: 8 },
  challengeIcon: { fontSize: 36 },
  challengeLabel: { color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center" },
  errorText: { color: "#fbbf24", fontSize: 13, textAlign: "center", marginTop: 4 },
  successIcon: { fontSize: 22, marginRight: 8 },

  // Confidence bar
  confidenceContainer: {
    position: "absolute",
    bottom: 180,
    left: 32,
    right: 32,
  },
  confidenceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  confidenceLabel: { color: "#9ca3af", fontSize: 12 },
  confidenceValue: { fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  confidenceTrack: { height: 6, backgroundColor: "#374151", borderRadius: 3, overflow: "hidden" },
  confidenceFill: { height: 6, borderRadius: 3 },
  confidenceHint: { color: "#6b7280", fontSize: 11, marginTop: 4, textAlign: "right" },

  // CTA
  ctaContainer: {
    position: "absolute",
    bottom: 60,
    left: 32,
    right: 32,
  },
  primaryBtn: {
    backgroundColor: "#f59e0b",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#000", fontSize: 16, fontWeight: "700" },

  // Attempt counter
  attemptText: {
    position: "absolute",
    bottom: 32,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "#6b7280",
    fontSize: 12,
  },
});
