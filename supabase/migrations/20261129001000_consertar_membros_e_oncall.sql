-- Duas RPCs de leitura administrativa quebravam sempre que chamadas, porque o
-- hardening moveu os e-mails para tabelas isoladas e dropou as colunas antigas:
--  * get_workspace_members_full lia workspace_members.email, dropada em
--    20260418174026…sql:86 (os e-mails vivem em workspace_member_emails).
--  * get_oncall_with_contacts lia oncall_schedule.user_email, dropada na
--    mesma migration (linha 135; hoje em oncall_schedule_emails).
-- Ambas são SECURITY DEFINER e só admin do workspace executa, então os e-mails
-- podem ser devolvidos — mas passam por mask_email para não expor endereço
-- completo em tela de listagem.

CREATE OR REPLACE FUNCTION public.get_workspace_members_full(_workspace_id uuid)
RETURNS TABLE (
  id uuid, workspace_id uuid, user_id uuid, role text,
  email text, name text, invited_at timestamptz, accepted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.id,
           m.workspace_id,
           m.user_id,
           m.role,
           public.mask_email(e.email) AS email,
           m.name,
           m.invited_at,
           m.accepted_at
      FROM public.workspace_members m
      LEFT JOIN public.workspace_member_emails e ON e.member_id = m.id
     WHERE m.workspace_id = _workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_members_full(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_members_full(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_oncall_with_contacts(_workspace_id uuid)
RETURNS TABLE (
  id uuid, workspace_id uuid, user_id uuid, user_name text, user_email text,
  starts_at timestamptz, ends_at timestamptz, escalation_order int, notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_workspace_admin(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'forbidden: workspace admin required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT o.id,
           o.workspace_id,
           o.user_id,
           o.user_name,
           public.mask_email(e.user_email) AS user_email,
           o.starts_at,
           o.ends_at,
           o.escalation_order,
           o.notes
      FROM public.oncall_schedule o
      LEFT JOIN public.oncall_schedule_emails e ON e.schedule_id = o.id
     WHERE o.workspace_id = _workspace_id
     ORDER BY o.starts_at;
END;
$$;

REVOKE ALL ON FUNCTION public.get_oncall_with_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_oncall_with_contacts(uuid) TO authenticated;

-- mask_email é usada por ambas e não tinha GRANT explícito (só o default de
-- PUBLIC). Mantém executável por authenticated e fora do alcance de anon.
REVOKE ALL ON FUNCTION public.mask_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mask_email(text) TO authenticated, service_role;
