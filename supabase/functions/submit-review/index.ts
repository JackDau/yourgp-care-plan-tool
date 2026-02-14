import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reviewUuid, progressResponses } = await req.json();

    if (!reviewUuid || !progressResponses) {
      return new Response(
        JSON.stringify({ error: "Review UUID and progress responses are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify review exists
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("id")
      .eq("id", reviewUuid)
      .single();

    if (reviewError || !review) {
      return new Response(
        JSON.stringify({ error: "Review not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save progress responses and return immediately
    // Summary generation happens on-demand when GP clicks "View Review"
    await supabase
      .from("reviews")
      .update({
        progress_responses: progressResponses,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", reviewUuid);

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
