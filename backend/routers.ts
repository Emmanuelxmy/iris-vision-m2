import { z } from "zod";
import { COOKIE_NAME } from "./shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, router } from "./_core/trpc.js";
import { invokeLLM } from "./_core/llm.js";
import { transcribeAudio } from "./_core/voiceTranscription.js";
import { storagePut } from "./storage.js";
import {
  getUnreadEmails,
  getEmailBody,
  sendEmail,
  getGmailProfile,
  findEmailByName,
  type GmailMessage,
} from "./gmail.js";

// ─── System Prompt for Voice Mode (Intent Parsing) ──────────────────────────

const VOICE_MODE_SYSTEM_PROMPT = `You are Iris, a voice assistant for blind and visually impaired users. You process voice commands and respond in natural spoken language.

Your responses will be read aloud by text-to-speech, so:
- Write in natural spoken English, as if talking to someone
- Never use markdown, bullet points, links, or formatting
- Never use emoji or special characters
- Keep responses concise but warm
- Use contractions naturally (I'll, you're, that's)

For email reading requests ("read my emails", "check my email", "any new emails"):
- Set intent to "read_emails"
- Set needs_confirmation to false

For reading a specific email ("read that", "read the first one", "open it"):
- Set intent to "read_email_body"
- Set email_index to the number (0-based) if mentioned, or 0 for "that one" / "the first"
- Set needs_confirmation to false

For composing a new email ("send an email to X", "email X about Y"):
- Draft the email subject and body
- Always end by reading the draft and asking the user to confirm before sending
- Set intent to "compose_email"
- Set needs_confirmation to true
- Set recipient_name to the person's name as spoken

For replying to an email ("reply to that", "reply to X"):
- Draft a reply
- Always read it back and ask for confirmation
- Set intent to "reply_email"
- Set needs_confirmation to true
- Set email_index to 0 if replying to the last mentioned email

For navigating emails ("next email", "previous email", "skip that one"):
- Set intent to "navigate_email"
- Set direction to "next" or "previous"

For message/SMS composition:
- Set intent to "compose_message"
- Set needs_confirmation to true

For general questions or conversation:
- Respond helpfully and conversationally
- Set intent to "general_question"
- Set needs_confirmation to false

Always respond with valid JSON matching this structure:
{
  "spoken_response": "What you want to say to the user",
  "intent": "read_emails" | "read_email_body" | "compose_email" | "reply_email" | "navigate_email" | "compose_message" | "general_question" | "help" | "settings" | "unknown",
  "needs_confirmation": true | false,
  "draft_subject": "Email subject line if composing, or null",
  "draft_content": "The drafted message/email body if applicable, or null",
  "recipient_name": "The recipient name as spoken by the user, or null",
  "email_index": 0,
  "direction": "next" | "previous" | null
}`;

// ─── System Prompt for Assistant Mode (Conversational AI) ───────────────────

const ASSISTANT_AI_SYSTEM_PROMPT = `You are Iris, a warm and intelligent voice assistant for blind and visually impaired users. You are in conversation mode.

Your responses will be read aloud by text-to-speech, so:
- Write in natural spoken English, as if talking to a friend
- Never use markdown, bullet points, links, or formatting
- Never use emoji or special characters
- Be warm, patient, and helpful
- Use contractions naturally
- For long content, break into natural spoken paragraphs

You help with:
- Composing and refining messages and emails
- Answering questions
- Thinking through communication challenges
- General conversation and assistance

When helping compose messages:
- Read the draft aloud naturally
- Ask if they want changes
- Never send without explicit confirmation

Remember the full conversation context. If the user says "make it shorter" or "change the tone", refer back to the previous draft.`;

// ─── Email Summary Prompt ────────────────────────────────────────────────────

function buildEmailSummaryPrompt(emails: GmailMessage[]): string {
  if (emails.length === 0) {
    return "You have no unread emails in your inbox.";
  }

  const lines = emails.map((e, i) => {
    const num = i + 1;
    const from = e.fromName || e.from;
    const subject = e.subject || "(no subject)";
    const snippet = e.snippet ? ` — ${e.snippet.slice(0, 80)}` : "";
    return `Email ${num}: From ${from}. Subject: ${subject}${snippet}.`;
  });

  return `You have ${emails.length} unread email${emails.length === 1 ? "" : "s"}. ${lines.join(" ")} Say "read email one", "read email two", and so on to hear the full email. Or say "next email" to move through them.`;
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Voice Processing ─────────────────────────────────────────────────────

  voice: router({
    /** Upload audio to S3 and return the URL */
    uploadAudio: publicProcedure
      .input(
        z.object({
          audioBase64: z.string(),
          mimeType: z.string().default("audio/m4a"),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const buffer = Buffer.from(input.audioBase64, "base64");

          const sizeMB = buffer.length / (1024 * 1024);
          if (sizeMB > 16) {
            return {
              success: false as const,
              error: "Recording is too large.",
              spoken_message: "That recording was too large. Please try a shorter message.",
            };
          }

          const ext = input.mimeType.includes("wav")
            ? "wav"
            : input.mimeType.includes("webm")
            ? "webm"
            : "m4a";
          const key = `iris-audio/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { url } = await storagePut(key, buffer, input.mimeType);

          return { success: true as const, url };
        } catch (error) {
          console.error("Audio upload failed:", error);
          return {
            success: false as const,
            error: "Failed to upload audio",
            spoken_message: "I had trouble processing your recording. Please try again.",
          };
        }
      }),

    /** Transcribe audio from URL using Whisper */
    transcribe: publicProcedure
      .input(
        z.object({
          audioUrl: z.string(),
          language: z.string().optional().default("en"),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const result = await transcribeAudio({
            audioUrl: input.audioUrl,
            language: input.language,
          });

          if ("error" in result) {
            return {
              success: false as const,
              error: result.error,
              spoken_message:
                "I didn't catch that. Could you try again? Speak clearly and a bit closer to the phone.",
            };
          }

          return {
            success: true as const,
            text: result.text,
            language: result.language,
            duration: result.duration,
          };
        } catch (error) {
          console.error("Transcription failed:", error);
          return {
            success: false as const,
            error: "Transcription failed",
            spoken_message: "I had trouble understanding that. Could you try speaking again?",
          };
        }
      }),

    /** Process a voice command — parse intent and generate response */
    process: publicProcedure
      .input(
        z.object({
          text: z.string(),
          conversationHistory: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .optional()
            .default([]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const messages = [
            { role: "system" as const, content: VOICE_MODE_SYSTEM_PROMPT },
            ...input.conversationHistory.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user" as const, content: input.text },
          ];

          const response = await invokeLLM({
            messages,
            response_format: { type: "json_object" as const },
          });

          const content =
            typeof response.choices[0].message.content === "string"
              ? response.choices[0].message.content
              : JSON.stringify(response.choices[0].message.content);

          const parsed = JSON.parse(content);

          return {
            success: true as const,
            spoken_response:
              parsed.spoken_response ||
              "I'm not sure how to help with that. Could you try rephrasing?",
            intent: parsed.intent || "unknown",
            needs_confirmation: parsed.needs_confirmation || false,
            draft_subject: parsed.draft_subject || null,
            draft_content: parsed.draft_content || null,
            recipient_name: parsed.recipient_name || null,
            email_index: typeof parsed.email_index === "number" ? parsed.email_index : 0,
            direction: parsed.direction || null,
          };
        } catch (error) {
          console.error("Voice processing failed:", error);
          return {
            success: false as const,
            spoken_response:
              "Something went wrong on my end. I'm sorry about that. Please try again in a moment.",
            intent: "error",
            needs_confirmation: false,
            draft_subject: null,
            draft_content: null,
            recipient_name: null,
            email_index: 0,
            direction: null,
          };
        }
      }),

    /** Conversational AI chat */
    chat: publicProcedure
      .input(
        z.object({
          text: z.string(),
          conversationHistory: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .optional()
            .default([]),
        })
      )
      .mutation(async ({ input }) => {
        try {
          const messages = [
            { role: "system" as const, content: ASSISTANT_AI_SYSTEM_PROMPT },
            ...input.conversationHistory.map((m) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })),
            { role: "user" as const, content: input.text },
          ];

          const response = await invokeLLM({ messages });

          const content =
            typeof response.choices[0].message.content === "string"
              ? response.choices[0].message.content
              : Array.isArray(response.choices[0].message.content)
              ? response.choices[0].message.content
                  .filter(
                    (p): p is { type: "text"; text: string } =>
                      typeof p === "object" && "type" in p && p.type === "text"
                  )
                  .map((p) => p.text)
                  .join(" ")
              : "";

          return {
            success: true as const,
            spoken_response:
              content || "I'm not sure what to say. Could you try again?",
          };
        } catch (error) {
          console.error("Chat failed:", error);
          return {
            success: false as const,
            spoken_response:
              "Something went wrong on my end. I'm sorry about that. Please try again in a moment.",
          };
        }
      }),
  }),

  // ─── Gmail Integration ────────────────────────────────────────────────────

  gmail: router({
    /** Verify a Gmail access token and return the connected email address */
    verifyToken: publicProcedure
      .input(z.object({ accessToken: z.string() }))
      .mutation(async ({ input }) => {
        const result = await getGmailProfile(input.accessToken);
        if ("code" in result) {
          return {
            success: false as const,
            spoken_message: result.spoken_message,
          };
        }
        return {
          success: true as const,
          email: result.email,
        };
      }),

    /** Get unread emails — returns a spoken summary */
    getInbox: publicProcedure
      .input(
        z.object({
          accessToken: z.string(),
          maxResults: z.number().min(1).max(20).default(10),
        })
      )
      .mutation(async ({ input }) => {
        const result = await getUnreadEmails(input.accessToken, input.maxResults);

        if ("code" in result) {
          return {
            success: false as const,
            spoken_message: result.spoken_message,
            emails: [] as GmailMessage[],
          };
        }

        const spokenSummary = buildEmailSummaryPrompt(result);

        return {
          success: true as const,
          spoken_message: spokenSummary,
          emails: result,
        };
      }),

    /** Get the full body of a specific email */
    getEmailBody: publicProcedure
      .input(
        z.object({
          accessToken: z.string(),
          messageId: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await getEmailBody(input.accessToken, input.messageId);

        if ("code" in result) {
          return {
            success: false as const,
            spoken_message: result.spoken_message,
            body: null,
            subject: null,
            fromName: null,
          };
        }

        // Truncate very long emails for TTS
        const maxChars = 2000;
        const body =
          result.body.length > maxChars
            ? result.body.slice(0, maxChars) +
              "... The email continues but I've read the first part. Say 'continue' to hear more."
            : result.body;

        const spokenMessage = `Email from ${result.fromName}. Subject: ${result.subject}. ${body}`;

        return {
          success: true as const,
          spoken_message: spokenMessage,
          body: result.body,
          subject: result.subject,
          fromName: result.fromName,
        };
      }),

    /** Send an email — requires prior voice confirmation on the client */
    sendEmail: publicProcedure
      .input(
        z.object({
          accessToken: z.string(),
          to: z.string().email("Invalid email address"),
          subject: z.string().min(1),
          body: z.string().min(1),
          threadId: z.string().optional(),
          /** Client MUST set this to true — it proves the user confirmed by voice */
          userConfirmed: z.literal(true),
        })
      )
      .mutation(async ({ input }) => {
        // Double-check: userConfirmed must be true (enforced by z.literal(true))
        const result = await sendEmail(
          input.accessToken,
          input.to,
          input.subject,
          input.body,
          input.threadId
        );

        if ("code" in result) {
          return {
            success: false as const,
            spoken_message: result.spoken_message,
          };
        }

        return {
          success: true as const,
          spoken_message: `Your email to ${input.to} has been sent.`,
          messageId: result.messageId,
        };
      }),

    /** Find an email address for a contact name by searching sent mail */
    findContact: publicProcedure
      .input(
        z.object({
          accessToken: z.string(),
          name: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await findEmailByName(input.accessToken, input.name);

        if ("code" in result) {
          return {
            success: false as const,
            spoken_message: result.spoken_message,
            contacts: [] as { email: string; displayName: string }[],
          };
        }

        return {
          success: true as const,
          contacts: result,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
