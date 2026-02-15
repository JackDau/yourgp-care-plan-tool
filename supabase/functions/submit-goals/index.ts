import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, isValidUuid, errorResponse, jsonResponse } from "../_shared/config.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Create Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // GET - fetch patient questions for the form
  if (req.method === "GET") {
    const url = new URL(req.url);
    const patientUuid = url.searchParams.get("id");

    if (!patientUuid) {
      return errorResponse("Patient ID is required", 400);
    }

    if (!isValidUuid(patientUuid)) {
      return errorResponse("Invalid patient UUID format", 400);
    }

    const { data, error } = await supabase
      .from("patients")
      .select("id, patient_id, conditions, questions")
      .eq("id", patientUuid)
      .single();

    if (error || !data) {
      return errorResponse("Patient not found", 404);
    }

    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id")
      .eq("patient_uuid", patientUuid)
      .single();

    return jsonResponse({
      patientId: data.patient_id,
      conditions: data.conditions,
      questions: data.questions,
      alreadySubmitted: !!existingSubmission
    });
  }

  // POST - submit patient goals
  try {
    const { patientUuid, goals } = await req.json();

    if (!patientUuid || !goals) {
      return errorResponse("Patient UUID and goals are required", 400);
    }

    if (!isValidUuid(patientUuid)) {
      return errorResponse("Invalid patient UUID format", 400);
    }

    if (!Array.isArray(goals)) {
      return errorResponse("Goals must be an array", 400);
    }

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id, health_summary, conditions, site")
      .eq("id", patientUuid)
      .single();

    if (patientError || !patient) {
      return errorResponse("Invalid patient link", 404);
    }

    // Check for existing submission
    const { data: existing } = await supabase
      .from("submissions")
      .select("id")
      .eq("patient_uuid", patientUuid)
      .single();

    if (existing) {
      // Update existing submission
      const { error: updateError } = await supabase
        .from("submissions")
        .update({ goals, submitted_at: new Date().toISOString() })
        .eq("patient_uuid", patientUuid);

      if (updateError) {
        throw updateError;
      }
    } else {
      // Create new submission
      const { error: insertError } = await supabase
        .from("submissions")
        .insert({
          patient_uuid: patientUuid,
          goals
        });

      if (insertError) {
        throw insertError;
      }
    }

    // Cancel pending reminder jobs for this patient (they submitted)
    await supabase
      .from("scheduled_jobs")
      .update({ status: "cancelled" })
      .eq("patient_uuid", patientUuid)
      .eq("job_type", "patient_reminder")
      .eq("status", "pending");

    // AUTO-GENERATE care plan by calling the generate-care-plan function
    let carePlanGenerated = false;
    try {
      const generateResponse = await fetch(
        `${supabaseUrl}/functions/v1/generate-care-plan`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ patientUuid }),
        }
      );

      if (generateResponse.ok) {
        carePlanGenerated = true;

        // Schedule care plan email (1 hour delay)
        const emailTime = new Date();
        emailTime.setHours(emailTime.getHours() + 1);

        await supabase.from("scheduled_jobs").insert({
          job_type: "care_plan_email",
          patient_uuid: patientUuid,
          scheduled_for: emailTime.toISOString(),
          status: "pending",
          max_attempts: 3,
        });
      } else {
        console.error("Failed to auto-generate care plan:", await generateResponse.text());
      }
    } catch (genError) {
      console.error("Error auto-generating care plan:", genError);
      // Non-fatal - goals were still saved
    }

    // Look up HotDoc booking URL for the patient's site
    let hotdocUrl: string | null = null;
    if (patient.site) {
      const { data: siteConfig } = await supabase
        .from("sites_config")
        .select("hotdoc_booking_url")
        .eq("site_name", patient.site)
        .single();

      if (siteConfig) {
        hotdocUrl = siteConfig.hotdoc_booking_url;
      }
    }

    // If no site-specific URL, use a default
    if (!hotdocUrl) {
      hotdocUrl = "https://www.hotdoc.com.au/medical-centres/crace/yourgp-crace/doctors";
    }

    return jsonResponse({
      success: true,
      carePlanGenerated,
      hotdocUrl,
    });

  } catch (error) {
    console.error("Error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
