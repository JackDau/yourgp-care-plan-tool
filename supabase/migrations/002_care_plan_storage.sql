-- Migration: Add care_plan_text column to store generated care plans
-- This allows viewing previously generated care plans from the dashboard

ALTER TABLE submissions ADD COLUMN care_plan_text TEXT;
