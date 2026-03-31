# Iris Vision — Mobile App Interface Design

## Orientation & Usage
- **Portrait only (9:16)**
- **One-handed usage** — the entire screen is a single tap target
- **Two modes** toggled by a fixed bottom-right button

---

## Screen List

### 1. Onboarding Screen (audio-first)
- Full black screen, no visual elements except a subtle pulsing iris/eye icon in center
- All interaction is audio — TTS walks the user through setup
- Requests microphone permission
- Explains how the app works
- Transitions to Voice Mode when complete

### 2. Voice Mode Screen (blind user's primary screen)
- **Background:** Pure black (#000000)
- **Entire screen** is one Pressable tap target
- **Center:** Subtle animated circle that pulses when recording (for residual-vision users)
- **Center text (large, high contrast):** Current state — "Tap to speak" / "Listening..." / "Thinking..." / "Speaking..."
- **Bottom-right corner:** Mode toggle button (80x80pt), white border, contains "A" letter for Assistant Mode switch
- **No other elements.** Nothing else on screen.

### 3. Assistant Mode Screen (sighted helper's screen)
- **Background:** White (#FFFFFF) — standard visual UI
- **Header:** "Assistant Setup" title, lock icon
- **Content (scrollable):**
  - Section: "Email Connection" — button to sign in with Gmail OAuth
  - Section: "Account" — create/manage Iris account via Manus OAuth
  - Section: "Voice Settings" — speech rate slider, voice picker
  - Section: "About" — privacy policy, version info
- **Bottom-right corner:** Mode toggle button (80x80pt), dark, contains microphone icon for Voice Mode switch
- This screen is designed for a sighted person (family member, carer, rehab worker)

---

## Primary Content and Functionality

### Voice Mode
| Element | Content |
|---------|---------|
| Tap target | Full screen — starts/stops recording |
| State indicator | Large text: "Tap to speak" / "Listening..." / "Thinking..." |
| Recording visualizer | Pulsing circle animation (subtle, for residual vision) |
| Mode toggle | Fixed 80x80pt button, bottom-right |
| Audio output | All responses spoken via TTS |
| Haptic output | Every state change produces distinct haptic |

### Assistant Mode
| Element | Content |
|---------|---------|
| Gmail sign-in | OAuth button → connects blind user's email |
| Account setup | Manus OAuth login for cloud features |
| Speech rate | Slider: 0.5x to 2.0x |
| Voice selection | Picker from available system voices |
| Privacy info | What data is stored, what isn't |

---

## Key User Flows

### Flow 1: First Launch (Onboarding)
1. App opens → black screen → three ascending tones play
2. TTS: "Welcome to Iris..." (full onboarding script)
3. System microphone permission dialog appears
4. User taps Allow (VoiceOver reads the dialog)
5. TTS explains tap-to-speak and mode toggle
6. TTS: "You're ready. Tap anywhere to start."
7. Onboarding flag saved → never plays again

### Flow 2: Voice Command (Voice Mode)
1. User taps anywhere → light haptic + low tone
2. Recording starts, state shows "Listening..."
3. User speaks command
4. User taps again → light haptic + high tone
5. State shows "Thinking..." — audio sent to server
6. Server: Whisper STT → LLM intent parse → response
7. TTS speaks response → state returns to "Tap to speak"

### Flow 3: Sighted Helper Setup (Assistant Mode)
1. User (or helper) taps mode toggle → medium haptic → "Assistant Mode"
2. Visual UI appears with setup options
3. Helper taps "Sign in with Gmail" → OAuth flow in browser
4. Gmail connected → success shown
5. Helper adjusts voice settings if needed
6. Helper taps mode toggle → medium haptic → "Voice Mode"
7. Blind user resumes voice interaction

### Flow 4: Message Composition with Confirmation
1. User taps → speaks: "Send a message to Sarah saying I'll be late"
2. LLM parses intent, composes message
3. TTS: "Here's what I'll send to Sarah: I'll be late."
4. Heavy haptic → "Say 'send it' to confirm or 'change it' to edit"
5. User taps → says "send it" → success haptic → "Message sent"

---

## Color Choices

### Voice Mode (Blind User)
| Token | Color | Rationale |
|-------|-------|-----------|
| Background | #000000 (pure black) | Maximum contrast, OLED battery saving, no visual distraction |
| Foreground text | #FFFFFF (pure white) | Maximum contrast for residual vision users |
| Recording pulse | #007AFF (iOS blue) | Visible indicator for low-vision users |
| Toggle button bg | #1C1C1E (dark gray) | Subtle but findable |
| Toggle button border | #FFFFFF | High contrast edge |
| Error state | #FF3B30 (iOS red) | Universal danger signal |
| Success state | #34C759 (iOS green) | Universal success signal |

### Assistant Mode (Sighted Helper)
| Token | Color | Rationale |
|-------|-------|-----------|
| Background | #FFFFFF | Standard iOS light UI |
| Foreground text | #000000 | Standard readability |
| Primary accent | #007AFF (iOS blue) | Standard iOS interactive elements |
| Surface/cards | #F2F2F7 (iOS system gray 6) | Standard iOS card background |
| Border | #C6C6C8 (iOS separator) | Standard iOS dividers |
| Toggle button bg | #000000 | Contrast with light background |

---

## Haptic Language

| Event | Haptic Type | Meaning |
|-------|-------------|---------|
| Tap registered | Light impact | "I heard your tap" |
| Recording started | Light impact | "I'm listening" |
| Recording stopped | Light impact | "Got it, processing" |
| Mode switched | Medium impact | "Mode changed" |
| Response ready | Light impact | "Here's your answer" |
| Action completed | Success notification | "Done successfully" |
| Error occurred | Error notification | "Something went wrong" |
| Confirmation needed | Heavy impact | "I need you to confirm" |
| Warning | Warning notification | "Heads up" |

---

## Audio Language

| Event | Sound | Duration |
|-------|-------|----------|
| App ready | Three ascending tones | ~1s |
| Recording start | Single low tone | ~200ms |
| Recording stop | Single high tone | ~200ms |
| Mode switch | Two-tone chime | ~300ms |
| Success | Bright ascending ding | ~300ms |
| Error | Low descending tone | ~400ms |
| Confirmation needed | Two quick pulses | ~300ms |
