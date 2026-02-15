import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, FORM_BASE_URL } from "../_shared/config.ts";
import { getGraphAccessToken, sendEmail } from "../_shared/ms-graph.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();

    // Fetch due jobs (pending + scheduled_for <= now)
    const { data: dueJobs, error: jobsError } = await supabase
      .from("scheduled_jobs")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (jobsError) {
      throw jobsError;
    }

    if (!dueJobs || dueJobs.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: "No due jobs" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken: string | null = null;
    let processed = 0;
    let failed = 0;

    for (const job of dueJobs) {
      // Mark as processing
      await supabase
        .from("scheduled_jobs")
        .update({ status: "processing" })
        .eq("id", job.id);

      try {
        // Get access token once (reuse for all emails)
        if (!accessToken) {
          accessToken = await getGraphAccessToken();
        }

        if (job.job_type === "patient_reminder") {
          await processPatientReminder(supabase, job, accessToken);
        } else if (job.job_type === "care_plan_email") {
          await processCarePlanEmail(supabase, job, accessToken);
        }

        // Mark as completed
        await supabase
          .from("scheduled_jobs")
          .update({ status: "completed", attempts: job.attempts + 1 })
          .eq("id", job.id);

        processed++;
      } catch (error) {
        console.error(`Job ${job.id} failed:`, error);

        const newAttempts = job.attempts + 1;

        if (newAttempts >= job.max_attempts) {
          await supabase
            .from("scheduled_jobs")
            .update({ status: "failed", attempts: newAttempts })
            .eq("id", job.id);
        } else {
          // Retry: reset to pending, push scheduled_for back 1 hour
          const retryTime = new Date();
          retryTime.setHours(retryTime.getHours() + 1);

          await supabase
            .from("scheduled_jobs")
            .update({
              status: "pending",
              attempts: newAttempts,
              scheduled_for: retryTime.toISOString(),
            })
            .eq("id", job.id);
        }

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ processed, failed, total: dueJobs.length }),
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

// Process a patient reminder job
async function processPatientReminder(
  supabase: any,
  job: any,
  accessToken: string
): Promise<void> {
  // Fetch patient info
  const { data: patient, error } = await supabase
    .from("patients")
    .select("id, patient_id, patient_email, reminder_count")
    .eq("id", job.patient_uuid)
    .single();

  if (error || !patient) {
    throw new Error("Patient not found");
  }

  // Check if patient has already submitted (no reminder needed)
  const { data: submission } = await supabase
    .from("submissions")
    .select("id")
    .eq("patient_uuid", patient.id)
    .single();

  if (submission) {
    // Patient already submitted - cancel remaining reminders
    await supabase
      .from("scheduled_jobs")
      .update({ status: "cancelled" })
      .eq("patient_uuid", patient.id)
      .eq("job_type", "patient_reminder")
      .eq("status", "pending");
    return;
  }

  if (!patient.patient_email) {
    throw new Error("No patient email available");
  }

  const formUrl = `${FORM_BASE_URL}/patient-form.html?id=${patient.id}`;
  const reminderNumber = patient.reminder_count + 1;

  const subject = `Reminder: Your Health Goals Questionnaire - YourGP`;
  const htmlContent = `
    <p>Dear Patient,</p>
    <p>This is a friendly reminder that we're waiting for you to complete your health goals questionnaire.</p>
    <p>Please click the link below to complete the short questionnaire:</p>
    <p><a href="${formUrl}" style="color: #667eea; font-weight: bold;">Complete Your Health Goals Questionnaire</a></p>
    <p>Completing this helps us create a personalised care plan focused on what matters most to you.</p>
    <p>If you have any questions, please contact the practice.</p>
    <p>Kind regards,<br>YourGP Care Team</p>
  `;

  await sendEmail(accessToken, patient.patient_email, subject, htmlContent);

  // Update patient reminder count
  await supabase
    .from("patients")
    .update({
      reminder_count: reminderNumber,
      last_reminder_sent_at: new Date().toISOString(),
    })
    .eq("id", patient.id);

  // Schedule next reminder if under max (3 reminders = 3 days)
  if (reminderNumber < 3) {
    const nextReminder = new Date();
    nextReminder.setHours(nextReminder.getHours() + 24);

    await supabase.from("scheduled_jobs").insert({
      job_type: "patient_reminder",
      patient_uuid: patient.id,
      scheduled_for: nextReminder.toISOString(),
      status: "pending",
      max_attempts: 3,
    });
  }
}

// Process a care plan email job
async function processCarePlanEmail(
  supabase: any,
  job: any,
  accessToken: string
): Promise<void> {
  // Fetch patient and submission data
  const { data: patient, error } = await supabase
    .from("patients")
    .select(`
      id, patient_id, patient_email, gp_name, site,
      submissions (
        id, care_plan_text, care_plan_email_sent
      )
    `)
    .eq("id", job.patient_uuid)
    .single();

  if (error || !patient) {
    throw new Error("Patient not found");
  }

  const submission = patient.submissions?.[0];
  if (!submission || !submission.care_plan_text) {
    throw new Error("No care plan text available");
  }

  if (submission.care_plan_email_sent) {
    return; // Already sent
  }

  if (!patient.patient_email) {
    throw new Error("No patient email available");
  }

  // Format care plan for email (convert plain text to HTML)
  const carePlanHtml = submission.care_plan_text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");

  const subject = "Your Care Plan - YourGP";
  const htmlContent = `
    <p>Dear Patient,</p>
    <p>Thank you for completing your health goals questionnaire. Your personalised care plan has been prepared and is included below.</p>
    <p>Please review this plan and bring it to your upcoming telehealth consultation with your GP.</p>
    <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
    <div style="font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.6; background: #f9fafb; padding: 20px; border-radius: 8px;">
      ${carePlanHtml}
    </div>
    <hr style="border: 1px solid #e5e7eb; margin: 20px 0;">
    <p>If you have any questions about your care plan, please discuss them with your GP during your consultation.</p>
    <p>Kind regards,<br>YourGP Care Team</p>
  `;

  await sendEmail(accessToken, patient.patient_email, subject, htmlContent);

  // Mark care plan email as sent
  await supabase
    .from("submissions")
    .update({
      care_plan_email_sent: true,
      care_plan_email_sent_at: new Date().toISOString(),
    })
    .eq("id", submission.id);
}
