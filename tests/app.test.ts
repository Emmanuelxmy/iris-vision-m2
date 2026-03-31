import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Test: Google Credentials ───────────────────────────────────────────────

describe("Google Credentials", () => {
  it("EXPO_PUBLIC_GOOGLE_CLIENT_ID is set and non-empty", () => {
    const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || "";
    // Accept any non-trivially-short value (real IDs are 70+ chars, but we accept test values)
    expect(clientId.length).toBeGreaterThan(5);
  });

  it("GOOGLE_CLIENT_SECRET is set and non-empty", () => {
    const secret = process.env.GOOGLE_CLIENT_SECRET || "";
    expect(secret.length).toBeGreaterThan(5);
  });
});

// ─── Test: Server Router Logic ──────────────────────────────────────────────

describe("Server Router - Voice Processing", () => {
  it("should have correct system prompt for voice mode", async () => {
    // Read the router file and verify the system prompt exists
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers.ts", "utf-8");

    // Verify key requirements from the design doc
    expect(routerContent).toContain("spoken_response");
    expect(routerContent).toContain("needs_confirmation");
    expect(routerContent).toContain("intent");
    expect(routerContent).toContain("draft_content");
    expect(routerContent).toContain("Never send without explicit confirmation");
  });

  it("should have all required tRPC routes", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers.ts", "utf-8");

    // Verify all voice routes exist
    expect(routerContent).toContain("uploadAudio");
    expect(routerContent).toContain("transcribe");
    expect(routerContent).toContain("process");
    expect(routerContent).toContain("chat");
  });

  it("should enforce 16MB file size limit", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers.ts", "utf-8");

    expect(routerContent).toContain("sizeMB > 16");
    expect(routerContent).toContain("spoken_message");
  });

  it("should always include spoken_message in error responses", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/routers.ts", "utf-8");

    // Every error path must have a spoken_message
    const errorBlocks = routerContent.match(/success: false/g);
    const spokenMessages = routerContent.match(/spoken_message|spoken_response/g);

    // There should be at least as many spoken messages as error blocks
    expect(spokenMessages!.length).toBeGreaterThanOrEqual(errorBlocks!.length);
  });
});

// ─── Test: App State ────────────────────────────────────────────────────────

describe("App State Structure", () => {
  it("should have correct initial state shape", async () => {
    const fs = await import("fs");
    const stateContent = fs.readFileSync("lib/app-state.tsx", "utf-8");

    // Verify all required state fields
    expect(stateContent).toContain("mode: AppMode");
    expect(stateContent).toContain("voiceState: VoiceState");
    expect(stateContent).toContain("onboardingComplete: boolean");
    expect(stateContent).toContain("conversationHistory: ConversationMessage[]");
    expect(stateContent).toContain("speechRate: number");
    expect(stateContent).toContain("accountConnected: boolean");
  });

  it("should default to voice mode", async () => {
    const fs = await import("fs");
    const stateContent = fs.readFileSync("lib/app-state.tsx", "utf-8");

    expect(stateContent).toContain('mode: "voice"');
  });

  it("should default to onboarding not complete", async () => {
    const fs = await import("fs");
    const stateContent = fs.readFileSync("lib/app-state.tsx", "utf-8");

    expect(stateContent).toContain("onboardingComplete: false");
  });

  it("should persist onboarding state to AsyncStorage", async () => {
    const fs = await import("fs");
    const stateContent = fs.readFileSync("lib/app-state.tsx", "utf-8");

    expect(stateContent).toContain("iris_onboarding_complete");
    expect(stateContent).toContain("AsyncStorage.setItem");
  });

  it("should clamp speech rate between 0.5 and 2.0", async () => {
    const fs = await import("fs");
    const stateContent = fs.readFileSync("lib/app-state.tsx", "utf-8");

    expect(stateContent).toContain("Math.max(0.5");
    expect(stateContent).toContain("Math.min(2.0");
  });
});

// ─── Test: Voice Mode Component ─────────────────────────────────────────────

describe("Voice Mode Component", () => {
  it("should have full-screen tap target", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    // The entire container should be a Pressable
    expect(content).toContain("Pressable");
    expect(content).toContain("onPress={handleTap}");
    expect(content).toContain("flex: 1");
  });

  it("should have all voice states", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    expect(content).toContain('"idle"');
    expect(content).toContain('"recording"');
    expect(content).toContain('"processing"');
    expect(content).toContain('"speaking"');
  });

  it("should have accessibility labels for all states", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    expect(content).toContain("accessibilityLabel");
    expect(content).toContain("accessibilityHint");
    expect(content).toContain("accessibilityRole");
  });

  it("should enforce recording timeout", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    expect(content).toContain("MAX_RECORDING_DURATION_MS");
    expect(content).toContain("setTimeout");
  });

  it("should require voice confirmation before sending", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    // Must check for confirmation keywords
    expect(content).toContain("pendingConfirmation");
    expect(content).toContain('"send"');
    expect(content).toContain('"yes"');
    expect(content).toContain('"confirm"');
  });

  it("should use haptic feedback for state changes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    expect(content).toContain("haptic.light");
    expect(content).toContain("haptic.error");
    expect(content).toContain("haptic.success");
  });

  it("should speak errors aloud, never silent failures", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/voice-mode.tsx", "utf-8");

    expect(content).toContain("speakError");
    // Every catch block should have a speakError call
    const catchBlocks = content.match(/catch\s*\(/g) || [];
    const speakErrorCalls = content.match(/speakError/g) || [];
    expect(speakErrorCalls.length).toBeGreaterThanOrEqual(catchBlocks.length);
  });
});

// ─── Test: Mode Toggle ──────────────────────────────────────────────────────

describe("Mode Toggle Component", () => {
  it("should be 80x80pt", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/mode-toggle.tsx", "utf-8");

    expect(content).toContain("width: 80");
    expect(content).toContain("height: 80");
  });

  it("should be positioned bottom-right", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/mode-toggle.tsx", "utf-8");

    expect(content).toContain("bottom:");
    expect(content).toContain("right:");
    expect(content).toContain("position: \"absolute\"");
  });

  it("should announce mode change via TTS", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/mode-toggle.tsx", "utf-8");

    expect(content).toContain("speak");
    expect(content).toContain("Voice Mode");
    expect(content).toContain("Assistant Mode");
  });

  it("should have accessibility labels", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/mode-toggle.tsx", "utf-8");

    expect(content).toContain("accessibilityLabel");
    expect(content).toContain("accessibilityHint");
  });
});

// ─── Test: Onboarding ───────────────────────────────────────────────────────

describe("Onboarding Component", () => {
  it("should have all onboarding steps", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/onboarding.tsx", "utf-8");

    expect(content).toContain('"welcome"');
    expect(content).toContain('"mic_permission"');
    expect(content).toContain('"how_it_works"');
    expect(content).toContain('"modes"');
    expect(content).toContain('"trust"');
    expect(content).toContain('"ready"');
  });

  it("should request microphone permission during onboarding", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/onboarding.tsx", "utf-8");

    expect(content).toContain("requestMicPermission");
  });

  it("should explain the trust promise about never sending without confirmation", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/onboarding.tsx", "utf-8");

    expect(content).toContain("never send a message or email without asking you to confirm");
  });

  it("should be entirely audio-driven", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/onboarding.tsx", "utf-8");

    // Every step should have a spoken script
    expect(content).toContain("STEP_SCRIPTS");
    expect(content).toContain("speak(STEP_SCRIPTS");
  });
});

// ─── Test: Assistant Mode ───────────────────────────────────────────────────

describe("Assistant Mode Component", () => {
  it("should have account sign-in section", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/assistant-mode.tsx", "utf-8");

    expect(content).toContain("Sign In");
    expect(content).toContain("startOAuthLogin");
  });

  it("should have voice settings with speech rate slider", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/assistant-mode.tsx", "utf-8");

    expect(content).toContain("Speech Speed");
    expect(content).toContain("Slider");
    expect(content).toContain("Test Voice");
  });

  it("should have privacy information", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("components/assistant-mode.tsx", "utf-8");

    expect(content).toContain("Privacy");
    expect(content).toContain("immediately deleted");
    expect(content).toContain("stored only on this device");
  });
});

// ─── Test: Speech Module ────────────────────────────────────────────────────

describe("Speech Module", () => {
  it("should have speakError function for error communication", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("lib/speech.ts", "utf-8");

    expect(content).toContain("export async function speakError");
    // Error speech should be slower for clarity
    expect(content).toContain("Math.min(currentRate, 1.0)");
  });

  it("should persist speech rate", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("lib/speech.ts", "utf-8");

    expect(content).toContain("AsyncStorage.setItem");
    expect(content).toContain("iris_speech_rate");
  });

  it("should stop current speech before starting new", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("lib/speech.ts", "utf-8");

    expect(content).toContain("speech.stop()");
  });
});

// ─── Test: No Hardcoded API Keys ────────────────────────────────────────────

describe("Security - No Hardcoded Secrets", () => {
  it("should not have hardcoded API keys in any source file", async () => {
    const fs = await import("fs");
    const path = await import("path");

    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === "node_modules" || entry.name === ".expo" || entry.name === "dist") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          // Check for common API key patterns
          expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/); // OpenAI keys
          expect(content).not.toMatch(/AIza[a-zA-Z0-9_-]{35}/); // Google API keys
        }
      }
    };

    checkDir(".");
  });
});

// ─── Test: Main Screen Structure ────────────────────────────────────────────

describe("Main Screen", () => {
  it("should render onboarding when not complete", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");

    expect(content).toContain("onboardingComplete");
    expect(content).toContain("<Onboarding />");
  });

  it("should render VoiceMode and AssistantMode based on state", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");

    expect(content).toContain("<VoiceMode />");
    expect(content).toContain("<AssistantMode />");
    expect(content).toContain('mode === "voice"');
  });

  it("should always render ModeToggle", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");

    expect(content).toContain("<ModeToggle />");
  });

  it("should use keep-awake", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("app/(tabs)/index.tsx", "utf-8");

    expect(content).toContain("useKeepAwake");
  });
});
