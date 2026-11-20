-- ============================================================
-- Reconciliacao do bucket storage knowledge-uploads.
-- A migration original (20260722161523 - 1aa7a3ec...) define
-- as policies de storage para o bucket knowledge-uploads, mas
-- nunca criou o bucket em si. Sem o bucket, uploads de
-- documentos (documentIngestionService) falham com 404/403.
-- Idempotente e aditiva: reexecutavel sem erro.
-- ============================================================

-- ── Storage bucket knowledge-uploads ─────────────────────────
-- Bucket privado. Caminho esperado: {user_id}/{ingestion_id}/{filename}
-- (documentIngestionService.ts:157).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'knowledge-uploads') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'knowledge-uploads',
      'knowledge-uploads',
      false,
      52428800,
      array['application/pdf','text/plain','text/markdown','text/csv',
            'application/json','application/zip',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    );
  END IF;
END $$;

-- ── Policies de storage (reconciliadas) ─────────────────────
-- Garantem que as policies definidas na migration original existam
-- de fato, criadas como owner do banco quando rodadas no SQL Editor
-- ou via role com permissao sobre storage.objects.
DROP POLICY IF EXISTS "Users read own knowledge uploads" ON storage.objects;
CREATE POLICY "Users read own knowledge uploads"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users upload own knowledge uploads" ON storage.objects;
CREATE POLICY "Users upload own knowledge uploads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own knowledge uploads" ON storage.objects;
CREATE POLICY "Users delete own knowledge uploads"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'knowledge-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
