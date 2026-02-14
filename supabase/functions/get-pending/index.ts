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
        gp_name,
        site,
        reminder_count,
        last_reminder_sent_at,
        submissions (
          id,
          goals,
          submitted_at,
          care_plan_generated,
          care_plan_generated_at,
          care_plan_text,
          care_plan_email_sent,
          care_plan_email_sent_at,
          consultation_completed,
          consultation_completed_at
        )
      `)
      .order("created_at", { ascending: false });

    if (patientsError) {
      throw patientsError;
    }

    // Fetch all referral letters grouped by patient
    const { data: referralLetters } = await supabase
      .from("referral_letters")
      .select("id, patient_uuid, provider_type, letter_content, generated_by_gp, generated_at")
      .order("generated_at", { ascending: false });

    // Build a map of patient_uuid -> referral letters
    const referralsByPatient: Record<string, any[]> = {};
    for (const letter of referralLetters || []) {
      if (!referralsByPatient[letter.patient_uuid]) {
        referralsByPatient[letter.patient_uuid] = [];
      }
      referralsByPatient[letter.patient_uuid].push({
        id: letter.id,
        providerType: letter.provider_type,
        letterContent: letter.letter_content,
        generatedByGp: letter.generated_by_gp,
        generatedAt: letter.generated_at,
      });
    }

    // Fetch all reviews grouped by patient
    const { data: reviews } = await supabase
      .from("reviews")
      .select("id, patient_uuid, review_number, review_questions, progress_responses, review_summary_text, submitted_at, created_at")
      .order("created_at", { ascending: false });

    const reviewsByPatient: Record<string, any[]> = {};
    for (const review of reviews || []) {
      if (!reviewsByPatient[review.patient_uuid]) {
        reviewsByPatient[review.patient_uuid] = [];
      }
      reviewsByPatient[review.patient_uuid].push({
        id: review.id,
        reviewNumber: review.review_number,
        hasResponses: !!review.submitted_at,
        hasSummary: !!review.review_summary_text,
        reviewSummaryText: review.review_summary_text,
        submittedAt: review.submitted_at,
        createdAt: review.created_at,
      });
    }

    // Categorize patients
    const awaiting: any[] = [];      // Email sent, no submission yet
    const ready: any[] = [];          // Submission received, care plan not generated
    const completed: any[] = [];      // Care plan generated but consultation not completed
    const closed: any[] = [];         // Consultation completed (closed loop)

    for (const patient of patients || []) {
      const submission = patient.submissions?.[0];

      const patientData = {
        uuid: patient.id,
        patientId: patient.patient_id,
        conditions: patient.conditions,
        email: patient.patient_email,
        createdAt: patient.created_at,
        gpName: patient.gp_name,
        site: patient.site,
        reminderCount: patient.reminder_count,
        lastReminderSentAt: patient.last_reminder_sent_at,
        referralLetters: referralsByPatient[patient.id] || [],
        reviews: reviewsByPatient[patient.id] || [],
        submission: submission ? {
          goals: submission.goals,
          submittedAt: submission.submitted_at,
          carePlanGenerated: submission.care_plan_generated,
          carePlanGeneratedAt: submission.care_plan_generated_at,
          carePlanText: submission.care_plan_text,
          carePlanEmailSent: submission.care_plan_email_sent,
          carePlanEmailSentAt: submission.care_plan_email_sent_at,
          consultationCompleted: submission.consultation_completed,
          consultationCompletedAt: submission.consultation_completed_at,
        } : null
      };

      if (submission?.consultation_completed) {
        closed.push(patientData);
      } else if (submission?.care_plan_generated) {
        completed.push(patientData);
      } else if (submission) {
        ready.push(patientData);
      } else {
        awaiting.push(patientData);
      }
    }

    return new Response(
      JSON.stringify({
        awaiting,
        ready,
        completed,
        closed,
        totals: {
          awaiting: awaiting.length,
          ready: ready.length,
          completed: completed.length,
          closed: closed.length,
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
