-- Knowledge Entities table for the Graph
CREATE TABLE IF NOT EXISTS public.knowledge_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- person, organization, concept, tool, agent
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Knowledge Relations (edges) for the Graph
CREATE TABLE IF NOT EXISTS public.knowledge_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL, -- works_at, manages, uses, depends_on
    strength FLOAT DEFAULT 1.0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add missing columns to agent_memories if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='importance') THEN
        ALTER TABLE public.agent_memories ADD COLUMN importance FLOAT DEFAULT 0.5;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='last_accessed_at') THEN
        ALTER TABLE public.agent_memories ADD COLUMN last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_memories' AND column_name='decay_rate') THEN
        ALTER TABLE public.agent_memories ADD COLUMN decay_rate FLOAT DEFAULT 0.01;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relations ENABLE ROW LEVEL SECURITY;

-- Policies for knowledge_entities
CREATE POLICY "Users can view knowledge entities" ON public.knowledge_entities FOR SELECT USING (true);
CREATE POLICY "Users can insert knowledge entities" ON public.knowledge_entities FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update knowledge entities" ON public.knowledge_entities FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete knowledge entities" ON public.knowledge_entities FOR DELETE USING (auth.uid() IS NOT NULL);

-- Policies for knowledge_relations
CREATE POLICY "Users can view knowledge relations" ON public.knowledge_relations FOR SELECT USING (true);
CREATE POLICY "Users can insert knowledge relations" ON public.knowledge_relations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update knowledge relations" ON public.knowledge_relations FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete knowledge relations" ON public.knowledge_relations FOR DELETE USING (auth.uid() IS NOT NULL);

-- Function for Tiered Search (Simplified for now, using text search)
CREATE OR REPLACE FUNCTION public.search_context_l0(p_query TEXT, p_collection_id UUID DEFAULT NULL, p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    collection_id UUID,
    l0_abstract TEXT,
    l1_overview TEXT,
    l2_content TEXT,
    token_count INTEGER,
    relevance_score FLOAT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as chunk_id,
        c.document_id,
        (c.metadata->>'collection_id')::uuid as collection_id,
        substring(c.content, 1, 200) as l0_abstract,
        substring(c.content, 1, 2000) as l1_overview,
        '' as l2_content,
        c.token_count,
        ts_rank_cd(to_tsvector('portuguese', c.content), plainto_tsquery('portuguese', p_query)) as relevance_score
    FROM public.chunks c
    WHERE 
        (p_collection_id IS NULL OR (c.metadata->>'collection_id')::uuid = p_collection_id)
        AND to_tsvector('portuguese', c.content) @@ plainto_tsquery('portuguese', p_query)
    ORDER BY relevance_score DESC
    LIMIT p_limit;
END;
$$;
