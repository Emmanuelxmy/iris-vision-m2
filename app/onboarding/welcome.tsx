import { useEffect } from "react";
import { TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { speak } from "@/lib/speech";
import { ScreenContainer } from "@/components/screen-container";

export default function WelcomeScreen() {
  const router = useRouter();

  useEffect(() => {
    // Auto-play welcome message on mount
    speak("Welcome to Iris Vision. I'll be your voice assistant for email.", {
      rate: 1.0,
    });
  }, []);

  const handleTap = () => {
    speak(""); // Stop current speech
    router.push("./microphone");
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
          {/* Iris icon placeholder */}
          <View className="w-24 h-24 rounded-full bg-blue-500 opacity-70" />
          <View className="text-center">
            {/* Accessibility label */}
            <View
              accessible
              accessibilityLabel="Welcome screen. Tap anywhere to continue."
              accessibilityRole="button"
            />
          </View>
        </View>
      </TouchableOpacity>
    </ScreenContainer>
  );
}
