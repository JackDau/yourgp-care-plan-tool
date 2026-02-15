import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, CLAUDE_MODEL, isValidUuid } from "../_shared/config.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { reviewUuid } = await req.json();

    if (!reviewUuid) {
      return new Response(
        JSON.stringify({ error: "Review UUID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidUuid(reviewUuid)) {
      return new Response(
        JSON.stringify({ error: "Invalid review UUID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch review with full context
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select(`
        id,
        review_number,
        review_questions,
        progress_responses,
        review_summary_text,
        patient_uuid,
        submission_uuid
      `)
      .eq("id", reviewUuid)
      .single();

    if (reviewError || !review) {
      return new Response(
        JSON.stringify({ error: "Review not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return cached summary if it already exists
    if (review.review_summary_text) {
      return new Response(
        JSON.stringify({ summary: review.review_summary_text }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }

    if (!review.progress_responses) {
      return new Response(
        JSON.stringify({ error: "No progress responses submitted yet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch patient and submission context
    const { data: patient } = await supabase
      .from("patients")
      .select("patient_id, conditions, health_summary, gp_name")
      .eq("id", review.patient_uuid)
      .single();

    const { data: submission } = await supabase
      .from("submissions")
      .select("goals, care_plan_text")
      .eq("id", review.submission_uuid)
      .single();

    // Build context for review summary generation
    const reviewQuestions = review.review_questions || [];
    const progressResponses = review.progress_responses || [];
    const comparisonEntries: string[] = [];

    for (let i = 0; i < reviewQuestions.length; i++) {
      const q = reviewQuestions[i];
      const response = progressResponses[i]?.answer || "No response provided";
      comparisonEntries.push(
        `Original goal: "${q.originalGoal}"\n` +
        `Progress question: "${q.progressQuestion}"\n` +
        `Patient's progress update: "${response}"`
      );
    }

    // Generate review summary using Claude
    const client = new Anthropic();
    const message = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: `You are a clinical documentation assistant for Australian general practice. Generate a concise care plan review summary for a GP to use during a quarterly telehealth review consultation.

The summary should:
- Compare original goals against current progress
- Highlight what's working well and what needs attention
- Suggest any modifications to the care plan
- Be concise (roughly half a page)
- Use Australian medical conventions and spelling
- Reference the patient by ID only (no names)
- Be structured for quick GP review during a tele-video consultation

Format as plain text with clear sections:

CARE PLAN REVIEW SUMMARY
========================
Review #[N] | Date: [DD/MM/YYYY]
Patient ID: [ID]

PROGRESS AGAINST GOALS:
[For each goal, compare original vs current status]

WHAT'S WORKING:
[Bullet points of positive progress]

AREAS FOR ATTENTION:
[Bullet points of concerns or stalled progress]

SUGGESTED PLAN MODIFICATIONS:
[Any recommended changes to the care plan]

NEXT REVIEW: [Date 3 months from now]`,
      messages: [{
        role: "user",
        content: `Generate a care plan review summary for:

Patient ID: ${patient?.patient_id || "Unknown"}
Conditions: ${(patient?.conditions || []).join(", ")}
Review number: ${review.review_number}
GP: ${patient?.gp_name || "the GP"}

Original goals and progress comparison:

${comparisonEntries.join("\n\n")}

${submission?.care_plan_text ? `\nCurrent care plan:\n${submission.care_plan_text.substring(0, 1500)}` : ""}`
      }]
    });

    const reviewSummary = message.content[0].type === "text"
      ? message.content[0].text
      : "Error generating review summary";

    // Save review summary for future access
    await supabase
      .from("reviews")
      .update({ review_summary_text: reviewSummary })
      .eq("id", reviewUuid);

    return new Response(
      JSON.stringify({ summary: reviewSummary }),
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
