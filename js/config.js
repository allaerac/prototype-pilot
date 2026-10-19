// Fill these in from Supabase → Project Settings → API. The anon key is meant to be public;
// the database's row-level security (supabase/schema.sql) only lets it insert events, never read them.
// While these are empty, events wait in a queue on the phone and are sent once they're set.
export const SUPABASE_URL = 'https://yzxyeribpbanmqhuowym.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6eHllcmlicGJhbm1xaHVvd3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0MTAwMDMsImV4cCI6MjEwNzk4NjAwM30.sQp4le65dA1B-6amO1MfVU5ubttLjhSL9W_UG5frPlY';

export const APP_VERSION = '0.1.0';
