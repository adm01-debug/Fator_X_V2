CREATE UNIQUE INDEX IF NOT EXISTS consent_records_user_purpose_uidx ON public.consent_records (user_id, purpose);
