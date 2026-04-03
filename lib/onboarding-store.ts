import * as SecureStore from "expo-secure-store";

const ONBOARDING_COMPLETE_KEY = "iris_onboarding_complete";
const GMAIL_TOKEN_KEY = "iris_gmail_token";

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(ONBOARDING_COMPLETE_KEY);
    return value === "true";
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_COMPLETE_KEY, "true");
  } catch (error) {
    console.error("Error marking onboarding complete:", error);
  }
}

export async function saveGmailToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(GMAIL_TOKEN_KEY, token);
  } catch (error) {
    console.error("Error saving Gmail token:", error);
  }
}

export async function getGmailToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(GMAIL_TOKEN_KEY);
  } catch (error) {
    console.error("Error retrieving Gmail token:", error);
    return null;
  }
}

export async function clearOnboarding(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ONBOARDING_COMPLETE_KEY);
    await SecureStore.deleteItemAsync(GMAIL_TOKEN_KEY);
  } catch (error) {
    console.error("Error clearing onboarding:", error);
  }
}
