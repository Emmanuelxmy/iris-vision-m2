import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Slider from "@react-native-community/slider";
import Constants from "expo-constants";

import { useAppState } from "@/lib/app-state";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";
import { speak, setRate, getRate } from "@/lib/speech";
import { haptic } from "@/lib/haptics";
import {
  startGmailOAuth,
  getStoredGmailEmail,
  clearGmailCredentials,
  isGmailConnected,
} from "@/lib/gmail-auth";
import { trpc } from "@/lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

// These are set via webdev_request_secrets as EXPO_PUBLIC_ vars
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";

// The redirect URI must match exactly what's registered in Google Cloud Console.
// For deployed apps: use EXPO_PUBLIC_GOOGLE_REDIRECT_URI env var (set to your Railway URL + /api/gmail/callback)
// For native apps: use the app scheme (manus20260315140830://oauth)
function getRedirectUri(): string {
  // If an explicit redirect URI is set (e.g. for Railway deployment), use it
  const envRedirect = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI;
  if (envRedirect) return envRedirect;
  // Otherwise use the app scheme for native OAuth
  const scheme = Constants.expoConfig?.scheme;
  if (Array.isArray(scheme)) return `${scheme[0]}://oauth`;
  if (typeof scheme === "string") return `${scheme}://oauth`;
  return "manus20260315140830://oauth";
}

// Server API base URL — uses EXPO_PUBLIC_API_URL for deployed builds (Railway URL)
function getServerApiUrl(): string {
  if (Platform.OS === "web") {
    return window.location.origin;
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  return apiUrl;
}

/**
 * Assistant Mode — a visual UI for sighted helpers.
 *
 * This is where a family member, carer, or rehab worker can:
 * 1. Connect the blind user's Gmail account
 * 2. Sign in to an Iris account (optional — for cloud sync)
 * 3. Configure voice settings (speech rate)
 * 4. View privacy/about info
 *
 * The blind user never needs to see this screen.
 * The toggle button (bottom-right) switches back to Voice Mode.
 */
export function AssistantMode() {
  const { state, setAccountConnected, setSpeechRate, setEmailConnected } = useAppState();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const [speechRateLocal, setSpeechRateLocal] = useState(state.speechRate);
  const [testingSpeech, setTestingSpeech] = useState(false);

  // Gmail state
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailConnected, setGmailConnectedLocal] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  const verifyTokenMutation = trpc.gmail.verifyToken.useMutation();

  // Load Gmail connection status on mount
  useEffect(() => {
    (async () => {
      const connected = await isGmailConnected();
      if (connected) {
        const email = await getStoredGmailEmail();
        setGmailConnectedLocal(true);
        setGmailEmail(email);
        setEmailConnected(true);
      }
    })();
  }, [setEmailConnected]);

  // Sync account connected state
  useEffect(() => {
    if (isAuthenticated && !state.accountConnected) {
      setAccountConnected(true);
    }
  }, [isAuthenticated, state.accountConnected, setAccountConnected]);

  // ─── Gmail OAuth ──────────────────────────────────────────────────────────

  const handleConnectGmail = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) {
      setGmailError(
        "Google Client ID is not configured. Please ask your developer to set EXPO_PUBLIC_GOOGLE_CLIENT_ID."
      );
      return;
    }

    setGmailLoading(true);
    setGmailError(null);
    haptic.light();

    try {
      const redirectUri = getRedirectUri();
      const serverApiUrl = getServerApiUrl();

      const result = await startGmailOAuth(GOOGLE_CLIENT_ID, redirectUri, serverApiUrl);

      if (!result.success) {
        setGmailError(result.message);
        haptic.error();
        setGmailLoading(false);
        return;
      }

      // Verify the token works
      const verifyResult = await verifyTokenMutation.mutateAsync({
        accessToken: result.accessToken,
      });

      if (!verifyResult.success) {
        setGmailError("Gmail connected but token verification failed. Please try again.");
        haptic.error();
        setGmailLoading(false);
        return;
      }

      setGmailConnectedLocal(true);
      setGmailEmail(result.email);
      setEmailConnected(true);
      haptic.success();
    } catch (error) {
      console.error("Gmail connect error:", error);
      setGmailError("An unexpected error occurred. Please try again.");
      haptic.error();
    } finally {
      setGmailLoading(false);
    }
  }, [verifyTokenMutation, setEmailConnected]);

  const handleDisconnectGmail = useCallback(async () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm(
        "Disconnect Gmail? The blind user will no longer be able to read or send emails by voice."
      );
      if (!confirmed) return;
    } else {
      // On native, use Alert
      await new Promise<void>((resolve, reject) => {
        Alert.alert(
          "Disconnect Gmail",
          "The blind user will no longer be able to read or send emails by voice.",
          [
            { text: "Cancel", style: "cancel", onPress: () => reject() },
            { text: "Disconnect", style: "destructive", onPress: () => resolve() },
          ]
        );
      }).catch(() => null);
    }

    haptic.light();
    await clearGmailCredentials();
    setGmailConnectedLocal(false);
    setGmailEmail(null);
    setEmailConnected(false);
  }, [setEmailConnected]);

  // ─── Account ──────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    haptic.light();
    try {
      await startOAuthLogin();
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    haptic.light();
    try {
      await logout();
      setAccountConnected(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // ─── Voice Settings ───────────────────────────────────────────────────────

  const handleSpeechRateChange = (value: number) => {
    const rounded = Math.round(value * 4) / 4;
    setSpeechRateLocal(rounded);
  };

  const handleSpeechRateComplete = async (value: number) => {
    const rounded = Math.round(value * 4) / 4;
    setSpeechRate(rounded);
    await setRate(rounded);
    haptic.light();
  };

  const handleTestSpeech = async () => {
    setTestingSpeech(true);
    haptic.light();
    await speak(
      "This is how I'll sound at this speed. You can adjust the slider to make me faster or slower.",
      { rate: speechRateLocal }
    );
    setTestingSpeech(false);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="settings" size={24} color="#8E8E93" />
          <Text style={styles.headerTitle}>Assistant Setup</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          This screen is for a sighted helper. Set up Gmail and voice settings for the blind user.
          Tap the button in the bottom-right corner to return to Voice Mode.
        </Text>

        {/* ── Gmail Section ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="email" size={20} color="#EA4335" />
            <Text style={styles.sectionTitle}>Gmail</Text>
            <View style={[styles.badge, gmailConnected ? styles.badgeGreen : styles.badgeGrey]}>
              <Text style={styles.badgeText}>{gmailConnected ? "Connected" : "Not connected"}</Text>
            </View>
          </View>

          <View style={styles.card}>
            {gmailConnected ? (
              <>
                <View style={styles.connectedRow}>
                  <MaterialIcons name="check-circle" size={28} color="#34C759" />
                  <View style={styles.connectedText}>
                    <Text style={styles.connectedTitle}>Gmail connected</Text>
                    {gmailEmail && (
                      <Text style={styles.connectedEmail}>{gmailEmail}</Text>
                    )}
                  </View>
                </View>

                <Text style={styles.cardDescription}>
                  The blind user can now say "read my emails", "send an email to Sarah", or "reply
                  to that" in Voice Mode.
                </Text>

                <View style={styles.commandList}>
                  <CommandHint icon="inbox" text="Read my emails" />
                  <CommandHint icon="mail" text="Read the first email" />
                  <CommandHint icon="reply" text="Reply to that" />
                  <CommandHint icon="send" text="Send an email to [name]" />
                  <CommandHint icon="skip-next" text="Next email" />
                </View>

                <Pressable
                  onPress={handleDisconnectGmail}
                  style={({ pressed }) => [
                    styles.dangerButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <MaterialIcons name="link-off" size={18} color="#FF3B30" />
                  <Text style={styles.dangerButtonText}>Disconnect Gmail</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardDescription}>
                  Connect Gmail so the blind user can read and send emails entirely by voice.
                  You'll sign in to Google — the app only stores the access token on this device.
                </Text>

                {gmailError && (
                  <View style={styles.errorBox}>
                    <MaterialIcons name="error-outline" size={16} color="#FF3B30" />
                    <Text style={styles.errorText}>{gmailError}</Text>
                  </View>
                )}

                {!GOOGLE_CLIENT_ID && (
                  <View style={styles.warningBox}>
                    <MaterialIcons name="warning" size={16} color="#FF9500" />
                    <Text style={styles.warningText}>
                      Google Client ID not configured. The developer needs to set
                      EXPO_PUBLIC_GOOGLE_CLIENT_ID in the app secrets.
                    </Text>
                  </View>
                )}

                <Pressable
                  onPress={handleConnectGmail}
                  disabled={gmailLoading || !GOOGLE_CLIENT_ID}
                  style={({ pressed }) => [
                    styles.gmailButton,
                    pressed && styles.buttonPressed,
                    (gmailLoading || !GOOGLE_CLIENT_ID) && styles.buttonDisabled,
                  ]}
                >
                  {gmailLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <MaterialIcons name="email" size={20} color="#FFFFFF" />
                  )}
                  <Text style={styles.gmailButtonText}>
                    {gmailLoading ? "Connecting..." : "Connect Gmail Account"}
                  </Text>
                </Pressable>

                <Text style={styles.privacyNote}>
                  Only Gmail read and send permissions are requested. No emails are stored on our
                  servers. The access token is stored only on this device.
                </Text>
              </>
            )}
          </View>
        </View>

        {/* ── Account Section ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="person" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Iris Account</Text>
            <Text style={styles.sectionOptional}>(optional)</Text>
          </View>

          <View style={styles.card}>
            {authLoading ? (
              <ActivityIndicator color="#007AFF" style={styles.loader} />
            ) : isAuthenticated ? (
              <>
                <View style={styles.connectedRow}>
                  <MaterialIcons name="check-circle" size={24} color="#34C759" />
                  <View style={styles.connectedText}>
                    <Text style={styles.connectedTitle}>{user?.name || "Signed In"}</Text>
                    {user?.email && (
                      <Text style={styles.connectedEmail}>{user.email}</Text>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={handleLogout}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Sign Out</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.cardDescription}>
                  Create an Iris account to sync settings across devices and enable future cloud
                  features. This is optional — Gmail works without an account.
                </Text>
                <Pressable
                  onPress={handleLogin}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <MaterialIcons name="login" size={20} color="#FFFFFF" />
                  <Text style={styles.primaryButtonText}>Create Account / Sign In</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* ── Voice Settings Section ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="record-voice-over" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>Voice Settings</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>Speech Speed</Text>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabel}>Slow</Text>
              <View style={styles.sliderContainer}>
                {Platform.OS === "web" ? (
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.25}
                    value={speechRateLocal}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setSpeechRateLocal(val);
                      handleSpeechRateComplete(val);
                    }}
                    style={{ width: "100%", accentColor: "#007AFF" }}
                  />
                ) : (
                  <Slider
                    style={{ flex: 1 }}
                    minimumValue={0.5}
                    maximumValue={2.0}
                    step={0.25}
                    value={speechRateLocal}
                    onValueChange={handleSpeechRateChange}
                    onSlidingComplete={handleSpeechRateComplete}
                    minimumTrackTintColor="#007AFF"
                    maximumTrackTintColor="#C6C6C8"
                    thumbTintColor="#007AFF"
                  />
                )}
              </View>
              <Text style={styles.sliderLabel}>Fast</Text>
            </View>
            <Text style={styles.sliderValue}>{speechRateLocal.toFixed(2)}x</Text>

            <Pressable
              onPress={handleTestSpeech}
              disabled={testingSpeech}
              style={({ pressed }) => [
                styles.outlineButton,
                pressed && styles.buttonPressed,
                testingSpeech && styles.buttonDisabled,
              ]}
            >
              <MaterialIcons name="play-arrow" size={20} color="#007AFF" />
              <Text style={styles.outlineButtonText}>
                {testingSpeech ? "Speaking..." : "Test Voice"}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── About Section ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="info" size={20} color="#007AFF" />
            <Text style={styles.sectionTitle}>About & Privacy</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.aboutTitle}>Iris Vision v1.0</Text>
            <Text style={styles.aboutText}>
              A voice-first communication assistant for blind and visually impaired users.
            </Text>

            <View style={styles.divider} />

            <Text style={styles.privacyTitle}>Privacy commitments</Text>
            <View style={styles.privacyItem}>
              <MaterialIcons name="check" size={16} color="#34C759" />
              <Text style={styles.privacyText}>
                Audio recordings are processed and immediately deleted from our servers
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <MaterialIcons name="check" size={16} color="#34C759" />
              <Text style={styles.privacyText}>
                No emails or messages are stored on our servers — ever
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <MaterialIcons name="check" size={16} color="#34C759" />
              <Text style={styles.privacyText}>
                Gmail access token is stored only on this device (device keychain)
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <MaterialIcons name="check" size={16} color="#34C759" />
              <Text style={styles.privacyText}>
                Conversation history stays on your device only — cleared when app closes
              </Text>
            </View>
            <View style={styles.privacyItem}>
              <MaterialIcons name="check" size={16} color="#34C759" />
              <Text style={styles.privacyText}>
                Emails are never sent without the blind user confirming by voice first
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom padding for toggle button */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CommandHint({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.commandHint}>
      <MaterialIcons name={icon as any} size={16} color="#8E8E93" />
      <Text style={styles.commandHintText}>"{text}"</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000000",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#8E8E93",
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000000",
  },
  sectionOptional: {
    fontSize: 13,
    color: "#8E8E93",
    marginLeft: 4,
  },
  badge: {
    marginLeft: "auto",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeGreen: {
    backgroundColor: "rgba(52, 199, 89, 0.15)",
  },
  badgeGrey: {
    backgroundColor: "rgba(142, 142, 147, 0.15)",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#3C3C43",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDescription: {
    fontSize: 14,
    color: "#8E8E93",
    lineHeight: 20,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 12,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  connectedText: {
    flex: 1,
  },
  connectedTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000000",
  },
  connectedEmail: {
    fontSize: 13,
    color: "#8E8E93",
    marginTop: 2,
  },
  commandList: {
    marginBottom: 16,
    gap: 6,
  },
  commandHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  commandHintText: {
    fontSize: 14,
    color: "#3C3C43",
    fontStyle: "italic",
  },
  gmailButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#EA4335",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  gmailButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF3B30",
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#FF3B30",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FF3B30",
  },
  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  outlineButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#007AFF",
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sliderContainer: {
    flex: 1,
  },
  sliderLabel: {
    fontSize: 12,
    color: "#8E8E93",
    width: 32,
    textAlign: "center",
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#007AFF",
    textAlign: "center",
    marginTop: 8,
  },
  loader: {
    padding: 20,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E5EA",
    marginVertical: 16,
  },
  aboutTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 4,
  },
  aboutText: {
    fontSize: 14,
    color: "#8E8E93",
    lineHeight: 20,
  },
  privacyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#000000",
    marginBottom: 10,
  },
  privacyItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  privacyText: {
    fontSize: 14,
    color: "#3C3C43",
    lineHeight: 20,
    flex: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255, 59, 48, 0.08)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#FF3B30",
    lineHeight: 18,
    flex: 1,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "rgba(255, 149, 0, 0.08)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  warningText: {
    fontSize: 13,
    color: "#FF9500",
    lineHeight: 18,
    flex: 1,
  },
  privacyNote: {
    fontSize: 12,
    color: "#8E8E93",
    lineHeight: 17,
    textAlign: "center",
  },
});
