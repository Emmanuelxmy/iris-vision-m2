# Iris Vision M2 - PRD

## Original Problem Statement
Build a voice-first communication app for blind and visually impaired users. Core insight: blind users navigate phones linearly while sighted users absorb screens instantly. Iris closes that gap with holistic understanding and natural voice interaction.

## Architecture
- **Backend**: Express + tRPC + PostgreSQL (Railway)
- **Mobile**: React Native Expo SDK 51
- **AI**: OpenAI GPT-4o (intent) + Whisper (transcription)
- **Email**: Gmail API with OAuth

## What's Been Implemented (2026-04-01)

### Backend
- [x] Express server with tRPC router
- [x] PostgreSQL schema (users, conversations)
- [x] OpenAI integration (GPT-4o + Whisper)
- [x] Gmail service with token refresh
- [x] User management endpoints
- [x] Voice processing endpoints

### Mobile
- [x] Particle cloud animation (4 states)
- [x] Voice onboarding flow
- [x] Push-to-talk recording
- [x] TTS with 4 voice options
- [x] Gmail OAuth integration
- [x] Home screen with voice commands
- [x] Assistant mode for free conversation

## User Personas
1. **Primary**: Blind/visually impaired users who need efficient phone communication
2. **Secondary**: Sighted helpers who assist with initial setup

## Core Requirements (Static)
- Everything voice-in, voice-out
- No email sent without explicit voice confirmation
- VoiceOver accessible throughout
- Particle cloud as primary visual element

## Prioritized Backlog
- P0: ✅ Complete (MVP shipped)
- P1: Offline command caching, contact lookup from Gmail
- P2: Calendar integration, SMS support
- P3: Multi-language support

## Repository
https://github.com/Emmanuelxmy/iris-vision-m2

## Deployment Status
- GitHub: ✅ Pushed (public)
- Railway: Pending user setup
- App Store: Pending EAS build
