import { useEffect, useState } from "react";
import { TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { speak } from "@/lib/speech";
import { ScreenContainer } from "@/components/screen-container";
import { haptic } from "@/lib/haptics";
import { saveGmailToken } from "@/lib/onboarding-store";

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI;
const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || "https://iris-vision-production.up.railway.app";

export default function GmailScreen() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    // Auto-play Gmail connection prompt
    speak(
      "Let's connect your Gmail account. Tap anywhere to open Google sign-in.",
      { rate: 1.0 }
    );
  }, []);

  const handleTap = async () => {
    if (connecting) return;
    
    speak(""); // Stop current speech
    haptic.light();
    setConnecting(true);

    try {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI || "")}&response_type=code&scope=https://www.googleapis.com/auth/gmail.readonly%20https://www.googleapis.com/auth/gmail.send&access_type=offline&prompt=consent`;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        REDIRECT_URI || ""
      );

      if (result.type === "success") {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");

        if (code) {
          // Exchange code for token via backend
          const tokenResponse = await fetch(`${BACKEND_URL}/api/gmail/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });

          if (tokenResponse.ok) {
            const { accessToken } = await tokenResponse.json();
            await saveGmailToken(accessToken);
            speak("Gmail connected successfully. Moving to voice tutorial.", {
              rate: 1.0,
            });
            setTimeout(() => {
              router.push("./tutorial");
            }, 1500);
          } else {
            speak("Error connecting Gmail. Please try again.", { rate: 1.0 });
            setConnecting(false);
          }
        }
      } else {
        speak("Gmail sign-in cancelled. Please try again.", { rate: 1.0 });
        setConnecting(false);
      }
    } catch (error) {
      console.error("Error during Gmail OAuth:", error);
      speak("Error connecting to Gmail. Please try again.", { rate: 1.0 });
      setConnecting(false);
    }
  };

  return (
    <ScreenContainer
      className="bg-black"
      edges={["top", "bottom", "left", "right"]}
    >
      <TouchableOpacity
        onPress={handleTap}
        disabled={connecting}
        className="flex-1 items-center justify-center"
        activeOpacity={0.7}
      >
        <View className="items-center gap-4">
          {/* Gmail icon placeholder */}
          <View className="w-20 h-20 rounded-full bg-red-500 opacity-70" />
          <View
            accessible
            accessibilityLabel={
              connecting
                ? "Connecting Gmail. Please wait."
                : "Gmail connection screen. Tap anywhere to sign in."
            }
            accessibilityRole="button"
          />
        </View>
      </TouchableOpacity>
    </ScreenContainer>
  );
}
