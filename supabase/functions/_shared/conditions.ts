// Shared condition detection keywords — single source of truth
export const conditionKeywords: Record<string, string[]> = {
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

// Detect conditions from health summary text
export function detectConditions(healthSummary: string): string[] {
  const summary = healthSummary.toLowerCase();
  const detected: string[] = [];

  for (const [condition, keywords] of Object.entries(conditionKeywords)) {
    for (const keyword of keywords) {
      if (summary.includes(keyword)) {
        detected.push(condition);
        break;
      }
    }
  }

  return detected;
}

// Human-readable condition names
export function getConditionDisplayName(condition: string): string {
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
