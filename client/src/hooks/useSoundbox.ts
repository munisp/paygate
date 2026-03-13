/**
 * useSoundbox — Web Audio API Soundbox simulation for PayGate POS Terminals
 *
 * Nigerian Soundbox audio confirmation in 4 languages:
 *   English  — "Payment received"
 *   Yoruba   — "Owo ti gba"
 *   Hausa    — "An karɓi kuɗi"
 *   Igbo     — "Ego enwetara"
 *
 * Tones:
 *   payment  — two ascending beeps (success chime, 880 Hz → 1320 Hz)
 *   error    — descending buzz (400 Hz → 220 Hz)
 *   heartbeat — single soft ping (660 Hz, short)
 *   card_auth — triple beep (1047 Hz × 3)
 */

import { useRef, useCallback, useState } from "react";

export type SoundboxLanguage = "en" | "yo" | "ha" | "ig";
export type SoundboxEventType = "payment" | "error" | "heartbeat" | "card_auth";

const CONFIRMATION_MESSAGES: Record<SoundboxLanguage, Record<string, string>> = {
  en: {
    payment: "Payment received",
    error: "Transaction failed",
    heartbeat: "Terminal online",
    card_auth: "Card authorised",
  },
  yo: {
    payment: "Owo ti gba",
    error: "Isowo kuna",
    heartbeat: "Ẹrọ wa lori ayelujara",
    card_auth: "Kaadi fọwọsi",
  },
  ha: {
    payment: "An karɓi kuɗi",
    error: "Ma'amala ta kasa",
    heartbeat: "Na'ura tana kan layi",
    card_auth: "Katin ya amince",
  },
  ig: {
    payment: "Ego enwetara",
    error: "Azụmahịa dara ada",
    heartbeat: "Ngwaọrụ dị n'ịntanetị",
    card_auth: "Kaadị kwenyere",
  },
};

interface ToneSpec {
  frequency: number;
  duration: number; // ms
  type: OscillatorType;
  gain: number;
}

const TONE_SEQUENCES: Record<SoundboxEventType, ToneSpec[]> = {
  payment: [
    { frequency: 880, duration: 120, type: "sine", gain: 0.4 },
    { frequency: 1320, duration: 200, type: "sine", gain: 0.5 },
  ],
  error: [
    { frequency: 400, duration: 150, type: "sawtooth", gain: 0.3 },
    { frequency: 220, duration: 250, type: "sawtooth", gain: 0.25 },
  ],
  heartbeat: [
    { frequency: 660, duration: 80, type: "sine", gain: 0.2 },
  ],
  card_auth: [
    { frequency: 1047, duration: 80, type: "sine", gain: 0.35 },
    { frequency: 1047, duration: 80, type: "sine", gain: 0.35 },
    { frequency: 1047, duration: 120, type: "sine", gain: 0.4 },
  ],
};

export interface SoundboxConfirmation {
  eventType: SoundboxEventType;
  language: SoundboxLanguage;
  message: string;
  amountNGN?: string;
  terminalLabel?: string;
  ts: number;
}

export function useSoundbox(defaultLanguage: SoundboxLanguage = "en") {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const [confirmation, setConfirmation] = useState<SoundboxConfirmation | null>(null);
  const confirmationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playTone = useCallback(
    (spec: ToneSpec, startTime: number, ctx: AudioContext) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.type = spec.type;
      osc.frequency.setValueAtTime(spec.frequency, startTime);

      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(spec.gain, startTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, startTime + spec.duration / 1000);

      osc.start(startTime);
      osc.stop(startTime + spec.duration / 1000 + 0.05);
    },
    []
  );

  const play = useCallback(
    (
      eventType: SoundboxEventType,
      opts?: {
        language?: SoundboxLanguage;
        amountKobo?: number;
        terminalLabel?: string;
      }
    ) => {
      const lang = opts?.language ?? defaultLanguage;
      const tones = TONE_SEQUENCES[eventType];

      // Show confirmation overlay regardless of mute
      const msg = CONFIRMATION_MESSAGES[lang]?.[eventType] ?? CONFIRMATION_MESSAGES.en[eventType];
      const amountNGN =
        opts?.amountKobo != null
          ? new Intl.NumberFormat("en-NG", {
              style: "currency",
              currency: "NGN",
              minimumFractionDigits: 0,
            }).format(opts.amountKobo / 100)
          : undefined;

      if (confirmationTimerRef.current) clearTimeout(confirmationTimerRef.current);
      setConfirmation({
        eventType,
        language: lang,
        message: msg,
        amountNGN,
        terminalLabel: opts?.terminalLabel,
        ts: Date.now(),
      });
      confirmationTimerRef.current = setTimeout(() => setConfirmation(null), 3500);

      if (muted) return;

      try {
        const ctx = getAudioCtx();
        let offset = ctx.currentTime + 0.05;
        for (const tone of tones) {
          playTone(tone, offset, ctx);
          offset += tone.duration / 1000 + 0.04; // 40ms gap between tones
        }
      } catch {
        // AudioContext not available (e.g., test environment) — silently skip
      }
    },
    [muted, defaultLanguage, getAudioCtx, playTone]
  );

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  return { play, muted, toggleMute, confirmation };
}
