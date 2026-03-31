import { Tabs } from "expo-router";

/**
 * Iris Vision uses a single-screen architecture.
 * The tab bar is hidden — all navigation is via the mode toggle button.
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Iris",
        }}
      />
    </Tabs>
  );
}
