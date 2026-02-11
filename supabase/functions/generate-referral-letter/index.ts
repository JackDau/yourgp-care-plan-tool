import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_PROVIDERS = [
  "Physiotherapist",
  "Dietitian",
  "Podiatrist",
  "Psychologist",
  "Exercise Physiologist",
  "Diabetes Educator",
  "Occupational Therapist",
  "Speech Pathologist",
  "Mental Health Social Worker",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patientUuid, providerType } = await req.json();

    if (!patientUuid || !providerType) {
      return new Response(
        JSON.stringify({ error: "Patient UUID and provider type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPPORTED_PROVIDERS.includes(providerType)) {
      return new Response(
        JSON.stringify({ error: `Unsupported provider type. Supported: ${SUPPORTED_PROVIDERS.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch patient data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select(`
        id, patient_id, health_summary, conditions, gp_name, site,
        submissions (
          goals, care_plan_text
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
    const gpName = patient.gp_name || "the GP";
    const siteName = patient.site || "YourGP";

    // Build prompt for referral letter
    const systemPrompt = `You are a clinical documentation assistant for Australian general practice.

Write the clinical body of a referral from ${gpName} at YourGP ${siteName} to a ${providerType}.

Requirements:
- Australian medical conventions and spelling
- Reference the patient's conditions and relevant clinical details
- State the reason for referral and specific goals from the care plan
- Reference the GPCCMP (Medicare Item 965) care plan
- Concise and professional (half a page)
- Use Patient ID only - no patient name, DOB, or Medicare number

Format rules:
- Do NOT include any letterhead, practice address, phone/fax/email
- Do NOT include To/From/Re/Date header fields
- Do NOT include [Patient Name], [DOB], [Medicare Number] placeholders
- Start directly with the clinical content (e.g. "I am writing to refer...")
- End with the GP's name as signoff`;

    let userMessage = `Generate a referral letter to a ${providerType} for patient (ID: ${patient.patient_id}).

Patient conditions: ${(patient.conditions || []).join(", ")}

Health summary:
${patient.health_summary || "Not available"}`;

    if (submission?.goals) {
      userMessage += `

Patient's own health goals:
${JSON.stringify(submission.goals, null, 2)}`;
    }

    if (submission?.care_plan_text) {
      userMessage += `

Relevant care plan excerpt (focus on ${providerType}-relevant sections):
${submission.care_plan_text.substring(0, 2000)}`;
    }

    // Generate referral letter using Claude
    const client = new Anthropic();

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    const referralLetter = message.content[0].type === "text"
      ? message.content[0].text
      : "Error generating referral letter";

    // Save referral letter to database
    await supabase.from("referral_letters").insert({
      patient_uuid: patientUuid,
      provider_type: providerType,
      letter_content: referralLetter,
      generated_by_gp: gpName,
    });

    return new Response(
      JSON.stringify({
        referralLetter,
        providerType,
        patientId: patient.patient_id,
        gpName,
        site: patient.site,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
