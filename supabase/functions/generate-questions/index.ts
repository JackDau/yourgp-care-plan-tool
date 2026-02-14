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

// Condition-specific SMART goal questions with theme tags for deduplication
// When a patient has multiple conditions, each theme (exercise, diet, smoking, etc.)
// will only be asked ONCE, using the first condition that includes that theme
const themedQuestions: Record<string, { theme: string; question: string }[]> = {
  diabetes: [
    { theme: "diet", question: "What eating habit would you like to change to help manage your blood sugar levels?" },
    { theme: "exercise", question: "What type of physical activity would you enjoy doing more regularly?" },
    { theme: "monitoring", question: "How would you like to be more involved in monitoring your health?" }
  ],
  copd: [
    { theme: "breathing", question: "What would help you feel more confident managing your breathing?" },
    { theme: "smoking", question: "If you smoke, what would help you reduce or quit?" },
    { theme: "exercise", question: "What physical activity would you like to be able to do more easily?" }
  ],
  cvd: [
    { theme: "diet", question: "What changes to your diet would you like to make for your heart?" },
    { theme: "exercise", question: "How would you like to be more active in your daily life?" },
    { theme: "smoking", question: "What habit would you like to change to improve your heart health?" }
  ],
  mentalHealth: [
    { theme: "joy", question: "What activity brings you joy that you'd like to do more often?" },
    { theme: "control", question: "What would help you feel more in control of your mental wellbeing?" },
    { theme: "support", question: "What kind of support would be most helpful for you right now?" }
  ],
  ckd: [
    { theme: "diet", question: "What dietary changes would you like to make to protect your kidneys?" },
    { theme: "monitoring", question: "How would you like to be more involved in monitoring your kidney health?" },
    { theme: "lifestyle", question: "What lifestyle change do you think would make the biggest difference?" }
  ],
  osteoarthritis: [
    { theme: "exercise", question: "What movement or activity do you want to maintain or improve?" },
    { theme: "pain", question: "What would help you manage pain and stay active?" },
    { theme: "daily", question: "What daily task would you like to do more easily?" }
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

    // Track used themes to avoid duplicate questions across conditions
    // e.g., if diabetes asks about exercise, don't ask about exercise again under OA
    const usedThemes = new Set<string>();

    // Add condition-specific questions with deduplication
    for (const condition of detectedConditions) {
      const conditionQs = themedQuestions[condition];
      if (conditionQs) {
        const uniqueQuestions: string[] = [];

        for (const q of conditionQs) {
          // Only add the question if this theme hasn't been used yet
          if (!usedThemes.has(q.theme)) {
            usedThemes.add(q.theme);
            uniqueQuestions.push(q.question);
          }
        }

        // Only add the category if it has at least one unique question
        if (uniqueQuestions.length > 0) {
          questions.push({
            category: getConditionDisplayName(condition),
            questions: uniqueQuestions
          });
        }
      }
    }

    // Add allied health referral question (always included)
    questions.push({
      category: "Allied Health Support",
      questions: [
        "Would you like a referral to any allied health practitioners as part of your care plan? (e.g., Physiotherapist, Dietitian, Podiatrist, Psychologist, Exercise Physiologist, Diabetes Educator). If yes, please tell us which ones and why."
      ]
    });

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
