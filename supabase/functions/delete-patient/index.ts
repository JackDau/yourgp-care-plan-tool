import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, isValidUuid, errorResponse, jsonResponse } from "../_shared/config.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify the request has a valid Supabase auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Authorization required", 401);
    }

    const { patientUuid } = await req.json();

    if (!patientUuid) {
      return errorResponse("Patient UUID is required", 400);
    }

    if (!isValidUuid(patientUuid)) {
      return errorResponse("Invalid patient UUID format", 400);
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Cancel any pending scheduled jobs for this patient
    await supabase
      .from("scheduled_jobs")
      .update({ status: "cancelled" })
      .eq("patient_uuid", patientUuid)
      .eq("status", "pending");

    // Delete patient (submissions, referral_letters cascade via FK)
    const { error } = await supabase
      .from("patients")
      .delete()
      .eq("id", patientUuid);

    if (error) {
      console.error("Delete error:", error);
      return errorResponse("Failed to delete patient", 500);
    }

    return jsonResponse({ success: true });

  } catch (error) {
    console.error("Error:", error);
    return errorResponse(error.message || "Internal server error", 500);
  }
});
