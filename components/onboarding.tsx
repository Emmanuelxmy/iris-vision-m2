import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { useAppState } from "@/lib/app-state";
import { haptic } from "@/lib/haptics";
import { speak, speakError } from "@/lib/speech";
import { requestMicPermission, hasMicPermission } from "@/lib/audio-recorder";

type OnboardingStep =
  | "waiting_for_tap"
  | "welcome"
  | "mic_permission"
  | "how_it_works"
  | "modes"
  | "trust"
  | "ready";

const STEP_SCRIPTS: Record<string, string> = {
  welcome:
    "Welcome to Iris. I'm your voice assistant for communication. Everything in this app works by voice. You'll never need to look at the screen.",
  mic_permission:
    "First, I need permission to use your microphone so I can hear you. You should feel a system prompt appear now. Please tap Allow.",
  how_it_works:
    "Here's how this app works. The entire screen is one big button. Tap anywhere to start talking. Tap again to stop. I'll listen, understand what you want, and do it.",
  modes:
    "There's one button in the bottom right corner of your screen. It switches between two modes. Voice Mode is for your voice commands. Assistant Mode is for your sighted helper to sign in to your email and manage settings.",
  trust:
    "One important promise. I will never send a message or email without asking you to confirm first. You'll always hear what I'm about to send, and you'll say yes or send it to confirm. Your words, your control.",
  ready:
    "That's it. You're ready. Tap anywhere to start.",
};

export function Onboarding() {
  const { completeOnboarding } = useAppState();
  const [step, setStep] = useState<OnboardingStep>(
    Platform.OS === "web" ? "waiting_for_tap" : "welcome"
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasStarted = useRef(false);
  const isRunning = useRef(false);

  // Pulse animation for the iris icon
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(
      withTiming(1.2, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulseOpacity.value = withRepeat(
      withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // Auto-start onboarding on native (no user interaction needed for TTS)
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startOnboarding = async () => {
      await new Promise((r) => setTimeout(r, 1500));
      haptic.medium();
      await runSteps("welcome");
    };

    startOnboarding();
  }, []);

  const runSteps = async (startFrom: OnboardingStep) => {
    if (isRunning.current) return;
    isRunning.current = true;

    const steps: OnboardingStep[] = [
      "welcome",
      "mic_permission",
      "how_it_works",
      "modes",
      "trust",
      "ready",
    ];

    const startIndex = steps.indexOf(startFrom);
    if (startIndex === -1) {
      isRunning.current = false;
      return;
    }

    for (let i = startIndex; i < steps.length; i++) {
      const currentStep = steps[i];
      setStep(currentStep);

      if (currentStep === "mic_permission") {
        await handleMicPermission();
        continue;
      }

      if (currentStep === "ready") {
        setIsSpeaking(true);
        try {
          await speak(STEP_SCRIPTS.ready, {
            onDone: () => setIsSpeaking(false),
          });
        } catch {
          setIsSpeaking(false);
        }
        break; // Wait for user tap
      }

      const script = STEP_SCRIPTS[currentStep];
      if (script) {
        setIsSpeaking(true);
        try {
          await speak(script, {
            onDone: () => setIsSpeaking(false),
          });
        } catch {
          setIsSpeaking(false);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    isRunning.current = false;
  };

  const handleMicPermission = async () => {
    setIsSpeaking(true);
    try {
      await speak(STEP_SCRIPTS.mic_permission, {
        onDone: () => setIsSpeaking(false),
      });
    } catch {
      setIsSpeaking(false);
    }

    // On web, skip mic permission request (handled by browser natively)
    if (Platform.OS === "web") {
      await new Promise((r) => setTimeout(r, 300));
      return;
    }

    const alreadyGranted = await hasMicPermission();
    if (alreadyGranted) {
      haptic.success();
      try {
        await speak("Microphone access is already granted. I can hear you.");
      } catch {
        // Continue silently
      }
      await new Promise((r) => setTimeout(r, 300));
      return;
    }

    const granted = await requestMicPermission();
    if (granted) {
      haptic.success();
      try {
        await speak("Microphone access granted. I can hear you now.");
      } catch {
        // Continue silently
      }
    } else {
      haptic.error();
      try {
        await speak(
          "I wasn't able to get microphone access. You can grant it later in your phone's Settings app. For now, I'll continue the setup."
        );
      } catch {
        // Continue silently
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  };

  const handleTap = async () => {
    if (step === "waiting_for_tap") {
      // Web: first tap unlocks audio context
      haptic.medium();
      setStep("welcome");
      hasStarted.current = true;
      await runSteps("welcome");
      return;
    }

    if (step === "ready" && !isSpeaking) {
      haptic.success();
      completeOnboarding();
    }
  };

  const getDisplayText = () => {
    if (step === "waiting_for_tap") return "Tap anywhere to begin setup";
    if (step === "ready") return "Tap anywhere to start";
    return "Setting up...";
  };

  return (
    <Pressable
      onPress={handleTap}
      style={styles.container}
      accessible={true}
      accessibilityLabel={
        step === "waiting_for_tap"
          ? "Iris Vision. Tap anywhere to begin setup."
          : "Iris Vision setup in progress. Listen for instructions."
      }
      accessibilityRole="button"
    >
      <View style={styles.content}>
        {/* Pulsing iris icon */}
        <Animated.View style={[styles.irisContainer, pulseStyle]}>
          <View style={styles.irisOuter}>
            <View style={styles.irisInner}>
              <View style={styles.irisPupil} />
            </View>
          </View>
        </Animated.View>

        {/* Step indicator text (for residual vision) */}
        <Text style={styles.stepText}>{getDisplayText()}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    gap: 48,
  },
  irisContainer: {
    width: 160,
    height: 160,
    justifyContent: "center",
    alignItems: "center",
  },
  irisOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0, 122, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(0, 122, 255, 0.3)",
  },
  irisInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 122, 255, 0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  irisPupil: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#007AFF",
  },
  stepText: {
    fontSize: 20,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.5)",
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
