-- Migration 006: Add data integrity constraints

-- 1.2: Prevent duplicate patients (same Best Practice patient ID)
ALTER TABLE patients ADD CONSTRAINT unique_patient_id UNIQUE(patient_id);

-- 1.5: Validate referral letter provider types at DB level
ALTER TABLE referral_letters ADD CONSTRAINT valid_provider_type
  CHECK (provider_type IN (
    'Physiotherapist', 'Dietitian', 'Podiatrist', 'Psychologist',
    'Exercise Physiologist', 'Diabetes Educator', 'Occupational Therapist',
    'Speech Pathologist', 'Mental Health Social Worker'
  ));

-- 4.5: Prevent duplicate review numbers per patient
ALTER TABLE reviews ADD CONSTRAINT unique_patient_review_number
  UNIQUE(patient_uuid, review_number);
