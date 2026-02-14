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
    const url = new URL(req.url);
    const reviewId = url.searchParams.get("id");

    if (!reviewId) {
      return new Response(
        JSON.stringify({ error: "Review ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch review with patient and submission data
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(`
        id,
        review_number,
        review_questions,
        progress_responses,
        submitted_at,
        patient_uuid,
        patients (
          patient_id,
          conditions,
          gp_name,
          site
        )
      `)
      .eq("id", reviewId)
      .single();

    if (reviewError || !review) {
      return new Response(
        JSON.stringify({ error: "Review not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        reviewId: review.id,
        reviewNumber: review.review_number,
        reviewQuestions: review.review_questions,
        alreadySubmitted: !!review.submitted_at,
        conditions: review.patients?.conditions || [],
        gpName: review.patients?.gp_name || "",
        site: review.patients?.site || "",
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
