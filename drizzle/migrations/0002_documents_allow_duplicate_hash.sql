ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_user_id_sha256_key;
CREATE INDEX IF NOT EXISTS documents_user_sha256_idx ON public.documents (user_id, sha256);