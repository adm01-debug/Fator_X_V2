
-- Create audit_log_safe view
CREATE OR REPLACE VIEW public.audit_log_safe AS
SELECT 
    id,
    workspace_id,
    user_id,
    event_type as action,
    resource_type as resource,
    resource_id,
    ip_address,
    created_at
FROM public.audit_events
WHERE 
    workspace_id IS NULL OR workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
    );

GRANT SELECT ON public.audit_log_safe TO authenticated;

-- Trigger for security alerts on failed auth attempts
CREATE OR REPLACE FUNCTION public.handle_auth_failure_alert()
RETURNS TRIGGER AS $$
DECLARE
    fail_count INTEGER;
BEGIN
    SELECT count(*) INTO fail_count
    FROM public.auth_attempts
    WHERE ip_address = NEW.ip_address
      AND success = false
      AND created_at > now() - interval '10 minutes';

    IF fail_count >= 5 THEN
        INSERT INTO public.security_alerts (severity, category, message, metadata)
        VALUES (
            'high',
            'auth',
            'Detectadas múltiplas falhas de autenticação do IP: ' || NEW.ip_address,
            jsonb_build_object('ip_address', NEW.ip_address, 'count', fail_count, 'last_email', NEW.email)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_auth_failure_alert ON public.auth_attempts;
CREATE TRIGGER trg_auth_failure_alert
AFTER INSERT ON public.auth_attempts
FOR EACH ROW
WHEN (NEW.success = false)
EXECUTE FUNCTION public.handle_auth_failure_alert();
