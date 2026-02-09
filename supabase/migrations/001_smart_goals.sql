-- SMART Goals Tables for Care Plan Tool
-- Run this in Supabase SQL Editor

-- patients table - stores patient records and generated questions
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  health_summary TEXT,
  conditions TEXT[],
  questions JSONB,
  patient_email TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- submissions table - stores patient SMART goal submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_uuid UUID REFERENCES patients(id) ON DELETE CASCADE,
  goals JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  care_plan_generated BOOLEAN DEFAULT FALSE,
  care_plan_generated_at TIMESTAMPTZ
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_patient_uuid ON submissions(patient_uuid);
CREATE INDEX IF NOT EXISTS idx_submissions_care_plan_generated ON submissions(care_plan_generated);

-- Enable Row Level Security
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Allow public access via anon key (for this internal tool)
DROP POLICY IF EXISTS "Allow all operations on patients" ON patients;
CREATE POLICY "Allow all operations on patients" ON patients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on submissions" ON submissions;
CREATE POLICY "Allow all operations on submissions" ON submissions FOR ALL USING (true) WITH CHECK (true);
