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

// Email templates
function getEmailContent(template: string, params: Record<string, string>): { subject: string; html: string } {
  switch (template) {
    case "invite":
      return {
        subject: "Your Health Goals - YourGP Care Plan",
        html: `
          <p>Dear Patient,</p>
          <p>As part of your care planning, we'd like to understand your health goals better.</p>
          <p>Please click the link below to complete a short questionnaire about your health goals:</p>
          <p><a href="${params.formUrl}" style="color: #667eea; font-weight: bold;">Complete Your Health Goals Questionnaire</a></p>
          <p>This will help us create a personalised care plan that focuses on what matters most to you.</p>
          <p>If you have any questions, please contact the practice.</p>
          <p>Kind regards,<br>YourGP Care Team</p>
        `
      };

    case "reminder":
      return {
        subject: "Reminder: Your Health Goals Questionnaire - YourGP",
        html: `
          <p>Dear Patient,</p>
          <p>This is a friendly reminder that we're waiting for you to complete your health goals questionnaire.</p>
          <p>Please click the link below to complete the short questionnaire:</p>
          <p><a href="${params.formUrl}" style="color: #667eea; font-weight: bold;">Complete Your Health Goals Questionnaire</a></p>
          <p>Completing this helps us create a personalised care plan focused on what matters most to you.</p>
          <p>If you have any questions, please contact the practice.</p>
          <p>Kind regards,<br>YourGP Care Team</p>
        `
      };

    case "care_plan":
      return {
        subject: "Your Care Plan - YourGP",
        html: `
          <p>Dear Patient,</p>
          <p>Thank you for completing your health goals questionnaire. Your personalised care plan has been prepared and is included below.</p>
          <p>Please review this plan and bring it to your upcoming telehealth consultation with your GP.</p>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <div style="font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.6; background: #f9fafb; padding: 20px; border-radius: 8px;">
            ${params.carePlanHtml}
          </div>
          <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
          <p>If you have any questions about your care plan, please discuss them with your GP during your consultation.</p>
          <p>Kind regards,<br>YourGP Care Team</p>
        `
      };

    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patientEmail, patientFormUrl, patientId, template, carePlanText } = await req.json();

    if (!patientEmail) {
      return new Response(
        JSON.stringify({ error: "Patient email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine template to use (default: invite for backward compatibility)
    const emailTemplate = template || "invite";

    // Build template params
    const params: Record<string, string> = {
      formUrl: patientFormUrl || "",
    };

    if (emailTemplate === "care_plan" && carePlanText) {
      params.carePlanHtml = carePlanText
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
    }

    const { subject, html } = getEmailContent(emailTemplate, params);

    // Get access token
    const accessToken = await getGraphAccessToken();

    // Send email via Microsoft Graph API
    const senderEmail = "noreply@ygp.au";
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

    const emailBody = {
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: html
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
      JSON.stringify({ success: true, template: emailTemplate }),
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
