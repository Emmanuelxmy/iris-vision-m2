import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="microphone" />
      <Stack.Screen name="gmail" />
      <Stack.Screen name="tutorial" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
