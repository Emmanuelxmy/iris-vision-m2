/**
 * Gmail API service — all calls go through the server so tokens are never
 * exposed in client-side code.
 *
 * Token lifecycle:
 * - Access token is obtained by the client via Google OAuth web flow
 * - Client sends the token to the server per-request (Authorization header pattern)
 * - Server uses the token to call Gmail API
 * - If token is expired, server returns a specific error code so the client
 *   can prompt the sighted helper to re-authenticate
 */

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  isUnread: boolean;
}

export interface GmailError {
  code: "UNAUTHORIZED" | "QUOTA_EXCEEDED" | "NOT_FOUND" | "NETWORK_ERROR";
  spoken_message: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseEmailAddress(raw: string): { name: string; email: string } {
  const match = raw.match(/^"?([^"<]+)"?\s*<?([^>]*)>?$/);
  if (match) {
    return {
      name: match[1].trim() || match[2].trim(),
      email: match[2].trim() || match[1].trim(),
    };
  }
  return { name: raw, email: raw };
}

function decodeBase64Url(str: string): string {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    return decoded;
  } catch {
    return "";
  }
}

function extractBody(payload: GmailPayload): string {
  // Try plain text first
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Search parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to HTML if no plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        // Strip HTML tags for TTS
        return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    // Recurse into multipart
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }

  return "";
}

interface GmailPayload {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
  headers?: { name: string; value: string }[];
}

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
}

async function gmailFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${GMAIL_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { ok: res.ok, status: res.status, data };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a list of unread emails (up to maxResults).
 */
export async function getUnreadEmails(
  accessToken: string,
  maxResults = 10
): Promise<GmailMessage[] | GmailError> {
  try {
    // List unread message IDs
    const listRes = await gmailFetch(
      `/messages?q=is:unread&maxResults=${maxResults}&labelIds=INBOX`,
      accessToken
    );

    if (!listRes.ok) {
      if (listRes.status === 401) {
        return {
          code: "UNAUTHORIZED",
          spoken_message:
            "Your Gmail connection has expired. Please ask your helper to sign in to Gmail again in the Assistant Setup screen.",
        };
      }
      return {
        code: "NETWORK_ERROR",
        spoken_message: "I couldn't reach Gmail right now. Please check your internet connection and try again.",
      };
    }

    const listData = listRes.data as { messages?: { id: string }[] };
    const messageIds = listData.messages || [];

    if (messageIds.length === 0) {
      return [];
    }

    // Fetch each message (metadata only for the list)
    const messages = await Promise.all(
      messageIds.slice(0, maxResults).map(async ({ id }) => {
        const msgRes = await gmailFetch(
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          accessToken
        );

        if (!msgRes.ok) return null;

        const msg = msgRes.data as {
          id: string;
          threadId: string;
          labelIds?: string[];
          snippet?: string;
          payload?: { headers?: { name: string; value: string }[] };
          internalDate?: string;
        };

        const headers = msg.payload?.headers || [];
        const fromRaw = getHeader(headers, "From");
        const { name: fromName, email: fromEmail } = parseEmailAddress(fromRaw);
        const subject = getHeader(headers, "Subject") || "(no subject)";
        const dateStr = getHeader(headers, "Date");

        return {
          id: msg.id,
          threadId: msg.threadId,
          from: fromEmail,
          fromName: fromName || fromEmail,
          subject,
          snippet: msg.snippet || "",
          body: "",
          date: dateStr,
          isUnread: (msg.labelIds || []).includes("UNREAD"),
        } as GmailMessage;
      })
    );

    return messages.filter((m): m is GmailMessage => m !== null);
  } catch (error) {
    console.error("Gmail getUnreadEmails error:", error);
    return {
      code: "NETWORK_ERROR",
      spoken_message: "I couldn't reach Gmail right now. Please check your internet connection and try again.",
    };
  }
}

/**
 * Get the full body of a specific email.
 */
export async function getEmailBody(
  accessToken: string,
  messageId: string
): Promise<{ body: string; subject: string; fromName: string } | GmailError> {
  try {
    const res = await gmailFetch(`/messages/${messageId}?format=full`, accessToken);

    if (!res.ok) {
      if (res.status === 401) {
        return {
          code: "UNAUTHORIZED",
          spoken_message:
            "Your Gmail connection has expired. Please ask your helper to sign in to Gmail again.",
        };
      }
      return {
        code: "NOT_FOUND",
        spoken_message: "I couldn't find that email. It may have been deleted.",
      };
    }

    const msg = res.data as {
      payload?: GmailPayload & { headers?: { name: string; value: string }[] };
    };

    const headers = msg.payload?.headers || [];
    const fromRaw = getHeader(headers, "From");
    const { name: fromName } = parseEmailAddress(fromRaw);
    const subject = getHeader(headers, "Subject") || "(no subject)";
    const body = msg.payload ? extractBody(msg.payload) : "";

    return {
      body: body || msg.payload?.body?.data ? decodeBase64Url(msg.payload?.body?.data || "") : "(empty email)",
      subject,
      fromName: fromName || "Unknown sender",
    };
  } catch (error) {
    console.error("Gmail getEmailBody error:", error);
    return {
      code: "NETWORK_ERROR",
      spoken_message: "I couldn't load that email. Please try again.",
    };
  }
}

/**
 * Send an email via Gmail.
 */
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
): Promise<{ success: true; messageId: string } | GmailError> {
  try {
    // Build RFC 2822 message
    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "MIME-Version: 1.0",
      "",
      body,
    ];
    const raw = emailLines.join("\r\n");
    const encodedEmail = Buffer.from(raw).toString("base64url");

    const payload: { raw: string; threadId?: string } = { raw: encodedEmail };
    if (threadId) payload.threadId = threadId;

    const res = await gmailFetch("/messages/send", accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 401) {
        return {
          code: "UNAUTHORIZED",
          spoken_message:
            "Your Gmail connection has expired. Please ask your helper to sign in to Gmail again.",
        };
      }
      return {
        code: "NETWORK_ERROR",
        spoken_message: "I couldn't send that email. Please check your internet connection and try again.",
      };
    }

    const sent = res.data as { id: string };
    return { success: true, messageId: sent.id };
  } catch (error) {
    console.error("Gmail sendEmail error:", error);
    return {
      code: "NETWORK_ERROR",
      spoken_message: "Something went wrong sending that email. Please try again.",
    };
  }
}

/**
 * Get the Gmail profile (email address) for the signed-in user.
 */
export async function getGmailProfile(
  accessToken: string
): Promise<{ email: string; name?: string } | GmailError> {
  try {
    const res = await gmailFetch("/profile", accessToken);

    if (!res.ok) {
      if (res.status === 401) {
        return {
          code: "UNAUTHORIZED",
          spoken_message: "Gmail sign-in has expired. Please sign in again.",
        };
      }
      return {
        code: "NETWORK_ERROR",
        spoken_message: "Couldn't verify Gmail connection.",
      };
    }

    const profile = res.data as { emailAddress: string };
    return { email: profile.emailAddress };
  } catch {
    return {
      code: "NETWORK_ERROR",
      spoken_message: "Couldn't verify Gmail connection.",
    };
  }
}

/**
 * Search contacts/sent mail to find an email address for a name.
 * Used when user says "send email to Sarah".
 */
export async function findEmailByName(
  accessToken: string,
  name: string
): Promise<{ email: string; displayName: string }[] | GmailError> {
  try {
    // Search sent mail for emails to this person
    const res = await gmailFetch(
      `/messages?q=${encodeURIComponent(`to:${name}`)}&maxResults=5&labelIds=SENT`,
      accessToken
    );

    if (!res.ok) {
      if (res.status === 401) {
        return {
          code: "UNAUTHORIZED",
          spoken_message: "Your Gmail connection has expired. Please sign in again.",
        };
      }
      return [];
    }

    const listData = res.data as { messages?: { id: string }[] };
    const messageIds = listData.messages || [];

    if (messageIds.length === 0) return [];

    // Get the first message to extract the To header
    const msgRes = await gmailFetch(
      `/messages/${messageIds[0].id}?format=metadata&metadataHeaders=To`,
      accessToken
    );

    if (!msgRes.ok) return [];

    const msg = msgRes.data as {
      payload?: { headers?: { name: string; value: string }[] };
    };

    const toHeader = getHeader(msg.payload?.headers || [], "To");
    if (!toHeader) return [];

    // Parse multiple recipients
    const recipients = toHeader.split(",").map((r) => {
      const { name: displayName, email } = parseEmailAddress(r.trim());
      return { email, displayName: displayName || email };
    });

    // Filter to those matching the name
    const nameLower = name.toLowerCase();
    const matches = recipients.filter(
      (r) =>
        r.displayName.toLowerCase().includes(nameLower) ||
        r.email.toLowerCase().includes(nameLower)
    );

    return matches.length > 0 ? matches : recipients;
  } catch {
    return [];
  }
}
