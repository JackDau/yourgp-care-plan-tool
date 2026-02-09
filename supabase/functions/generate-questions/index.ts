import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Condition detection keywords (same as care plan tool)
const conditionKeywords: Record<string, string[]> = {
  diabetes: [
    "diabetes", "diabetic", "t2dm", "type 2 diabetes", "hba1c", "blood sugar",
    "glucose", "metformin", "insulin", "sglt2", "glp-1", "hyperglycaemia"
  ],
  copd: [
    "copd", "chronic obstructive", "emphysema", "chronic bronchitis",
    "fev1", "spirometry", "bronchodilator", "inhaler", "breathless"
  ],
  cvd: [
    "cardiovascular", "heart disease", "coronary", "heart attack", "myocardial infarction",
    "angina", "stroke", "tia", "atrial fibrillation", "af", "heart failure",
    "hypertension", "high blood pressure", "statin", "aspirin"
  ],
  mentalHealth: [
    "depression", "anxiety", "mental health", "phq", "gad", "k10",
    "antidepressant", "ssri", "snri", "suicidal", "mood disorder",
    "panic", "ptsd", "bipolar"
  ],
  ckd: [
    "chronic kidney", "ckd", "renal", "egfr", "kidney disease",
    "albuminuria", "proteinuria", "nephropathy", "dialysis", "creatinine"
  ],
  osteoarthritis: [
    "osteoarthritis", "arthritis", "joint pain", "knee pain", "hip pain",
    "degenerative joint", "oa", "joint replacement", "arthroplasty"
  ]
};

// Condition-specific SMART goal questions
const conditionQuestions: Record<string, string[]> = {
  diabetes: [
    "What eating habit would you like to change to help manage your blood sugar levels?",
    "What type of physical activity would you enjoy doing more regularly?",
    "How would you like to be more involved in monitoring your diabetes?"
  ],
  copd: [
    "What physical activity would you like to be able to do more easily?",
    "What would help you feel more confident managing your breathing?",
    "If you smoke, what would help you reduce or quit?"
  ],
  cvd: [
    "What heart-healthy habit would you like to develop?",
    "What changes to your diet would you like to make for your heart?",
    "How would you like to be more active in your daily life?"
  ],
  mentalHealth: [
    "What activity brings you joy that you'd like to do more often?",
    "What would help you feel more in control of your mental wellbeing?",
    "What kind of support would be most helpful for you right now?"
  ],
  ckd: [
    "What dietary changes would you like to make to protect your kidneys?",
    "How would you like to be more involved in monitoring your kidney health?",
    "What lifestyle change do you think would make the biggest difference?"
  ],
  osteoarthritis: [
    "What movement or activity do you want to maintain or improve?",
    "What would help you manage pain and stay active?",
    "What daily task would you like to do more easily?"
  ]
};

// General SMART goal questions (always included)
const generalQuestions = [
  "What is one health goal you want to achieve in the next 3 months?",
  "How will you know when you've achieved this goal? (What will be different?)",
  "What steps will you take to work towards this goal?",
  "What support do you need from your healthcare team to achieve this goal?",
  "What might get in the way, and how could you overcome it?"
];

function detectConditions(healthSummary: string): string[] {
  const summary = healthSummary.toLowerCase();
  const detectedConditions: string[] = [];

  for (const [condition, keywords] of Object.entries(conditionKeywords)) {
    for (const keyword of keywords) {
      if (summary.includes(keyword)) {
        detectedConditions.push(condition);
        break;
      }
    }
  }

  return detectedConditions;
}

function getConditionDisplayName(condition: string): string {
  const names: Record<string, string> = {
    diabetes: "Diabetes",
    copd: "COPD (Lung Condition)",
    cvd: "Heart Health",
    mentalHealth: "Mental Wellbeing",
    ckd: "Kidney Health",
    osteoarthritis: "Joint Health (Arthritis)"
  };
  return names[condition] || condition;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { healthSummary } = await req.json();

    if (!healthSummary || typeof healthSummary !== "string") {
      return new Response(
        JSON.stringify({ error: "Health summary is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect conditions
    const detectedConditions = detectConditions(healthSummary);

    // Build questions array
    const questions: { category: string; questions: string[] }[] = [];

    // Add general SMART questions
    questions.push({
      category: "Your Health Goals",
      questions: generalQuestions
    });

    // Add condition-specific questions
    for (const condition of detectedConditions) {
      if (conditionQuestions[condition]) {
        questions.push({
          category: getConditionDisplayName(condition),
          questions: conditionQuestions[condition]
        });
      }
    }

    return new Response(
      JSON.stringify({
        questions,
        detectedConditions,
        conditionNames: detectedConditions.map(getConditionDisplayName)
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
