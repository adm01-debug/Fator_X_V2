/**
 * useOpenclawTemplates — lista templates da galeria OpenClaw com filtro por categoria.
 * Fonte: `openclaw_agent_templates` (Lovable Cloud, RLS: SELECT authenticated).
 */
import { useQuery } from '@tanstack/react-query';
import { supabaseExternal } from '@/integrations/supabase/externalClient';
import { logger } from '@/lib/logger';

export type OpenclawTemplateCategory =
  | 'vendas'
  | 'atendimento'
  | 'produtividade'
  | 'observabilidade'
  | 'conteudo'
  | 'pessoal';

export interface OpenclawTemplateSkillRef {
  name: string;
  required?: boolean;
}

export interface OpenclawTemplate {
  id: string;
  slug: string;
  name_pt: string;
  description_pt: string;
  category: OpenclawTemplateCategory;
  difficulty: 1 | 2 | 3;
  source_url: string | null;
  soul_md: string | null;
  agents_md: string | null;
  skills: OpenclawTemplateSkillRef[];
  cron_schedule: string | null;
  required_channels: string[];
  origin: 'awesome-openclaw-zh' | 'native';
  is_available: boolean;
  created_at: string;
}

interface UseOpenclawTemplatesOptions {
  category?: OpenclawTemplateCategory | 'todas';
}

export function useOpenclawTemplates(options: UseOpenclawTemplatesOptions = {}) {
  const { category = 'todas' } = options;

  return useQuery<OpenclawTemplate[]>({
    queryKey: ['openclaw-templates', category],
    queryFn: async () => {
      let query = supabaseExternal
        .from('openclaw_agent_templates')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('*' as any)
        .order('difficulty', { ascending: true })
        .order('name_pt', { ascending: true });

      if (category !== 'todas') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) {
        logger.error('useOpenclawTemplates failed', { error: error.message });
        throw error;
      }

      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          slug: String(r.slug),
          name_pt: String(r.name_pt),
          description_pt: String(r.description_pt),
          category: r.category as OpenclawTemplateCategory,
          difficulty: r.difficulty as 1 | 2 | 3,
          source_url: (r.source_url as string | null) ?? null,
          soul_md: (r.soul_md as string | null) ?? null,
          agents_md: (r.agents_md as string | null) ?? null,
          skills: Array.isArray(r.skills) ? (r.skills as OpenclawTemplateSkillRef[]) : [],
          cron_schedule: (r.cron_schedule as string | null) ?? null,
          required_channels: Array.isArray(r.required_channels)
            ? (r.required_channels as string[])
            : [],
          origin: r.origin as 'awesome-openclaw-zh' | 'native',
          is_available: Boolean(r.is_available),
          created_at: String(r.created_at),
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
