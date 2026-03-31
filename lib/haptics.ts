import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

/**
 * Haptic feedback utility for Iris Vision.
 * Every state change in the app produces a distinct haptic.
 * Platform-safe: no-ops on web.
 */
export const haptic = {
  /** Tap registered — "I heard your tap" */
  light: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  },

  /** Mode switched — "Mode changed" */
  medium: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  },

  /** Confirmation needed — "I need you to confirm" */
  heavy: () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  },

  /** Action completed successfully */
  success: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  },

  /** Something went wrong */
  error: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  },

  /** Heads up / warning */
  warning: () => {
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  },

  /** Selection change */
  selection: () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  },
};
