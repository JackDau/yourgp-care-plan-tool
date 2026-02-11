-- Migration: v3.0 Enhancements
-- GP/Site stratification, reminder system, care plan email delivery, consultation completion

-- ==============================================
-- 1. Add GP name and Site to patients table
-- ==============================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS gp_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS site TEXT CHECK (site IN ('Crace', 'Denman', 'Lyneham'));
ALTER TABLE patients ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

-- ==============================================
-- 2. Add care plan email and completion tracking to submissions
-- ==============================================
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS care_plan_email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS care_plan_email_sent_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS consultation_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS consultation_completed_at TIMESTAMPTZ;

-- ==============================================
-- 3. Create scheduled_jobs table for reminder and email processing
-- ==============================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('patient_reminder', 'care_plan_email')),
  patient_uuid UUID REFERENCES patients(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for scheduled_jobs
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_status_scheduled ON scheduled_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_patient ON scheduled_jobs(patient_uuid);

-- RLS for scheduled_jobs
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "Allow all operations on scheduled_jobs" ON scheduled_jobs FOR ALL USING (true) WITH CHECK (true);

-- ==============================================
-- 4. Create sites_config table for HotDoc booking URLs
-- ==============================================
CREATE TABLE IF NOT EXISTS sites_config (
  site_name TEXT PRIMARY KEY CHECK (site_name IN ('Crace', 'Denman', 'Lyneham')),
  hotdoc_booking_url TEXT NOT NULL
);

-- RLS for sites_config
ALTER TABLE sites_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations on sites_config" ON sites_config;
CREATE POLICY "Allow all operations on sites_config" ON sites_config FOR ALL USING (true) WITH CHECK (true);

-- Insert placeholder HotDoc URLs (to be updated with actual links)
INSERT INTO sites_config (site_name, hotdoc_booking_url) VALUES
  ('Crace', 'https://www.hotdoc.com.au/medical-centres/crace/yourgp-crace/doctors'),
  ('Denman', 'https://www.hotdoc.com.au/medical-centres/denman-prospect/yourgp-denman/doctors'),
  ('Lyneham', 'https://www.hotdoc.com.au/medical-centres/lyneham/yourgp-lyneham/doctors')
ON CONFLICT (site_name) DO NOTHING;

-- ==============================================
-- 5. Additional indexes for new columns
-- ==============================================
CREATE INDEX IF NOT EXISTS idx_patients_gp_name ON patients(gp_name);
CREATE INDEX IF NOT EXISTS idx_patients_site ON patients(site);
CREATE INDEX IF NOT EXISTS idx_submissions_consultation_completed ON submissions(consultation_completed);
