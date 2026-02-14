-- Migration 005: Quarterly Reviews
-- Adds reviews table for care plan quarterly review system

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_uuid UUID REFERENCES patients(id) ON DELETE CASCADE,
  submission_uuid UUID REFERENCES submissions(id) ON DELETE CASCADE,
  review_number INTEGER NOT NULL DEFAULT 1,
  review_questions JSONB,          -- auto-generated progress questions
  progress_responses JSONB,        -- patient's answers
  review_summary_text TEXT,        -- AI-generated review summary
  review_email_sent BOOLEAN DEFAULT FALSE,
  review_email_sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,        -- when patient completed the form
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_patient ON reviews(patient_uuid);
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on reviews"
  ON reviews FOR ALL USING (true) WITH CHECK (true);
