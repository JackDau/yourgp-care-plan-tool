-- Migration: Referral letter storage
-- Save generated allied health referral letters for retrieval

CREATE TABLE IF NOT EXISTS referral_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_uuid UUID REFERENCES patients(id) ON DELETE CASCADE,
  provider_type TEXT NOT NULL,
  letter_content TEXT NOT NULL,
  generated_by_gp TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_letters_patient ON referral_letters(patient_uuid);

ALTER TABLE referral_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all operations on referral_letters"
  ON referral_letters FOR ALL USING (true) WITH CHECK (true);
