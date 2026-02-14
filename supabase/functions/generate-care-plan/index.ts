import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.39.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Condition detection keywords
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

// Detect conditions from health summary
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

// Build system prompt based on detected conditions
function buildSystemPrompt(conditions: string[]): string {
  let prompt = `You are a clinical documentation assistant helping generate GP Chronic Condition Management Plans (GPCCMP) that comply with Medicare Australia Item 965 requirements.

## Your Role
- Generate structured, Medicare-compliant care plans from de-identified patient health summaries
- Apply evidence-based clinical guidelines for each detected condition
- Create patient-centred, actionable plans

## Medicare Item 965 Requirements (Effective 1 July 2025)

Every GPCCMP must include ALL of the following elements:

1. **Assessment**: Identify and confirm the patient's health care needs, health problems and conditions
2. **Health & Lifestyle Goals**: Develop goals WITH the patient (not FOR the patient)
3. **Patient Actions**: Specific actions the patient will take themselves
4. **Treatment & Services**: Treatments and services to be provided, including referrals and their purpose
5. **Review Date**: Specify when the plan will be reviewed (typically 3 months)
6. **Consent**: Record that patient consents to share information with care team
7. **Copy Offered**: Note that a copy was offered to the patient

## Detected Conditions to Address
${conditions.length > 0 ? conditions.map(c => `- ${c}`).join("\n") : "- General chronic condition management"}

`;

  // Add condition-specific guidance
  if (conditions.includes("diabetes")) {
    prompt += `
## Diabetes Management (RACGP 2024 Guidelines)
- HbA1c target: Generally ≤7% (individualised)
- Annual screening: eyes (retinal), feet, kidneys (eGFR, uACR)
- CV risk management: BP <130/80, lipid targets
- Consider SGLT2i or GLP-1 RA for cardio/renal protection
- Allied health: Dietitian, Podiatrist, Diabetes Educator
`;
  }

  if (conditions.includes("copd")) {
    prompt += `
## COPD Management (COPD-X Guidelines 2025)
- Confirm with spirometry (FEV1/FVC <0.7)
- Smoking cessation is priority
- Inhaler technique review essential
- Pulmonary rehabilitation referral
- Written COPD action plan
- Vaccinations: influenza, pneumococcal, COVID-19
`;
  }

  if (conditions.includes("cvd")) {
    prompt += `
## Cardiovascular Management (Heart Foundation 2023)
- Use Aus CVD Risk Calculator
- BP target: <140/90 (or <130/80 if high risk)
- LDL target: <1.8 mmol/L for high risk
- Lifestyle: smoking cessation, diet, exercise
- Cardiac rehabilitation if established CVD
- Antiplatelet for secondary prevention only
`;
  }

  if (conditions.includes("mentalHealth")) {
    prompt += `
## Mental Health Management (RACGP GPMHSC)
- Use validated screening (PHQ-9, GAD-7, K10)
- Safety assessment for all patients
- Psychological therapy first-line for mild-moderate
- SSRIs/SNRIs for moderate-severe
- Allied health: Psychologist, MH Social Worker
- Sleep, exercise, social connection as lifestyle factors
`;
  }

  if (conditions.includes("ckd")) {
    prompt += `
## CKD Management (Kidney Health Australia 2020)
- Stage by eGFR and albuminuria (uACR)
- BP target: <130/80 (ACEi/ARB if albuminuria)
- SGLT2 inhibitor for kidney protection
- Avoid NSAIDs and nephrotoxic drugs
- Refer nephrology if eGFR <30 or rapid decline
- Allied health: Dietitian (renal)
`;
  }

  if (conditions.includes("osteoarthritis")) {
    prompt += `
## Osteoarthritis Management (RACGP 2018)
- Weight loss and exercise are first-line (STRONG recommendation)
- Types: walking, strengthening, Tai Chi, cycling
- Paracetamol, topical/oral NSAIDs as needed
- NO OPIOIDS (strong recommendation against)
- Allied health: Physiotherapist, Exercise Physiologist, Dietitian
- Surgical referral only after optimal non-surgical management
`;
  }

  // Add preventive health section
  prompt += `
## Preventive Health (RACGP Red Book 2024)
Include relevant age-appropriate screening and prevention:
- Cancer screening: bowel (50-74), breast (50-74), cervical (25-74)
- CVD risk assessment (45-79 years)
- Immunisations: influenza (annual), COVID-19, pneumococcal (65+)
- Lifestyle: smoking, alcohol, physical activity, weight
- Falls prevention if 65+ years
`;

  // Output format
  prompt += `
## Output Format

Generate the care plan in this exact plain-text format:

GP CHRONIC CONDITION MANAGEMENT PLAN (GPCCMP)
==============================================

DATE: [Today's date in DD/MM/YYYY format]
REVIEW DATE: [Date 3 months from now in DD/MM/YYYY format]

CONDITIONS ADDRESSED:
[List each condition as a bullet point]

CURRENT HEALTH STATUS:
[2-3 sentence summary of relevant clinical findings from the health summary]

HEALTH & LIFESTYLE GOALS:
(Developed with patient)
1. [Specific, measurable goal]
2. [Specific, measurable goal]
3. [Specific, measurable goal]

PATIENT ACTIONS:
(What the patient agrees to do)
1. [Concrete action with frequency/timing]
2. [Concrete action with frequency/timing]
3. [Concrete action with frequency/timing]

TREATMENT & SERVICES:

[Condition Name] Management:
- [Treatment/medication] - [Purpose]
- [Service/referral] - [Purpose]

Allied Health Referrals (under GPCCMP - up to 5 sessions/year):
- [Provider type] - [Purpose] - [Recommended sessions]

PREVENTIVE HEALTH ACTIVITIES:
- [Relevant screening or vaccination]
- [Lifestyle intervention]

CARE TEAM:
Patient consents to share relevant plan information with:
- General Practitioner
- [Other relevant providers]

Copy of plan offered to patient: Yes

NEXT REVIEW: [Date]

---

## Guidelines for Generation

1. **Be specific**: Use measurable targets (e.g., "Walk 30 minutes, 5 days per week" not "Exercise more")
2. **Patient-centred**: Goals should reflect what the patient wants, not just clinical targets
3. **Practical referrals**: Only recommend genuinely relevant and accessible allied health
4. **Evidence-based**: Align with RACGP guidelines
5. **Plain language**: The patient should understand their care plan
6. **Don't over-medicalise**: Focus on what will actually help
`;

  return prompt;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { healthSummary, patientUuid } = await req.json();

    let patientGoals: any[] = [];
    let patientHealthSummary = healthSummary;
    let patientConditions: string[] = [];

    // If patientUuid provided, fetch patient data and goals from database
    if (patientUuid) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch patient and submission data
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select(`
          id,
          health_summary,
          conditions,
          submissions (
            goals
          )
        `)
        .eq("id", patientUuid)
        .single();

      if (patientError || !patient) {
        return new Response(
          JSON.stringify({ error: "Patient not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      patientHealthSummary = patient.health_summary || healthSummary;
      patientConditions = patient.conditions || [];

      if (patient.submissions?.[0]?.goals) {
        patientGoals = patient.submissions[0].goals;
      }
    }

    if (!patientHealthSummary || typeof patientHealthSummary !== "string") {
      return new Response(
        JSON.stringify({ error: "Health summary is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect conditions from health summary (or use stored conditions)
    const detectedConditions = patientConditions.length > 0
      ? patientConditions
      : detectConditions(patientHealthSummary);

    // Build system prompt
    const systemPrompt = buildSystemPrompt(detectedConditions);

    // Build user message with patient goals if available
    let userMessage = `Please generate a Medicare-compliant GPCCMP (GP Chronic Condition Management Plan) based on the following de-identified patient health summary:

---
${patientHealthSummary}
---`;

    if (patientGoals.length > 0) {
      userMessage += `

## IMPORTANT: Patient's Own SMART Goals

The patient has provided their own health goals. These MUST be incorporated into the "HEALTH & LIFESTYLE GOALS" section of the care plan. Use the patient's own words where appropriate:

`;
      for (const goal of patientGoals) {
        if (goal.category && goal.answers) {
          userMessage += `\n### ${goal.category}\n`;
          for (const [question, answer] of Object.entries(goal.answers)) {
            if (answer && typeof answer === 'string' && answer.trim()) {
              userMessage += `- ${question}: "${answer}"\n`;
            }
          }
        }
      }
      userMessage += `
Please integrate these patient-stated goals into the care plan, ensuring they are SMART (Specific, Measurable, Achievable, Relevant, Time-bound).

If the patient has requested specific allied health referrals under "Allied Health Support", these MUST be prominently included in the "Allied Health Referrals" section and marked as "PATIENT REQUESTED" so the GP can action the referral letters.`;
    }

    userMessage += `

Generate a complete, structured care plan following the format specified. Include all required Medicare Item 965 elements.`;

    // Initialize Anthropic client
    const client = new Anthropic();

    // Generate care plan
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: userMessage
        }
      ],
      system: systemPrompt
    });

    // Extract text response
    const carePlan = message.content[0].type === "text"
      ? message.content[0].text
      : "Error generating care plan";

    // Save care plan to database if this was a patient-based generation
    if (patientUuid) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from("submissions")
        .update({
          care_plan_generated: true,
          care_plan_generated_at: new Date().toISOString(),
          care_plan_text: carePlan
        })
        .eq("patient_uuid", patientUuid);
    }

    return new Response(
      JSON.stringify({
        carePlan,
        detectedConditions,
        patientGoalsIncluded: patientGoals.length > 0
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
