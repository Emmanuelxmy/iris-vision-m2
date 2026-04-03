import { useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import * as MediaLibrary from "expo-media-library";
import { speak } from "@/lib/speech";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";

export default function MicrophoneScreen() {
  const router = useRouter();
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    // Auto-play microphone permission prompt
    speak(
      "I need microphone access to hear your commands. Tap anywhere to grant permission.",
      { rate: 1.0 }
    );
  }, []);

  const handleTap = async () => {
    speak(""); // Stop current speech
    haptic.light();

    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === "granted") {
        setPermissionGranted(true);
        speak("Microphone access granted. Continuing to Gmail setup.", {
          rate: 1.0,
        });
        setTimeout(() => {
          router.push("./gmail");
        }, 1500);
      } else {
        speak("Permission denied. Please try again.", { rate: 1.0 });
      }
    } catch (error) {
      console.error("Error requesting microphone permission:", error);
      speak("Error requesting permission. Please try again.", { rate: 1.0 });
    }
  };

  return (
    <ScreenContainer
      className="bg-black"
      edges={["top", "bottom", "left", "right"]}
    >
      <TouchableOpacity
        onPress={handleTap}
        className="flex-1 items-center justify-center"
        activeOpacity={0.7}
      >
        <View className="items-center gap-4">
          {/* Microphone icon placeholder */}
          <View className="w-20 h-20 rounded-full bg-blue-400 opacity-70" />
          <View
            accessible
            accessibilityLabel="Microphone permission screen. Tap anywhere to grant access."
            accessibilityRole="button"
          />
        </View>
      </TouchableOpacity>
    </ScreenContainer>
  );
}
