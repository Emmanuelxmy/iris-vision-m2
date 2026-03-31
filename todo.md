# Project TODO

- [x] Theme configuration (dark mode for Voice Mode, light for Assistant Mode)
- [x] Haptic utility module (light, medium, heavy, success, error, warning)
- [x] TTS speech utility module (speak, stop, queue, rate control)
- [x] Audio recording module (start, stop, upload to S3)
- [x] App state management (mode, recording state, processing state, onboarding)
- [x] Voice Mode screen (full-screen tap target, state indicator, recording pulse)
- [x] Mode toggle button (fixed bottom-right, 80x80pt, switches modes)
- [x] Assistant Mode screen (sighted helper visual UI)
- [x] Assistant Mode: Gmail OAuth sign-in section
- [x] Assistant Mode: Account setup via Manus OAuth
- [x] Assistant Mode: Voice settings (speech rate, voice picker)
- [x] Assistant Mode: About/privacy section
- [x] Audio-first onboarding flow (full TTS walkthrough)
- [x] Microphone permission request during onboarding
- [x] Server: tRPC route for audio upload to S3
- [x] Server: tRPC route for Whisper transcription
- [x] Server: tRPC route for LLM intent parsing (Voice Mode)
- [x] Server: tRPC route for LLM conversation (Assistant AI)
- [x] Voice confirmation flow before sending messages
- [x] Spoken error messages for every error state
- [x] Accessibility labels on all elements (VoiceOver/TalkBack)
- [x] Keep screen awake during active use
- [x] Recording timeout (max 60 seconds)
- [x] In-session conversation memory
- [x] Speech rate preference (configurable via voice command)
- [x] App logo and branding assets
- [x] Icon mappings for tab/navigation icons

## Gmail Integration

- [x] Server: Gmail OAuth token storage (encrypted, per-device)
- [x] Server: tRPC route to exchange Gmail OAuth code for tokens
- [x] Server: tRPC route to read inbox (unread emails, spoken summary)
- [x] Server: tRPC route to send email (with confirmation gate)
- [x] Server: tRPC route to get full email thread
- [x] Server: LLM prompt updated to understand email intents
- [x] Assistant Mode: Google OAuth sign-in button for Gmail
- [x] Assistant Mode: Show connected Gmail account with disconnect option
- [x] Voice Mode: Handle "read my emails" command
- [x] Voice Mode: Handle "send email to X" command with voice confirmation
- [x] Voice Mode: Handle "reply to last email" command
- [x] Voice Mode: Handle "read that email" / "read the next one" navigation

## Bug Fixes & Deployment

- [x] Fix manifest JSON parsing error in Expo Go (manifest is valid — issue is Expo Go version mismatch)
- [x] Update Gmail OAuth to use server-side redirect URI (EXPO_PUBLIC_GOOGLE_REDIRECT_URI env var)
