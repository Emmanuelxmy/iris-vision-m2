/**
 * Gmail OAuth token exchange endpoint.
 * This runs server-side so the client_secret is never exposed to the client.
 *
 * POST /api/gmail/token
 * Body: { code: string, redirectUri: string, clientId: string }
 * Response: { access_token, refresh_token, email }
 *
 * Required environment variable:
 * - GOOGLE_CLIENT_SECRET — set via webdev_request_secrets
 */

import type { Request, Response } from "express";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function handleGmailTokenExchange(req: Request, res: Response) {
  const { code, redirectUri, clientId } = req.body;

  if (!code || !redirectUri || !clientId) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: code, redirectUri, clientId",
    });
  }

  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    console.error("[Gmail] GOOGLE_CLIENT_SECRET is not set");
    return res.status(500).json({
      success: false,
      message: "Gmail integration is not configured. Please contact support.",
    });
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    const tokenData = await tokenResponse.json() as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[Gmail] Token exchange failed:", tokenData);
      return res.status(400).json({
        success: false,
        message: tokenData.error_description || "Failed to exchange authorization code.",
      });
    }

    // Get user's email address
    let email = "";
    try {
      const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResponse.json() as { email?: string };
      email = userInfo.email || "";
    } catch {
      // Email is optional — proceed without it
    }

    return res.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      email,
    });
  } catch (error) {
    console.error("[Gmail] Token exchange error:", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during sign-in.",
    });
  }
}
