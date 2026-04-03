import { useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { speak } from "@/lib/speech";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";

const COMMANDS = [
  "Read my emails",
  "Send an email to Sarah",
  "Find this conversation about project updates",
];

export default function TutorialScreen() {
  const router = useRouter();
  const [currentCommand, setCurrentCommand] = useState(0);
  const [tutorialStarted, setTutorialStarted] = useState(false);

  useEffect(() => {
    if (!tutorialStarted) {
      // Initial greeting
      speak(
        "Now let's learn three core voice commands. Tap anywhere to hear the first command.",
        { rate: 1.0 }
      );
      setTutorialStarted(true);
    }
  }, [tutorialStarted]);

  const handleTap = () => {
    haptic.light();

    if (currentCommand < COMMANDS.length) {
      // Play current command
      const command = COMMANDS[currentCommand];
      speak(`Try saying: ${command}`, { rate: 1.0 });

      // Move to next command after speech
      setTimeout(() => {
        if (currentCommand < COMMANDS.length - 1) {
          speak("Tap anywhere for the next command.", { rate: 1.0 });
          setCurrentCommand(currentCommand + 1);
        } else {
          // All commands shown, move to done screen
          speak("You've learned all three commands. Tap anywhere to continue.", {
            rate: 1.0,
          });
          setTimeout(() => {
            router.push("./done");
          }, 2000);
        }
      }, 2500);
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
          {/* Microphone/voice icon placeholder */}
          <View className="w-20 h-20 rounded-full bg-purple-500 opacity-70" />
          <View
            accessible
            accessibilityLabel={`Voice tutorial. Command ${currentCommand + 1} of ${COMMANDS.length}. Tap anywhere to continue.`}
            accessibilityRole="button"
          />
        </View>
      </TouchableOpacity>
    </ScreenContainer>
  );
}
