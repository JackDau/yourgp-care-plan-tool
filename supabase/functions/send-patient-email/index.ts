import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Get Microsoft Graph access token using client credentials flow
async function getGraphAccessToken(): Promise<string> {
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
      grant_type: "client_credentials"
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to get access token: ${data.error_description || data.error}`);
  }

  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patientEmail, patientFormUrl, patientId } = await req.json();

    if (!patientEmail || !patientFormUrl) {
      return new Response(
        JSON.stringify({ error: "Patient email and form URL are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get access token
    const accessToken = await getGraphAccessToken();

    // Send email via Microsoft Graph API
    const senderEmail = "noreply@ygp.au";
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

    const emailBody = {
      message: {
        subject: "Your Health Goals - YourGP Care Plan",
        body: {
          contentType: "HTML",
          content: `
            <p>Dear Patient,</p>
            <p>As part of your care planning, we'd like to understand your health goals better.</p>
            <p>Please click the link below to complete a short questionnaire about your health goals:</p>
            <p><a href="${patientFormUrl}" style="color: #667eea; font-weight: bold;">Complete Your Health Goals Questionnaire</a></p>
            <p>This will help us create a personalised care plan that focuses on what matters most to you.</p>
            <p>If you have any questions, please contact the practice.</p>
            <p>Kind regards,<br>YourGP Care Team</p>
          `
        },
        toRecipients: [
          { emailAddress: { address: patientEmail } }
        ]
      },
      saveToSentItems: false
    };

    const response = await fetch(graphUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || "Failed to send email via Graph API");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
