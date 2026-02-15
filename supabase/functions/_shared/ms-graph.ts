import { SENDER_EMAIL } from "./config.ts";

// Get Microsoft Graph access token using client credentials flow
export async function getGraphAccessToken(): Promise<string> {
  const tenantId = Deno.env.get("MS365_TENANT_ID");
  const clientId = Deno.env.get("MS365_CLIENT_ID");
  const clientSecret = Deno.env.get("MS365_CLIENT_SECRET");

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("MS365 credentials not configured. Please set MS365_TENANT_ID, MS365_CLIENT_ID, and MS365_CLIENT_SECRET.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

// Send email via Microsoft Graph API
export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  htmlContent: string
): Promise<void> {
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${SENDER_EMAIL}/sendMail`;

  const emailBody = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: htmlContent,
      },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: false,
  };

  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(emailBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || "Failed to send email");
  }
}
