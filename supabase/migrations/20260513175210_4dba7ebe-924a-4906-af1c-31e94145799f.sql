-- Tabela para rastrear tentativas de login
CREATE TABLE IF NOT EXISTS public.auth_attempts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL,
    success BOOLEAN NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index para performance em consultas de lockout
CREATE INDEX IF NOT EXISTS idx_auth_attempts_email_created ON public.auth_attempts(email, created_at);

-- RLS: Somente o sistema (service_role) lê/escreve, mas permitimos insert via RPC/App anonimamente (limitado)
ALTER TABLE public.auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts for auth tracking" 
ON public.auth_attempts FOR INSERT 
WITH CHECK (true);

-- Função para verificar Lockout (SERVER-SIDE)
CREATE OR REPLACE FUNCTION public.is_user_locked_out(target_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    failed_count INT;
BEGIN
    SELECT count(*) INTO failed_count
    FROM public.auth_attempts
    WHERE email = target_email
      AND success = false
      AND created_at > (now() - interval '1 minute');
    
    RETURN failed_count >= 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para limpar logs antigos (manutenção)
CREATE OR REPLACE FUNCTION public.cleanup_old_auth_attempts()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.auth_attempts WHERE created_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql;
