# Iris Vision — Architecture, User Flow, and V1 Feature Plan

---

## ONE — Full App Architecture

### The Core Insight That Drives Every Decision

The research is unambiguous: blind users do not need a better screen reader. They need **no screen at all**. Every existing tool — VoiceOver, TalkBack, JAWS, Be My Eyes — is a translation layer between a visual interface and an audio output. Iris Vision eliminates the visual interface entirely. The entire app is a voice conversation between the user and an intelligent assistant that manages their communications.

This means the architecture is not a typical mobile app with screens, navigation, and UI components. It is a **voice loop** with two modes, a single tap target, and a backend that does all the thinking.

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    MOBILE APP                        │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │          SINGLE FULL-SCREEN TAP TARGET         │  │
│  │                                                │  │
│  │  ┌─────────────┐    ┌──────────────────────┐  │  │
│  │  │ VOICE MODE  │    │  ASSISTANT MODE       │  │  │
│  │  │ (Dictation) │◄──►│  (AI Conversation)    │  │  │
│  │  └─────────────┘    └──────────────────────┘  │  │
│  │                                                │  │
│  │  ┌────────────────────────────────────────┐   │  │
│  │  │  MODE TOGGLE — bottom-right physical   │   │  │
│  │  └────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              LOCAL SERVICES                     │  │
│  │  • expo-speech (TTS)                           │  │
│  │  • expo-audio (recording)                      │  │
│  │  • expo-haptics (tactile feedback)             │  │
│  │  • AsyncStorage (preferences, onboarding)      │  │
│  │  • expo-keep-awake (prevent sleep)             │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ tRPC over HTTPS
                       ▼
┌─────────────────────────────────────────────────────┐
│                   BACKEND SERVER                     │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              tRPC ROUTER                        │  │
│  │                                                │  │
│  │  voice.transcribe  — Whisper STT               │  │
│  │  voice.process     — LLM intent parsing        │  │
│  │  voice.respond     — Generate spoken response   │  │
│  │  assistant.chat    — Conversational AI          │  │
│  │  audio.upload      — S3 audio storage           │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              AI PIPELINE                        │  │
│  │                                                │  │
│  │  1. Whisper STT (transcribeAudio)              │  │
│  │  2. LLM Intent Parser (invokeLLM)              │  │
│  │     — Classifies: command, question, dictation │  │
│  │     — Extracts: action, target, content        │  │
│  │  3. Action Executor                             │  │
│  │     — Composes messages, reads summaries, etc. │  │
│  │  4. Response Generator (invokeLLM)             │  │
│  │     — Natural spoken response                   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              STORAGE                            │  │
│  │  • S3 — audio recordings                       │  │
│  │  • AsyncStorage — local prefs (no DB needed)   │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Why Each Decision Was Made

**Why no tab navigation, no screens, no visual UI?**

The research found that the single biggest pain point is not any individual broken feature — it is the paradigm itself. Every tool forces blind users to navigate a visual interface with audio assistance. The research quote from Pete on AppleVis captures it: *"There is a difference between a program being 'accessible' and a program that can be used efficiently and productively by a blind user."* Iris Vision is not accessible. It is **native**. There is nothing to navigate because there is nothing visual.

**Why two modes (Voice Mode and Assistant Mode)?**

The research identified two distinct use patterns:

1. **Quick commands** — "Read my new emails." "Reply to Sarah: I'll be there at 5." "What messages did I miss?" These are transactional. The user wants to do something and get confirmation.

2. **Open conversation** — "Summarise my inbox this week." "What did the family group chat talk about today?" "Help me write a professional reply to this job rejection." These are conversational. The user wants to think out loud with an AI.

Voice Mode handles pattern 1. Assistant Mode handles pattern 2. The toggle between them is a physical button — not a gesture, not a voice command — because the research shows that gestures are the single most fragile interaction for blind users. A physical button in a fixed position (bottom-right) is always findable.

**Why server-side AI instead of on-device?**

Three reasons from the research:

1. **Accuracy**: The research found that dictation errors are the number one frustration with text messaging. Server-side Whisper is significantly more accurate than on-device speech recognition, especially for diverse accents.
2. **Intent parsing**: LLM-based intent understanding requires a model that cannot run on-device with acceptable latency. The research identified that "pattern recognition vs LLM parsing" is a key tradeoff — LLM wins on accuracy for natural speech.
3. **Privacy concern mitigation**: By processing audio on our server (not sending it to a third-party API the user doesn't know about), we control the data pipeline. The research found that blind users' top privacy concern is *"I don't know where the apps are sending my pictures/audio."*

**Why no database for V1?**

The research shows that blind users' primary need is a communication layer, not a data storage system. V1 does not store messages, emails, or conversation history on our servers. It processes voice commands in real-time and responds. User preferences (voice speed, preferred language, onboarding completion) are stored locally in AsyncStorage. This is a deliberate data minimisation decision driven by the security research: *"What blind users need to hear in a privacy statement to feel safe"* — the answer is "we don't store your communications."

**Why expo-speech for TTS instead of a cloud TTS service?**

The research found that latency is critical for voice interfaces. expo-speech uses the device's native TTS engine, which has zero network latency. The quality of iOS and Android native voices is now excellent (especially iOS enhanced voices). Cloud TTS would add 200-500ms of latency per utterance, which makes conversation feel broken. For V1, native TTS is the right tradeoff.

**Why expo-audio for recording?**

It is the only recording library that works reliably across iOS and Android in Expo SDK 54. The research identified "lowest latency, highest accuracy in noisy environments" as key requirements. expo-audio with HIGH_QUALITY preset captures at sufficient quality for Whisper transcription.

**Why haptics are critical?**

The research found that blind users rely on non-visual feedback to confirm actions. Every state change in the app produces a haptic response:
- Light impact: tap registered
- Medium impact: mode switched
- Success notification: action completed (message sent, email read)
- Error notification: something went wrong (spoken error follows)
- Heavy impact: confirmation required (before sending a message)

---

### Layer Responsibilities

| Layer | Responsibility | Key Technology |
|-------|---------------|----------------|
| **Tap Surface** | Capture taps, manage recording state, play TTS responses | React Native Pressable (full-screen) |
| **Voice Engine** | Record audio, manage recording lifecycle, handle permissions | expo-audio (useAudioRecorder) |
| **Speech Output** | Speak all responses, errors, confirmations to the user | expo-speech |
| **Haptic Layer** | Provide tactile confirmation of every state change | expo-haptics |
| **Mode Manager** | Track current mode (voice/assistant), handle toggle | React Context + AsyncStorage |
| **Network Layer** | Send audio to server, receive parsed responses | tRPC client |
| **AI Pipeline (server)** | Transcribe audio, parse intent, generate response | Whisper + invokeLLM |
| **Audio Storage (server)** | Temporarily store audio for transcription | S3 via storagePut |
| **Preferences** | Store user settings locally | AsyncStorage |

---

## TWO — Complete User Flow

### What follows is a step-by-step walkthrough of every interaction, described as if to a blind user who has never used the app.

---

### First Open — Audio Onboarding

**State: App launches for the first time.**

The splash screen displays briefly (visual only — irrelevant to the user). The moment the app is ready, the user hears:

> *Three gentle ascending tones play — a warm audio signature.*

> **"Welcome to Iris. I'm your voice assistant for email, messages, and communication. Everything in this app works by voice. You'll never need to look at the screen."**

*A medium haptic pulse confirms the app is alive.*

> **"Let's get you set up. This will take about two minutes. I'll walk you through everything by voice."**

> **"First, I need permission to use your microphone so I can hear you. You should feel a system prompt appear now. Please tap Allow."**

*The app requests microphone permission. The system dialog appears. VoiceOver will read it. The user taps Allow.*

If the user grants permission:
> *Success haptic.*
> **"Microphone access granted. I can hear you now."**

If the user denies permission:
> *Error haptic.*
> **"I wasn't able to get microphone access. Without it, I can't hear your voice commands. You can grant it later in your phone's Settings app under Iris. For now, I'll continue the setup."**

> **"Next: how this app works. The entire screen is one big button. Tap anywhere to start talking. Tap again to stop. I'll listen, understand what you want, and do it."**

> **"There's one physical button in the bottom-right corner of your screen. It switches between two modes."**

> **"Mode one is Voice Mode. This is for quick commands. Say things like 'read my emails' or 'send a message to Sarah.' I'll do it and confirm."**

> **"Mode two is Assistant Mode. This is for conversation. Ask me anything. 'Summarise my week.' 'Help me write a reply.' 'What did I miss today?' I'll think and respond."**

> **"You're currently in Voice Mode. Tap the bottom-right button anytime to switch. You'll feel a haptic pulse and I'll tell you which mode you're in."**

> **"One more thing. I will never send a message or email without asking you to confirm first. You'll always hear what I'm about to send, and you'll say 'yes' or 'send it' to confirm. Your words, your control."**

> **"That's it. You're ready. Tap anywhere to start."**

*The onboarding flag is saved to AsyncStorage. This flow never plays again.*

---

### Daily Use — Voice Mode

**State: App is open. Voice Mode is active. Screen is a single tap target.**

The user taps anywhere on the screen.

*Light haptic pulse. A short low tone plays — recording has started.*

The user speaks: **"Do I have any new emails?"**

The user taps anywhere again (or lifts their finger after a hold, or waits for silence detection).

*Light haptic pulse. A short high tone plays — recording has stopped. Processing begins.*

Behind the scenes:
1. Audio is uploaded to S3 via the server.
2. Whisper transcribes: "Do I have any new emails?"
3. LLM parses intent: `{ action: "check_email", scope: "new", filter: null }`
4. Since email integration is not yet connected in V1, the assistant responds honestly.

The user hears:

> **"Email integration isn't connected yet. In this version, I can help you compose messages, have conversations, and practice using voice commands. Email access is coming in the next update."**

*Info haptic pulse.*

---

### Daily Use — Composing a Message (Voice Mode)

The user taps the screen.

*Recording tone.*

**"Send a message to Sarah. Tell her I'll be at the restaurant at 7."**

*Stop tone. Processing.*

The LLM parses: `{ action: "compose_message", recipient: "Sarah", content: "I'll be at the restaurant at 7" }`

> **"Here's what I'll send to Sarah:"**
> **"I'll be at the restaurant at 7."**

*Heavy haptic — confirmation required.*

> **"Say 'send it' to confirm, or 'change it' to edit."**

The user taps and says: **"Send it."**

> *Success haptic.*
> **"Message ready. Since messaging integration isn't connected yet, I've saved this as a draft you can copy. In the next update, this will send directly."**

---

### Daily Use — Assistant Mode

The user taps the mode toggle button (bottom-right corner).

*Medium haptic pulse.*

> **"Assistant Mode."**

The user taps the screen.

*Recording tone.*

**"Help me write a professional email declining a job offer. I want to be polite but firm."**

*Stop tone. Processing.*

The LLM receives this as a conversational request and generates a response:

> **"Here's a draft for you:"**
> **"Dear [Hiring Manager], Thank you for extending the offer for the [Position] role. After careful consideration, I've decided to pursue a different opportunity that more closely aligns with my current career goals. I truly appreciate the time you and your team invested in the interview process, and I have great respect for the work being done at [Company]. I wish you and the team continued success. Warm regards, [Your Name]."**

*Light haptic.*

> **"Would you like me to change anything?"**

The user taps: **"Make it shorter. And less formal."**

> **"Here's the shorter version:"**
> **"Hi [Name], Thanks so much for the offer. After thinking it over, I've decided to go in a different direction. I really enjoyed meeting the team and learning about the role. Wishing you all the best. [Your Name]."**

> **"Want me to adjust anything else, or is this good?"**

---

### Mode Toggle Interaction

At any time, the user can reach to the bottom-right corner and tap the toggle button.

*Medium haptic pulse.*

If switching to Voice Mode:
> **"Voice Mode."**

If switching to Assistant Mode:
> **"Assistant Mode."**

The toggle is a fixed-position button. It is the only element on the screen besides the full-screen tap target. It is 80x80 points — large enough to find by touch. It has a distinct raised feel (elevation/shadow on Android, though this is visual — the haptic is what matters).

---

### Error Handling — Every Error Speaks

**Network error:**
> *Error haptic.*
> **"I couldn't reach the server. Please check your internet connection and try again."**

**Microphone not available:**
> *Error haptic.*
> **"I can't access your microphone right now. Another app might be using it. Please close other apps and try again."**

**Transcription failed:**
> *Error haptic.*
> **"I didn't catch that. Could you try again? Speak clearly and a bit closer to the phone."**

**Server error:**
> *Error haptic.*
> **"Something went wrong on my end. I'm sorry about that. Please try again in a moment."**

**Recording too short:**
> *Warning haptic.*
> **"That was too short for me to understand. Tap and hold, then speak your command."**

**Recording too long (over 60 seconds):**
> *Warning haptic.*
> **"I stopped recording after 60 seconds. For longer messages, try breaking them into parts."**

Every single error has a `spoken_message` field in the response. No silent failures. Ever.

---

### App Backgrounding and Resuming

When the app returns from background:

*Light haptic.*

> **"Iris is ready."**

If the app was in Voice Mode, it stays in Voice Mode. If it was in Assistant Mode, it stays in Assistant Mode. State is preserved.

---

### Accessibility Announcement Layer

In addition to our own TTS, the app sets `accessibilityLabel` and `accessibilityHint` on every element for VoiceOver/TalkBack compatibility:

- Full-screen tap target: `accessibilityLabel="Tap anywhere to speak"`, `accessibilityHint="Double tap to start recording your voice command"`
- Mode toggle: `accessibilityLabel="Switch mode"`, `accessibilityHint="Currently in [Voice/Assistant] Mode. Double tap to switch."`

This ensures that even if the user has VoiceOver running (which most blind users do), the app works correctly with it rather than fighting it.

---

## THREE — V1 Feature List

### What Is In

| Feature | Why (Research Basis) |
|---------|---------------------|
| **Full-screen single tap target** | Non-negotiable requirement. Research shows gestures are the most fragile interaction for blind users. One tap to start, one tap to stop. |
| **Voice Mode (quick commands)** | Research shows blind users need transactional voice commands for daily tasks. "Read my emails" / "Send a message" pattern. |
| **Assistant Mode (AI conversation)** | Research shows blind users need help composing messages, understanding content, and thinking through communication tasks. |
| **Physical mode toggle (bottom-right)** | Non-negotiable. Fixed position, always findable. Research: gestures break, buttons don't. |
| **Audio-first onboarding** | Non-negotiable. Research: "What onboarding failures cause abandonment" — any visual dependency causes abandonment. Full voice walkthrough, no screen required. |
| **Server-side Whisper STT** | Research: dictation errors are the #1 frustration. Whisper is the most accurate STT available, especially for diverse accents. |
| **LLM intent parsing** | Research: natural language commands ("send a message to Sarah saying I'll be late") require LLM-level understanding, not keyword matching. |
| **LLM conversational AI** | Research: blind users need help composing professional emails, understanding complex messages, summarising conversations. |
| **Native TTS (expo-speech)** | Research: latency is critical. Native TTS has zero network latency. Quality is sufficient for V1. |
| **Haptic feedback on every state change** | Research: blind users rely on tactile confirmation. Every tap, every mode switch, every success, every error produces a distinct haptic. |
| **Spoken error messages (every error)** | Non-negotiable. Research: "Blind users cannot see error messages." Every error has a spoken_message field. |
| **Voice confirmation before sending** | Non-negotiable. Trust and safety requirement. User always hears what will be sent and confirms by voice. |
| **Message composition by voice** | Research: composing messages is a core daily task. V1 allows composing and refining messages by voice with AI assistance. |
| **Email drafting by voice** | Research: email is the single largest daily time burden. V1 allows drafting emails with AI assistance. |
| **Keep screen awake during use** | Research: blind users cannot see if the screen has turned off. Screen stays on while the app is active. |
| **Dark background (high contrast)** | Research: many VI users have some residual vision. Dark background with high-contrast text for the minimal visual elements (mode indicator). |
| **VoiceOver/TalkBack compatibility** | Research: most blind users have screen readers running. The app must work with them, not against them. Proper accessibilityLabel on all elements. |
| **Conversation history (in-session)** | The AI remembers context within a session. "Make it shorter" works because it remembers the previous draft. |
| **Audio signature sounds** | Distinct tones for: recording start, recording stop, success, error, mode switch. Blind users identify app state by sound. |
| **Preferences: speech rate, voice** | Research: blind users have strong preferences for TTS speed and voice. Configurable via voice command ("speak faster" / "speak slower"). |

### What Is Out (and Why)

| Feature | Why It Is Out |
|---------|---------------|
| **Gmail API integration** | Requires OAuth flow that is complex to make fully accessible in V1. The AI can help compose emails; actual sending/reading requires Gmail integration in V2. |
| **iMessage/SMS integration** | Apple does not allow third-party apps to read or send iMessages. SMS requires native module. Out for V1, in for V2 via share sheet / clipboard integration. |
| **WhatsApp integration** | WhatsApp does not offer a consumer API. Out entirely until WhatsApp opens access. |
| **Phone call management** | Requires native call kit integration. Complex, out for V1. |
| **Voicemail transcription** | Requires carrier-level access. Out for V1. |
| **Image description** | Research shows 9/10 severity, but requires multimodal AI pipeline (camera + LLM vision). V2 feature. |
| **Group chat summarisation** | Requires integration with messaging platforms. Out for V1. |
| **Notification management** | Requires system-level notification access. Out for V1. |
| **User accounts / login** | V1 is a local-first app. No account required. No data stored on server. This is a deliberate trust decision. |
| **Cross-device sync** | No accounts means no sync. Out for V1. |
| **Offline mode** | STT and LLM require server. Offline mode would require on-device models. Out for V1. |
| **Multiple languages** | V1 is English-only. Research shows the primary market is US/UK/Canada/Australia. Internationalisation in V2. |
| **Braille display support** | Niche hardware. Out for V1. |
| **Custom wake word** | "Hey Iris" would require always-on listening, which drains battery and raises privacy concerns. Out for V1. Tap-to-talk is the interaction model. |

### The V1 Value Proposition

V1 is not a full communication platform. It is an **AI voice assistant for composing and refining communications**. A blind user can:

1. Tap anywhere, speak naturally, and have their words understood.
2. Compose messages and emails by voice with AI assistance.
3. Refine drafts conversationally ("make it shorter", "more professional", "add that I'll bring dessert").
4. Get help with any communication task through natural conversation.
5. Do all of this without seeing the screen once.

This is the foundation. V2 adds the integrations (Gmail, SMS, notifications) that turn it into the full intent-based communication layer the research describes. But V1 must be flawless at what it does — voice interaction, AI assistance, and message composition — before adding complexity.

The research is clear: *"The first communication app designed for you — not retrofitted for you."* V1 delivers on that promise for the composition and conversation use case. V2 delivers it for the full communication stack.

---

### Technical Implementation Summary

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | React Native + Expo SDK 54 | Cross-platform, mature accessibility support |
| Routing | Expo Router 6 | Single screen app — minimal routing needed |
| Styling | NativeWind (Tailwind) | Minimal visual UI, but consistent theming |
| TTS | expo-speech | Zero latency, native quality, no API key needed |
| Recording | expo-audio | Cross-platform recording, HIGH_QUALITY preset |
| Haptics | expo-haptics | Native haptic engine access |
| Screen wake | expo-keep-awake | Prevent screen sleep during active use |
| STT | Whisper via server (transcribeAudio) | Best accuracy, accent support |
| Intent parsing | invokeLLM (server) | Natural language understanding |
| Conversation | invokeLLM (server) | Conversational AI for assistant mode |
| Audio storage | S3 via storagePut (server) | Temporary audio storage for transcription |
| Local storage | AsyncStorage | Preferences, onboarding state |
| API layer | tRPC | Type-safe client-server communication |
| State management | React Context + useReducer | Simple, no external dependencies |
