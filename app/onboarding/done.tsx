import { useEffect } from "react";
import { TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { speak } from "@/lib/speech";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { markOnboardingComplete } from "@/lib/onboarding-store";

export default function DoneScreen() {
  const router = useRouter();

  useEffect(() => {
    // Auto-play completion message
    speak(
      "You're all set. Tap anywhere to start using Iris Vision.",
      { rate: 1.0 }
    );
  }, []);

  const handleTap = async () => {
    speak(""); // Stop current speech
    haptic.success();

    // Mark onboarding as complete
    await markOnboardingComplete();

    // Navigate to main app
    router.replace("/(tabs)");
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
          {/* Success icon placeholder */}
          <View className="w-24 h-24 rounded-full bg-green-500 opacity-70" />
          <View
            accessible
            accessibilityLabel="Onboarding complete. Tap anywhere to start."
            accessibilityRole="button"
          />
        </View>
      </TouchableOpacity>
    </ScreenContainer>
  );
}
