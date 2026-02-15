import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, FORM_BASE_URL, errorResponse, jsonResponse } from "../_shared/config.ts";

// Parse GP name from health summary
// Matches "Doctor Name: John Deery" from Best Practice export format
function parseGpName(healthSummary: string): string | null {
  const patterns = [
    // Best Practice export: "Doctor Name: John Deery"
    /Doctor Name:\s*(.+)/i,
    // Fallback: "GP: Dr Smith", "Treating Doctor: Dr Smith" (word boundary to avoid "YourGP")
    /\b(?:GP|Treating Doctor|Usual Doctor|Practitioner)\b[\s:]*(?:Dr\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = healthSummary.match(pattern);
    if (match) {
      let name = match[1].trim();
      if (!name.toLowerCase().startsWith("dr")) {
        name = `Dr ${name}`;
      }
      return name;
    }
  }

  return null;
}

// Parse site from health summary
// Looks for Crace, Denman (Prospect), or Lyneham
function parseSite(healthSummary: string): string | null {
  const summary = healthSummary.toLowerCase();

  if (summary.includes("crace")) return "Crace";
  if (summary.includes("denman")) return "Denman";
  if (summary.includes("lyneham")) return "Lyneham";

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { patientId, healthSummary, conditions, questions, patientEmail, gpName, site } = await req.json();

    if (!patientId) {
      return errorResponse("Patient ID is required", 400);
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auto-detect GP name and site from health summary if not provided
    const detectedGpName = gpName || (healthSummary ? parseGpName(healthSummary) : null);
    const detectedSite = site || (healthSummary ? parseSite(healthSummary) : null);

    // Insert patient record
    const { data, error } = await supabase
      .from("patients")
      .insert({
        patient_id: patientId,
        health_summary: healthSummary,
        conditions: conditions || [],
        questions: questions || [],
        patient_email: patientEmail || null,
        email_sent: false,
        gp_name: detectedGpName,
        site: detectedSite,
        reminder_count: 0
      })
      .select()
      .single();

    if (error) {
      console.error("Database error:", error);
      return errorResponse("Failed to save patient record", 500);
    }

    // Schedule first reminder job (24 hours from now)
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + 24);

    const { error: jobError } = await supabase
      .from("scheduled_jobs")
      .insert({
        job_type: "patient_reminder",
        patient_uuid: data.id,
        scheduled_for: reminderTime.toISOString(),
        status: "pending",
        max_attempts: 3
      });

    if (jobError) {
      console.error("Failed to schedule reminder job:", jobError);
      // Non-fatal - patient record was still saved
    }

    const formUrl = `${FORM_BASE_URL}/patient-form.html?id=${data.id}`;

    return jsonResponse({
      success: true,
      patientUuid: data.id,
      formUrl,
      gpName: detectedGpName,
      site: detectedSite
    });

  } catch (error) {
    console.error("Error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
