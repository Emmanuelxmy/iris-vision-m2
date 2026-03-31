import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SPEECH_RATE_KEY = "iris_speech_rate";
const SPEECH_VOICE_KEY = "iris_speech_voice";

let currentRate = 1.0;
let currentVoice: string | undefined;
let isInitialized = false;

/**
 * TTS utility for Iris Vision.
 * All app output goes through this module.
 * Uses native device TTS for zero-latency speech.
 * Falls back to Web Speech API on web platform.
 */

async function ensureInitialized() {
  if (isInitialized) return;
  try {
    const savedRate = await AsyncStorage.getItem(SPEECH_RATE_KEY);
    if (savedRate) currentRate = parseFloat(savedRate);
    const savedVoice = await AsyncStorage.getItem(SPEECH_VOICE_KEY);
    if (savedVoice) currentVoice = savedVoice;
  } catch {
    // Defaults are fine
  }
  isInitialized = true;
}

// ─── Web Speech API Fallback ────────────────────────────────────────────────

function webSpeak(
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    onDone?: () => void;
    onError?: (error: Error) => void;
    onStart?: () => void;
  }
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      console.warn("[Speech] Web Speech API not available");
      options?.onDone?.();
      resolve();
      return;
    }

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options?.rate ?? currentRate;
    utterance.pitch = options?.pitch ?? 1.0;
    utterance.lang = "en-US";

    // Try to set voice if specified
    if (currentVoice) {
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.voiceURI === currentVoice);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      options?.onStart?.();
    };

    utterance.onend = () => {
      options?.onDone?.();
      resolve();
    };

    utterance.onerror = (event) => {
      // "interrupted" and "canceled" are not real errors
      if (event.error === "interrupted" || event.error === "canceled") {
        options?.onDone?.();
        resolve();
        return;
      }
      const error = new Error(`Speech error: ${event.error}`);
      options?.onError?.(error);
      reject(error);
    };

    window.speechSynthesis.speak(utterance);
  });
}

function webStop(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function webIsSpeaking(): boolean {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

// ─── Native Speech (expo-speech) ────────────────────────────────────────────

let Speech: typeof import("expo-speech") | null = null;

async function getNativeSpeech() {
  if (!Speech) {
    Speech = await import("expo-speech");
  }
  return Speech;
}

function nativeSpeak(
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    onDone?: () => void;
    onError?: (error: Error) => void;
    onStart?: () => void;
  }
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    try {
      const speech = await getNativeSpeech();
      await speech.stop();

      speech.speak(text, {
        rate: options?.rate ?? currentRate,
        pitch: options?.pitch ?? 1.0,
        voice: currentVoice,
        language: "en-US",
        onStart: () => {
          options?.onStart?.();
        },
        onDone: () => {
          options?.onDone?.();
          resolve();
        },
        onError: (error: Error) => {
          options?.onError?.(error);
          reject(error);
        },
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      options?.onError?.(err);
      reject(err);
    }
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Speak text aloud. Returns a promise that resolves when speech finishes. */
export async function speak(
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    onDone?: () => void;
    onError?: (error: Error) => void;
    onStart?: () => void;
  }
): Promise<void> {
  await ensureInitialized();

  if (Platform.OS === "web") {
    return webSpeak(text, options);
  }
  return nativeSpeak(text, options);
}

/** Stop all current and queued speech immediately. */
export async function stop(): Promise<void> {
  if (Platform.OS === "web") {
    webStop();
    return;
  }
  const speech = await getNativeSpeech();
  await speech.stop();
}

/** Check if speech is currently in progress. */
export async function isSpeaking(): Promise<boolean> {
  if (Platform.OS === "web") {
    return webIsSpeaking();
  }
  const speech = await getNativeSpeech();
  return speech.isSpeakingAsync();
}

/** Set the speech rate (0.5 to 2.0). Persists to AsyncStorage. */
export async function setRate(rate: number): Promise<void> {
  currentRate = Math.max(0.5, Math.min(2.0, rate));
  await AsyncStorage.setItem(SPEECH_RATE_KEY, currentRate.toString());
}

/** Get the current speech rate. */
export function getRate(): number {
  return currentRate;
}

/** Increase speech rate by 0.25. */
export async function speedUp(): Promise<void> {
  await setRate(currentRate + 0.25);
}

/** Decrease speech rate by 0.25. */
export async function slowDown(): Promise<void> {
  await setRate(currentRate - 0.25);
}

/** Set the voice identifier. Persists to AsyncStorage. */
export async function setVoice(voiceId: string): Promise<void> {
  currentVoice = voiceId;
  await AsyncStorage.setItem(SPEECH_VOICE_KEY, voiceId);
}

/** Get available voices. */
export async function getVoices(): Promise<{ identifier: string; name: string; language: string }[]> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    const voices = window.speechSynthesis.getVoices();
    return voices.map((v) => ({
      identifier: v.voiceURI,
      name: v.name,
      language: v.lang,
    }));
  }
  const speech = await getNativeSpeech();
  const voices = await speech.getAvailableVoicesAsync();
  return voices.map((v) => ({
    identifier: v.identifier,
    name: v.name,
    language: v.language,
  }));
}

/**
 * Speak an error message. Always includes the spoken_message pattern.
 * This is the ONLY way errors should be communicated to the user.
 */
export async function speakError(spokenMessage: string): Promise<void> {
  await speak(spokenMessage, { rate: Math.min(currentRate, 1.0) });
}

/**
 * Speak a success confirmation.
 */
export async function speakSuccess(message: string): Promise<void> {
  await speak(message);
}
