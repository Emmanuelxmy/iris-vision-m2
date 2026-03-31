import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppState } from "@/lib/app-state";
import { VoiceMode } from "@/components/voice-mode";
import { AssistantMode } from "@/components/assistant-mode";
import { ModeToggle } from "@/components/mode-toggle";
import { Onboarding } from "@/components/onboarding";

/**
 * Iris Vision — Main Screen
 *
 * This is the only screen in the app. It renders one of three states:
 * 1. Onboarding (first launch) — audio-first setup
 * 2. Voice Mode — full-screen tap target for voice commands
 * 3. Assistant Mode — sighted helper visual UI
 *
 * The mode toggle button is always visible in both Voice and Assistant modes.
 */
export default function MainScreen() {
  useKeepAwake();

  const { state } = useAppState();
  const { onboardingComplete, mode } = state;

  // If onboarding hasn't been completed, show the onboarding flow
  if (!onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <View style={styles.container}>
      {mode === "voice" ? (
        <VoiceMode />
      ) : (
        <SafeAreaView style={styles.assistantSafeArea} edges={["top", "left", "right"]}>
          <AssistantMode />
        </SafeAreaView>
      )}

      {/* Mode toggle — always visible, fixed bottom-right */}
      <ModeToggle />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  assistantSafeArea: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
});
