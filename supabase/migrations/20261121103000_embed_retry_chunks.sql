-- Retry de embedding para chunks marcados como 'failed'.
-- O rag-embed-backfill so reprocessa chunks com embedding_status = 'pending'.
-- Quando a edge falha (ex.: embedder degradado sem LLM key), o chunk vai para
-- 'failed' e fica preso para sempre, mesmo depois de o provedor voltar.
-- Este fix permite retry com limite de tentativas (padrao agent_memories_v2):
--   embed_attempts      contador de tentativas (0 ate 4 = 5 tentativas)
--   embed_last_error    motivo do ultimo erro
--   embed_last_attempt_at  timestamp da ultima tentativa
-- O backfill passa a incluir embedding_status IN ('pending','failed') e grava
-- os contadores em cada tentativa, parando de reprocessar apos 5 falhas
-- consecutivas (dead-letter controlado por embed_attempts >= 5).

ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS embed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embed_last_error text,
  ADD COLUMN IF NOT EXISTS embed_last_attempt_at timestamptz;

-- Indice parcial para o backfill varrer apenas candidatos a re-embed de forma
-- barata (embedding nulo e tentativas abaixo do limite).
CREATE INDEX IF NOT EXISTS idx_chunks_embed_retry
  ON public.chunks (created_at)
  WHERE embedding IS NULL AND embed_attempts < 5;

-- Chunks que estavam em 'failed' antes deste fix voltam ao retry automatico
-- (com reinicio de contagem), evitando orfaos permanentes no banco.
UPDATE public.chunks
  SET embed_attempts = 0
  WHERE embedding_status = 'failed' AND embedding IS NULL;
