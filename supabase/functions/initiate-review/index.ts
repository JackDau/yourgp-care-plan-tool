import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    throw new Error("MS365 credentials not configured.");
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
    const { patientUuid } = await req.json();

    if (!patientUuid) {
      return new Response(
        JSON.stringify({ error: "Patient UUID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch patient + latest submission
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select(`
        id,
        patient_id,
        patient_email,
        conditions,
        gp_name,
        site,
        health_summary,
        submissions (
          id,
          goals,
          care_plan_text
        )
      `)
      .eq("id", patientUuid)
      .single();

    if (patientError || !patient) {
      return new Response(
        JSON.stringify({ error: "Patient not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const submission = patient.submissions?.[0];
    if (!submission?.goals) {
      return new Response(
        JSON.stringify({ error: "No goals found for this patient" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count existing reviews to set review_number
    const { count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("patient_uuid", patientUuid);

    const reviewNumber = (count || 0) + 1;

    // Build goal summaries for Claude prompt
    const goalSummaries: string[] = [];
    for (const section of submission.goals) {
      if (section.answers) {
        for (const [question, answer] of Object.entries(section.answers)) {
          if (answer && typeof answer === "string" && answer.trim()) {
            goalSummaries.push(`- Question: "${question}"\n  Patient's answer: "${answer}"`);
          }
        }
      }
    }

    // Call Claude to generate progress questions
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a friendly health care assistant for YourGP, an Australian general practice.

Your task is to generate progress review questions based on a patient's original SMART health goals. Each question should:
- Reference what the patient originally said they wanted to achieve
- Ask specifically about their progress in a warm, encouraging tone
- Be open-ended so the patient can share details about what's working and what isn't
- Use Australian English spelling

Return a JSON array of objects with this structure:
[
  {
    "originalGoal": "The patient's original goal answer (verbatim)",
    "originalQuestion": "The original question that was asked",
    "progressQuestion": "Your progress review question"
  }
]

Return ONLY the JSON array, no markdown formatting or code blocks.`,
      messages: [{
        role: "user",
        content: `Generate progress review questions for review #${reviewNumber} based on these patient goals:\n\n${goalSummaries.join("\n\n")}`
      }]
    });

    const questionsText = message.content[0].type === "text" ? message.content[0].text : "[]";
    let reviewQuestions;
    try {
      reviewQuestions = JSON.parse(questionsText);
    } catch {
      console.error("Failed to parse questions JSON:", questionsText);
      return new Response(
        JSON.stringify({ error: "Failed to generate review questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create review record
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .insert({
        patient_uuid: patientUuid,
        submission_uuid: submission.id,
        review_number: reviewNumber,
        review_questions: reviewQuestions,
      })
      .select("id")
      .single();

    if (reviewError) {
      throw reviewError;
    }

    // Build review form URL
    const formBaseUrl = "https://jackdau.github.io/yourgp-care-plan-tool/patient-form.html";
    const reviewFormUrl = `${formBaseUrl}?review=${review.id}`;

    // Build goals summary for email
    const goalsList = goalSummaries.map(g => `<li style="margin-bottom: 8px;">${g.replace(/^- /, "").replace(/\n  /g, "<br>")}</li>`).join("");

    // Send email via MS Graph API
    const accessToken = await getGraphAccessToken();
    const senderEmail = "noreply@ygp.au";
    const graphUrl = `https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`;

    const emailBody = {
      message: {
        subject: "Time for Your Care Plan Review - YourGP",
        body: {
          contentType: "HTML",
          content: `
            <p>Dear Patient,</p>
            <p>It's time for your quarterly care plan review. We'd like to check in on how you're going with the health goals you set.</p>
            <p><strong>Your original goals:</strong></p>
            <ul>${goalsList}</ul>
            <p>Please click the link below to let us know how you've been tracking:</p>
            <p><a href="${reviewFormUrl}" style="color: #667eea; font-weight: bold;">Complete Your Progress Review</a></p>
            <p>This takes just a few minutes and helps your GP prepare for your upcoming care plan review.</p>
            <p>Kind regards,<br>YourGP Care Team</p>
          `
        },
        toRecipients: [
          { emailAddress: { address: patient.patient_email } }
        ]
      },
      saveToSentItems: false
    };

    const emailResponse = await fetch(graphUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(emailBody)
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.json();
      console.error("Email send error:", errorData);
    }

    // Update review email status
    await supabase
      .from("reviews")
      .update({
        review_email_sent: true,
        review_email_sent_at: new Date().toISOString(),
      })
      .eq("id", review.id);

    return new Response(
      JSON.stringify({
        success: true,
        reviewId: review.id,
        reviewNumber,
        questionsGenerated: reviewQuestions.length,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
