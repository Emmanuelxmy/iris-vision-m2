import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AppMode = "voice" | "assistant";

export type VoiceState =
  | "idle"          // Waiting for tap — "Tap to speak"
  | "recording"     // Actively recording — "Listening..."
  | "processing"    // Sent to server, waiting for response — "Thinking..."
  | "speaking"      // TTS is speaking the response — "Speaking..."
  | "confirming";   // Waiting for user confirmation — "Confirm?"

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

export type AppState = {
  mode: AppMode;
  voiceState: VoiceState;
  onboardingComplete: boolean;
  conversationHistory: ConversationMessage[];
  lastError: string | null;
  emailConnected: boolean;
  accountConnected: boolean;
  speechRate: number;
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type AppAction =
  | { type: "SET_MODE"; mode: AppMode }
  | { type: "SET_VOICE_STATE"; state: VoiceState }
  | { type: "SET_ONBOARDING_COMPLETE" }
  | { type: "ADD_CONVERSATION_MESSAGE"; message: ConversationMessage }
  | { type: "CLEAR_CONVERSATION" }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_EMAIL_CONNECTED"; connected: boolean }
  | { type: "SET_ACCOUNT_CONNECTED"; connected: boolean }
  | { type: "SET_SPEECH_RATE"; rate: number }
  | { type: "RESTORE_STATE"; state: Partial<AppState> };

// ─── Initial State ───────────────────────────────────────────────────────────

const initialState: AppState = {
  mode: "voice",
  voiceState: "idle",
  onboardingComplete: false,
  conversationHistory: [],
  lastError: null,
  emailConnected: false,
  accountConnected: false,
  speechRate: 1.0,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_VOICE_STATE":
      return { ...state, voiceState: action.state };
    case "SET_ONBOARDING_COMPLETE":
      return { ...state, onboardingComplete: true };
    case "ADD_CONVERSATION_MESSAGE":
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.message],
      };
    case "CLEAR_CONVERSATION":
      return { ...state, conversationHistory: [] };
    case "SET_ERROR":
      return { ...state, lastError: action.error };
    case "SET_EMAIL_CONNECTED":
      return { ...state, emailConnected: action.connected };
    case "SET_ACCOUNT_CONNECTED":
      return { ...state, accountConnected: action.connected };
    case "SET_SPEECH_RATE":
      return { ...state, speechRate: action.rate };
    case "RESTORE_STATE":
      return { ...state, ...action.state };
    default:
      return state;
  }
}

// ─── Persistence Keys ────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  onboarding: "iris_onboarding_complete",
  emailConnected: "iris_email_connected",
  accountConnected: "iris_account_connected",
  speechRate: "iris_speech_rate",
} as const;

// ─── Context ─────────────────────────────────────────────────────────────────

type AppContextType = {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  toggleMode: () => void;
  setVoiceState: (s: VoiceState) => void;
  completeOnboarding: () => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  setError: (error: string | null) => void;
  setEmailConnected: (connected: boolean) => void;
  setAccountConnected: (connected: boolean) => void;
  setSpeechRate: (rate: number) => void;
};

const AppContext = createContext<AppContextType | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Restore persisted state on mount
  useEffect(() => {
    (async () => {
      try {
        const [onboarding, email, account, rate] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.onboarding),
          AsyncStorage.getItem(STORAGE_KEYS.emailConnected),
          AsyncStorage.getItem(STORAGE_KEYS.accountConnected),
          AsyncStorage.getItem(STORAGE_KEYS.speechRate),
        ]);

        dispatch({
          type: "RESTORE_STATE",
          state: {
            onboardingComplete: onboarding === "true",
            emailConnected: email === "true",
            accountConnected: account === "true",
            speechRate: rate ? parseFloat(rate) : 1.0,
          },
        });
      } catch {
        // Defaults are fine
      }
    })();
  }, []);

  const toggleMode = () => {
    const newMode = state.mode === "voice" ? "assistant" : "voice";
    dispatch({ type: "SET_MODE", mode: newMode });
  };

  const setVoiceState = (s: VoiceState) => {
    dispatch({ type: "SET_VOICE_STATE", state: s });
  };

  const completeOnboarding = () => {
    dispatch({ type: "SET_ONBOARDING_COMPLETE" });
    AsyncStorage.setItem(STORAGE_KEYS.onboarding, "true");
  };

  const addMessage = (role: "user" | "assistant", content: string) => {
    dispatch({
      type: "ADD_CONVERSATION_MESSAGE",
      message: { role, content, timestamp: Date.now() },
    });
  };

  const setError = (error: string | null) => {
    dispatch({ type: "SET_ERROR", error });
  };

  const setEmailConnected = (connected: boolean) => {
    dispatch({ type: "SET_EMAIL_CONNECTED", connected });
    AsyncStorage.setItem(STORAGE_KEYS.emailConnected, connected.toString());
  };

  const setAccountConnected = (connected: boolean) => {
    dispatch({ type: "SET_ACCOUNT_CONNECTED", connected });
    AsyncStorage.setItem(STORAGE_KEYS.accountConnected, connected.toString());
  };

  const setSpeechRate = (rate: number) => {
    const clampedRate = Math.max(0.5, Math.min(2.0, rate));
    dispatch({ type: "SET_SPEECH_RATE", rate: clampedRate });
    AsyncStorage.setItem(STORAGE_KEYS.speechRate, clampedRate.toString());
  };

  return (
    <AppContext.Provider
      value={{
        state,
        dispatch,
        toggleMode,
        setVoiceState,
        completeOnboarding,
        addMessage,
        setError,
        setEmailConnected,
        setAccountConnected,
        setSpeechRate,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAppState() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppState must be used within AppStateProvider");
  }
  return context;
}
