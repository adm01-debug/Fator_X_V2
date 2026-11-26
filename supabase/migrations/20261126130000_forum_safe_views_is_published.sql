-- 1) As views safe do forum (20260418162623) mascaram author_name, mas nao filtram
--    is_published. Depois de 20261126 (quando o front passou a ler as views), a
--    garantia de que rascunho nao aparece na lista publica ficou so com a RLS e com
--    o fato de nenhum codigo gravar false hoje.
--    O filtro volta — dentro da view, nao no cliente: assim nenhum consumidor futuro
--    consegue expor rascunho por esquecer o .eq(), e a pagina publica mostra
--    exatamente o que mostrava antes.
--    CREATE OR REPLACE preserva grants e dependentes; security_invoker mantem a RLS
--    de forum_threads/forum_posts valendo para quem consulta.

CREATE OR REPLACE VIEW public.forum_threads_safe
WITH (security_invoker = true) AS
SELECT id, help_center_id, author_id,
       CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name,
       title, body, category, is_pinned, is_locked, is_resolved,
       view_count, reply_count, upvotes, last_activity_at, created_at
FROM public.forum_threads
WHERE is_published;

CREATE OR REPLACE VIEW public.forum_posts_safe
WITH (security_invoker = true) AS
SELECT id, thread_id, author_id,
       CASE WHEN author_name ~* '@' THEN 'Membro' ELSE author_name END AS author_name,
       body, is_answer, upvotes, parent_post_id, created_at, updated_at
FROM public.forum_posts
WHERE is_published;

GRANT SELECT ON public.forum_threads_safe TO authenticated, anon;
GRANT SELECT ON public.forum_posts_safe TO authenticated, anon;