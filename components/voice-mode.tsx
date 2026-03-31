import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  StyleSheet,
  Platform,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
} from "react-native-reanimated";
import { useKeepAwake } from "expo-keep-awake";
import { useAudioRecorder, RecordingPresets } from "expo-audio";
import * as SecureStore from "expo-secure-store";

import { useAppState } from "@/lib/app-state";
import { haptic } from "@/lib/haptics";
import { speak, speakError, stop as stopSpeech } from "@/lib/speech";
import {
  requestMicPermission,
  hasMicPermission,
  configureAudioMode,
  configurePlaybackMode,
  MAX_RECORDING_DURATION_MS,
} from "@/lib/audio-recorder";
import { trpc } from "@/lib/trpc";

// ─── Secure Store Key ────────────────────────────────────────────────────────

const GMAIL_TOKEN_KEY = "iris_gmail_access_token";

async function getGmailToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(GMAIL_TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(GMAIL_TOKEN_KEY);
  } catch {
    return null;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface InboxEmail {
  id: string;
  threadId: string;
  fromName: string;
  from: string;
  subject: string;
  snippet: string;
}

interface PendingConfirmation {
  draft: string;
  draftSubject: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  threadId: string | null;
  isEmail: boolean;
}

// ─── State Labels ────────────────────────────────────────────────────────────

const STATE_LABELS: Record<string, string> = {
  idle: "Tap to speak",
  recording: "Listening...",
  processing: "Thinking...",
  speaking: "Speaking...",
  confirming: "Confirm?",
};

const STATE_A11Y_HINTS: Record<string, string> = {
  idle: "Double tap to start recording your voice command",
  recording: "Double tap to stop recording",
  processing: "Please wait while I process your request",
  speaking: "Double tap to stop and speak a new command",
  confirming: "Double tap to record your confirmation",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function VoiceMode() {
  useKeepAwake();

  const { state, setVoiceState, addMessage } = useAppState();
  const { voiceState, conversationHistory } = state;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending voice confirmation state
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  // Email inbox state — persists across turns in a session
  const [inboxEmails, setInboxEmails] = useState<InboxEmail[]>([]);
  const [currentEmailIndex, setCurrentEmailIndex] = useState(0);

  // tRPC mutations
  const uploadMutation = trpc.voice.uploadAudio.useMutation();
  const transcribeMutation = trpc.voice.transcribe.useMutation();
  const processMutation = trpc.voice.process.useMutation();
  const getInboxMutation = trpc.gmail.getInbox.useMutation();
  const getEmailBodyMutation = trpc.gmail.getEmailBody.useMutation();
  const sendEmailMutation = trpc.gmail.sendEmail.useMutation();
  const findContactMutation = trpc.gmail.findContact.useMutation();

  // ─── Recording Pulse Animation ───────────────────────────────────────────

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (voiceState === "recording") {
      pulseScale.value = withRepeat(
        withTiming(1.4, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [voiceState, pulseScale, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  // ─── Gmail Helpers ────────────────────────────────────────────────────────

  const handleReadEmails = useCallback(
    async (accessToken: string) => {
      const result = await getInboxMutation.mutateAsync({
        accessToken,
        maxResults: 10,
      });

      if (!result.success) {
        haptic.error();
        await speakError(result.spoken_message);
        setVoiceState("idle");
        return;
      }

      // Store inbox emails for navigation
      setInboxEmails(result.emails as InboxEmail[]);
      setCurrentEmailIndex(0);

      haptic.light();
      setVoiceState("speaking");
      addMessage("assistant", result.spoken_message);
      await speak(result.spoken_message);
      setVoiceState("idle");
    },
    [getInboxMutation, setVoiceState, addMessage]
  );

  const handleReadEmailBody = useCallback(
    async (accessToken: string, index: number) => {
      const email = inboxEmails[index];
      if (!email) {
        const msg = inboxEmails.length === 0
          ? "You haven't loaded your inbox yet. Say 'read my emails' first."
          : `I only have ${inboxEmails.length} email${inboxEmails.length === 1 ? "" : "s"} loaded. Try a lower number.`;
        haptic.warning();
        setVoiceState("speaking");
        addMessage("assistant", msg);
        await speak(msg);
        setVoiceState("idle");
        return;
      }

      const result = await getEmailBodyMutation.mutateAsync({
        accessToken,
        messageId: email.id,
      });

      if (!result.success) {
        haptic.error();
        await speakError(result.spoken_message);
        setVoiceState("idle");
        return;
      }

      setCurrentEmailIndex(index);
      haptic.light();
      setVoiceState("speaking");
      addMessage("assistant", result.spoken_message);
      await speak(result.spoken_message);
      setVoiceState("idle");
    },
    [inboxEmails, getEmailBodyMutation, setVoiceState, addMessage]
  );

  const handleComposeEmail = useCallback(
    async (
      accessToken: string,
      recipientName: string | null,
      draftSubject: string | null,
      draftBody: string,
      spokenResponse: string
    ) => {
      // If we have a recipient name, try to find their email address
      let recipientEmail: string | null = null;

      if (recipientName && accessToken) {
        const contactResult = await findContactMutation.mutateAsync({
          accessToken,
          name: recipientName,
        });

        if (contactResult.success && contactResult.contacts.length > 0) {
          recipientEmail = contactResult.contacts[0].email;
        }
      }

      // Set up pending confirmation
      setPendingConfirmation({
        draft: draftBody,
        draftSubject: draftSubject || "No subject",
        recipientName,
        recipientEmail,
        threadId: null,
        isEmail: true,
      });

      haptic.heavy();
      setVoiceState("speaking");
      addMessage("assistant", spokenResponse);
      await speak(spokenResponse);
      setVoiceState("confirming");
    },
    [findContactMutation, setVoiceState, addMessage]
  );

  const handleReplyEmail = useCallback(
    async (
      accessToken: string,
      emailIndex: number,
      draftBody: string,
      spokenResponse: string
    ) => {
      const email = inboxEmails[emailIndex] || inboxEmails[currentEmailIndex];

      if (!email) {
        const msg = "I'm not sure which email to reply to. Say 'read my emails' first, then say 'reply to that email'.";
        setVoiceState("speaking");
        addMessage("assistant", msg);
        await speak(msg);
        setVoiceState("idle");
        return;
      }

      setPendingConfirmation({
        draft: draftBody,
        draftSubject: `Re: ${email.subject}`,
        recipientName: email.fromName,
        recipientEmail: email.from,
        threadId: email.threadId,
        isEmail: true,
      });

      haptic.heavy();
      setVoiceState("speaking");
      addMessage("assistant", spokenResponse);
      await speak(spokenResponse);
      setVoiceState("confirming");
    },
    [inboxEmails, currentEmailIndex, setVoiceState, addMessage]
  );

  const handleSendConfirmed = useCallback(
    async (accessToken: string | null, confirmation: PendingConfirmation) => {
      if (!confirmation.isEmail) {
        // Non-email message — compose only, no direct send capability in V1
        haptic.success();
        setVoiceState("speaking");
        const msg = confirmation.recipientName
          ? `Your message to ${confirmation.recipientName} is ready. You can copy it and send it manually.`
          : "Your message is ready.";
        addMessage("assistant", msg);
        await speak(msg);
        setPendingConfirmation(null);
        setVoiceState("idle");
        return;
      }

      if (!accessToken) {
        haptic.error();
        const msg =
          "Gmail isn't connected yet. Please ask your helper to sign in to Gmail in the Assistant Setup screen, then try again.";
        setVoiceState("speaking");
        addMessage("assistant", msg);
        await speakError(msg);
        setPendingConfirmation(null);
        setVoiceState("idle");
        return;
      }

      if (!confirmation.recipientEmail) {
        haptic.error();
        const msg = confirmation.recipientName
          ? `I couldn't find an email address for ${confirmation.recipientName} in your sent mail. Please ask your helper to enter the email address manually.`
          : "I don't have an email address to send to. Please say who you want to email.";
        setVoiceState("speaking");
        addMessage("assistant", msg);
        await speakError(msg);
        setPendingConfirmation(null);
        setVoiceState("idle");
        return;
      }

      setVoiceState("processing");

      const result = await sendEmailMutation.mutateAsync({
        accessToken,
        to: confirmation.recipientEmail,
        subject: confirmation.draftSubject || "Message from Iris",
        body: confirmation.draft,
        threadId: confirmation.threadId || undefined,
        userConfirmed: true,
      });

      if (!result.success) {
        haptic.error();
        setVoiceState("speaking");
        addMessage("assistant", result.spoken_message);
        await speakError(result.spoken_message);
        setPendingConfirmation(null);
        setVoiceState("idle");
        return;
      }

      haptic.success();
      setVoiceState("speaking");
      addMessage("assistant", result.spoken_message);
      await speak(result.spoken_message);
      setPendingConfirmation(null);
      setVoiceState("idle");
    },
    [sendEmailMutation, setVoiceState, addMessage]
  );

  // ─── Recording Logic ─────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const hasPermission = await hasMicPermission();
      if (!hasPermission) {
        const granted = await requestMicPermission();
        if (!granted) {
          haptic.error();
          await speakError(
            "I need microphone access to hear you. Please grant microphone permission in your phone's settings."
          );
          return;
        }
      }

      await configureAudioMode();
      recorder.record();
      setVoiceState("recording");
      haptic.light();

      // Auto-stop after max duration
      recordingTimerRef.current = setTimeout(async () => {
        if (recorder.isRecording) {
          await stopRecording();
          haptic.warning();
          await speakError(
            "I stopped recording after 60 seconds. For longer messages, try breaking them into parts."
          );
        }
      }, MAX_RECORDING_DURATION_MS);
    } catch (error) {
      console.error("Failed to start recording:", error);
      haptic.error();
      await speakError(
        "I couldn't start recording. Another app might be using the microphone. Please close other apps and try again."
      );
      setVoiceState("idle");
    }
  }, [recorder, setVoiceState]);

  const stopRecording = useCallback(async () => {
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    try {
      await recorder.stop();
      haptic.light();
      setVoiceState("processing");

      await configurePlaybackMode();

      const uri = recorder.uri;
      if (!uri) {
        haptic.error();
        await speakError("That was too short for me to understand. Tap and speak your command.");
        setVoiceState("idle");
        return;
      }

      // Read the file and convert to base64
      const response = await fetch(uri);
      const blob = await response.blob();

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          const base64Data = dataUrl.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      if (!base64 || base64.length < 100) {
        haptic.error();
        await speakError("That was too short for me to understand. Tap and speak your command.");
        setVoiceState("idle");
        return;
      }

      // Upload to S3
      const uploadResult = await uploadMutation.mutateAsync({
        audioBase64: base64,
        mimeType: "audio/m4a",
      });

      if (!uploadResult.success) {
        haptic.error();
        await speakError(uploadResult.spoken_message || "I had trouble processing your recording. Please try again.");
        setVoiceState("idle");
        return;
      }

      // Transcribe
      const transcribeResult = await transcribeMutation.mutateAsync({
        audioUrl: uploadResult.url!,
        language: "en",
      });

      if (!transcribeResult.success) {
        haptic.error();
        await speakError(transcribeResult.spoken_message || "I didn't catch that. Could you try again?");
        setVoiceState("idle");
        return;
      }

      const userText = transcribeResult.text!;
      addMessage("user", userText);

      // Get Gmail token (may be null if not connected)
      const gmailToken = await getGmailToken();

      // ── Confirmation flow ──────────────────────────────────────────────────
      if (pendingConfirmation) {
        const lowerText = userText.toLowerCase();

        if (
          lowerText.includes("send") ||
          lowerText.includes("yes") ||
          lowerText.includes("confirm") ||
          lowerText.includes("go ahead") ||
          lowerText.includes("send it") ||
          lowerText.includes("that's right") ||
          lowerText.includes("sounds good")
        ) {
          await handleSendConfirmed(gmailToken, pendingConfirmation);
          return;
        }

        if (
          lowerText.includes("cancel") ||
          lowerText.includes("forget it") ||
          lowerText.includes("never mind") ||
          lowerText.includes("stop")
        ) {
          setPendingConfirmation(null);
          const cancelMsg = "Okay, cancelled. Tap to speak a new command.";
          setVoiceState("speaking");
          addMessage("assistant", cancelMsg);
          await speak(cancelMsg);
          setVoiceState("idle");
          return;
        }

        // Otherwise treat as a refinement — fall through to AI processing
        setPendingConfirmation(null);
      }

      // ── AI intent parsing ─────────────────────────────────────────────────
      const historyForAI = conversationHistory.slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const processResult = await processMutation.mutateAsync({
        text: userText,
        conversationHistory: historyForAI,
      });

      const intent = processResult.intent || "unknown";
      const spokenResponse = processResult.spoken_response || "I'm not sure how to help with that.";

      // ── Route by intent ───────────────────────────────────────────────────

      if (intent === "read_emails") {
        if (!gmailToken) {
          const msg =
            "Gmail isn't connected yet. Please ask your helper to sign in to Gmail in the Assistant Setup screen.";
          setVoiceState("speaking");
          addMessage("assistant", msg);
          await speak(msg);
          setVoiceState("idle");
          return;
        }
        setVoiceState("processing");
        await handleReadEmails(gmailToken);
        return;
      }

      if (intent === "read_email_body") {
        if (!gmailToken) {
          const msg = "Gmail isn't connected. Please ask your helper to sign in to Gmail first.";
          setVoiceState("speaking");
          addMessage("assistant", msg);
          await speak(msg);
          setVoiceState("idle");
          return;
        }
        const emailIndex =
          typeof processResult.email_index === "number" ? processResult.email_index : 0;
        setVoiceState("processing");
        await handleReadEmailBody(gmailToken, emailIndex);
        return;
      }

      if (intent === "navigate_email") {
        const direction = processResult.direction;
        let newIndex = currentEmailIndex;
        if (direction === "next") {
          newIndex = Math.min(currentEmailIndex + 1, inboxEmails.length - 1);
        } else if (direction === "previous") {
          newIndex = Math.max(currentEmailIndex - 1, 0);
        }

        if (inboxEmails.length === 0) {
          const msg = "You haven't loaded your inbox yet. Say 'read my emails' first.";
          setVoiceState("speaking");
          addMessage("assistant", msg);
          await speak(msg);
          setVoiceState("idle");
          return;
        }

        if (gmailToken) {
          setVoiceState("processing");
          await handleReadEmailBody(gmailToken, newIndex);
        }
        return;
      }

      if (intent === "compose_email" && processResult.needs_confirmation && processResult.draft_content) {
        await handleComposeEmail(
          gmailToken || "",
          processResult.recipient_name || null,
          processResult.draft_subject || null,
          processResult.draft_content,
          spokenResponse
        );
        return;
      }

      if (intent === "reply_email" && processResult.needs_confirmation && processResult.draft_content) {
        const emailIndex =
          typeof processResult.email_index === "number" ? processResult.email_index : currentEmailIndex;
        await handleReplyEmail(
          gmailToken || "",
          emailIndex,
          processResult.draft_content,
          spokenResponse
        );
        return;
      }

      if (intent === "compose_message" && processResult.needs_confirmation && processResult.draft_content) {
        // Non-email message — store for confirmation but no direct send
        setPendingConfirmation({
          draft: processResult.draft_content,
          draftSubject: null,
          recipientName: processResult.recipient_name || null,
          recipientEmail: null,
          threadId: null,
          isEmail: false,
        });
        haptic.heavy();
        setVoiceState("speaking");
        addMessage("assistant", spokenResponse);
        await speak(spokenResponse);
        setVoiceState("confirming");
        return;
      }

      // Default: speak the response
      setVoiceState("speaking");
      addMessage("assistant", spokenResponse);
      haptic.light();
      await speak(spokenResponse);
      setVoiceState("idle");
    } catch (error) {
      console.error("Processing failed:", error);
      haptic.error();
      setVoiceState("speaking");
      await speakError(
        "Something went wrong on my end. I'm sorry about that. Please try again in a moment."
      );
      setVoiceState("idle");
    }
  }, [
    recorder,
    setVoiceState,
    addMessage,
    conversationHistory,
    pendingConfirmation,
    inboxEmails,
    currentEmailIndex,
    uploadMutation,
    transcribeMutation,
    processMutation,
    handleReadEmails,
    handleReadEmailBody,
    handleComposeEmail,
    handleReplyEmail,
    handleSendConfirmed,
  ]);

  // ─── Tap Handler ──────────────────────────────────────────────────────────

  const handleTap = useCallback(async () => {
    if (voiceState === "recording") {
      await stopRecording();
    } else if (voiceState === "idle" || voiceState === "confirming") {
      await stopSpeech();
      await startRecording();
    } else if (voiceState === "speaking") {
      await stopSpeech();
      setVoiceState("idle");
      haptic.light();
    }
    // If processing, ignore taps
  }, [voiceState, startRecording, stopRecording, setVoiceState]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const stateLabel = STATE_LABELS[voiceState] || "Tap to speak";
  const a11yHint = STATE_A11Y_HINTS[voiceState] || "";

  return (
    <Pressable
      onPress={handleTap}
      style={styles.container}
      accessible={true}
      accessibilityLabel={stateLabel}
      accessibilityHint={a11yHint}
      accessibilityRole="button"
    >
      <View style={styles.content}>
        {/* Recording pulse indicator */}
        <Animated.View style={[styles.pulse, pulseStyle]}>
          <View style={styles.pulseInner} />
        </Animated.View>

        {/* State label */}
        <Text style={styles.stateLabel} accessible={false}>
          {stateLabel}
        </Text>

        {/* Gmail connection indicator */}
        {state.emailConnected && (
          <Text style={styles.emailIndicator} accessible={false}>
            Gmail connected
          </Text>
        )}

        {/* Subtle mode indicator */}
        <Text style={styles.modeIndicator} accessible={false}>
          Voice Mode
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  pulse: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0, 122, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 40,
  },
  pulseInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 122, 255, 0.4)",
  },
  stateLabel: {
    fontSize: 28,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  emailIndicator: {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(52, 199, 89, 0.8)",
    letterSpacing: 0.3,
  },
  modeIndicator: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.3)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
