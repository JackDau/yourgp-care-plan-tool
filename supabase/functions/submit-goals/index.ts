import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

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
      return new Response(
        JSON.stringify({ error: "Patient ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await supabase
      .from("patients")
      .select("id, patient_id, conditions, questions")
      .eq("id", patientUuid)
      .single();

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: "Patient not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already submitted
    const { data: existingSubmission } = await supabase
      .from("submissions")
      .select("id")
      .eq("patient_uuid", patientUuid)
      .single();

    return new Response(
      JSON.stringify({
        patientId: data.patient_id,
        conditions: data.conditions,
        questions: data.questions,
        alreadySubmitted: !!existingSubmission
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }

  // POST - submit patient goals
  try {
    const { patientUuid, goals } = await req.json();

    if (!patientUuid || !goals) {
      return new Response(
        JSON.stringify({ error: "Patient UUID and goals are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify patient exists
    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientUuid)
      .single();

    if (patientError || !patient) {
      return new Response(
        JSON.stringify({ error: "Invalid patient link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    return new Response(
      JSON.stringify({ success: true }),
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
