import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all patients with their submission status
    const { data: patients, error: patientsError } = await supabase
      .from("patients")
      .select(`
        id,
        patient_id,
        conditions,
        patient_email,
        email_sent,
        created_at,
        submissions (
          id,
          goals,
          submitted_at,
          care_plan_generated,
          care_plan_generated_at,
          care_plan_text
        )
      `)
      .order("created_at", { ascending: false });

    if (patientsError) {
      throw patientsError;
    }

    // Categorize patients
    const awaiting: any[] = [];      // Email sent, no submission yet
    const ready: any[] = [];          // Submission received, care plan not generated
    const completed: any[] = [];      // Care plan generated

    for (const patient of patients || []) {
      const submission = patient.submissions?.[0];

      const patientData = {
        uuid: patient.id,
        patientId: patient.patient_id,
        conditions: patient.conditions,
        email: patient.patient_email,
        createdAt: patient.created_at,
        submission: submission ? {
          goals: submission.goals,
          submittedAt: submission.submitted_at,
          carePlanGenerated: submission.care_plan_generated,
          carePlanGeneratedAt: submission.care_plan_generated_at,
          carePlanText: submission.care_plan_text
        } : null
      };

      if (submission?.care_plan_generated) {
        completed.push(patientData);
      } else if (submission) {
        ready.push(patientData);
      } else {
        awaiting.push(patientData);
      }
    }

    return new Response(
      JSON.stringify({
        awaiting,    // Waiting for patient to complete form
        ready,       // Ready for care plan generation
        completed,   // Care plan already generated
        totals: {
          awaiting: awaiting.length,
          ready: ready.length,
          completed: completed.length
        }
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
