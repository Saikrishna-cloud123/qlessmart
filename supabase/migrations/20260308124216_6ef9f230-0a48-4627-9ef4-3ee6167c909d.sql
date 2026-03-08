
-- Add exit_guard to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exit_guard';
