/**
 * Gmail OAuth flow for Iris Vision.
 *
 * This module handles the Google OAuth 2.0 flow for Gmail access.
 * The flow is initiated in Assistant Mode by a sighted helper.
 * The resulting access token is stored securely on the device.
 *
 * Token storage:
 * - iOS/Android: expo-secure-store (device keychain)
 * - Web: localStorage (for testing only)
 *
 * OAuth flow:
 * 1. Build Google authorization URL with required scopes
 * 2. Open in-app browser using expo-web-browser openAuthSessionAsync
 * 3. Google redirects back to the app with an authorization code
 * 4. Exchange code for access + refresh tokens via server
 * 5. Store tokens securely
 *
 * Required environment variables (set via webdev_request_secrets):
 * - EXPO_PUBLIC_GOOGLE_CLIENT_ID — OAuth 2.0 Client ID
 * - EXPO_PUBLIC_GOOGLE_REDIRECT_URI — Redirect URI registered in Google Console
 */

import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { Platform, Linking } from "react-native";
import Constants from "expo-constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const GMAIL_TOKEN_KEY = "iris_gmail_access_token";
const GMAIL_REFRESH_KEY = "iris_gmail_refresh_token";
const GMAIL_EMAIL_KEY = "iris_gmail_email";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Gmail scopes required for Iris Vision
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GmailAuthResult {
  success: true;
  email: string;
  accessToken: string;
}

export interface GmailAuthError {
  success: false;
  error: string;
  message: string;
}

/**
 * Get the stored Gmail access token.
 * Returns null if not connected.
 */
export async function getStoredGmailToken(): Promise<string | null> {
  return secureGet(GMAIL_TOKEN_KEY);
}

/**
 * Get the stored Gmail email address.
 */
export async function getStoredGmailEmail(): Promise<string | null> {
  return secureGet(GMAIL_EMAIL_KEY);
}

/**
 * Clear all stored Gmail credentials.
 */
export async function clearGmailCredentials(): Promise<void> {
  await Promise.all([
    secureDelete(GMAIL_TOKEN_KEY),
    secureDelete(GMAIL_REFRESH_KEY),
    secureDelete(GMAIL_EMAIL_KEY),
  ]);
}

/**
 * Start the Gmail OAuth flow.
 * This opens a browser window for the user to sign in to Google.
 * The sighted helper completes this flow in Assistant Mode.
 *
 * Returns the access token and email on success.
 */
export async function startGmailOAuth(
  clientId: string,
  redirectUri: string,
  serverApiUrl: string
): Promise<GmailAuthResult | GmailAuthError> {
  try {
    // Generate a random state for CSRF protection
    const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    // Build the authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    // Open the auth session
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type !== "success") {
      return {
        success: false,
        error: "cancelled",
        message: result.type === "cancel"
          ? "Sign-in was cancelled."
          : "Sign-in was dismissed.",
      };
    }

    // Parse the redirect URL to get the authorization code
    const redirectUrl = result.url;
    const urlParams = new URLSearchParams(redirectUrl.split("?")[1] || "");
    const code = urlParams.get("code");
    const returnedState = urlParams.get("state");
    const error = urlParams.get("error");

    if (error) {
      return {
        success: false,
        error,
        message: `Google sign-in failed: ${error}`,
      };
    }

    if (!code) {
      return {
        success: false,
        error: "no_code",
        message: "No authorization code received from Google.",
      };
    }

    if (returnedState !== state) {
      return {
        success: false,
        error: "state_mismatch",
        message: "Security check failed. Please try signing in again.",
      };
    }

    // Exchange the code for tokens via our server
    const tokenResponse = await fetch(`${serverApiUrl}/api/gmail/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, redirectUri, clientId }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      return {
        success: false,
        error: "token_exchange_failed",
        message: errorData.message || "Failed to complete sign-in. Please try again.",
      };
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, email } = tokenData;

    if (!access_token) {
      return {
        success: false,
        error: "no_token",
        message: "Sign-in succeeded but no access token was received.",
      };
    }

    // Store tokens securely
    await secureSet(GMAIL_TOKEN_KEY, access_token);
    if (refresh_token) {
      await secureSet(GMAIL_REFRESH_KEY, refresh_token);
    }
    if (email) {
      await secureSet(GMAIL_EMAIL_KEY, email);
    }

    return {
      success: true,
      email: email || "Gmail connected",
      accessToken: access_token,
    };
  } catch (error) {
    console.error("Gmail OAuth error:", error);
    return {
      success: false,
      error: "unknown",
      message: "An unexpected error occurred during sign-in. Please try again.",
    };
  }
}

/**
 * Check if Gmail is currently connected (token exists).
 */
export async function isGmailConnected(): Promise<boolean> {
  const token = await getStoredGmailToken();
  return token !== null && token.length > 0;
}
