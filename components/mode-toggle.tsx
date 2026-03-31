import React from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { useAppState } from "@/lib/app-state";
import { haptic } from "@/lib/haptics";
import { speak, stop as stopSpeech } from "@/lib/speech";

/**
 * Mode toggle button — fixed bottom-right corner.
 * 80x80pt, always visible, always findable.
 *
 * In Voice Mode: shows "A" icon (switch to Assistant)
 * In Assistant Mode: shows mic icon (switch to Voice)
 */
export function ModeToggle() {
  const { state, toggleMode, setVoiceState } = useAppState();
  const isVoiceMode = state.mode === "voice";

  const handleToggle = async () => {
    await stopSpeech();
    haptic.medium();
    toggleMode();
    setVoiceState("idle");

    const newMode = isVoiceMode ? "Assistant Mode" : "Voice Mode";
    await speak(newMode);
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.button,
          isVoiceMode ? styles.buttonVoice : styles.buttonAssistant,
          pressed && styles.buttonPressed,
        ]}
        accessible={true}
        accessibilityLabel={`Switch to ${isVoiceMode ? "Assistant" : "Voice"} Mode`}
        accessibilityHint={`Currently in ${isVoiceMode ? "Voice" : "Assistant"} Mode. Double tap to switch.`}
        accessibilityRole="button"
      >
        {isVoiceMode ? (
          <Text style={styles.letterIcon}>A</Text>
        ) : (
          <MaterialIcons name="mic" size={32} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    bottom: 40,
    right: 20,
    zIndex: 1000,
  },
  button: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    // Shadow for findability
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonVoice: {
    backgroundColor: "#1C1C1E",
    borderColor: "rgba(255, 255, 255, 0.4)",
  },
  buttonAssistant: {
    backgroundColor: "#000000",
    borderColor: "#007AFF",
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  letterIcon: {
    fontSize: 28,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0,
  },
});
