-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Enterprise Memory Layer Schema

-- Knowledge Graph Entities
CREATE TABLE IF NOT EXISTS public.knowledge_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- person, organization, concept, product, etc.
    properties JSONB DEFAULT '{}'::jsonb,
    workspace_id UUID, -- Optional for multi-tenancy
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    last_seen_at TIMESTAMPTZ DEFAULT now(),
    importance_score FLOAT DEFAULT 1.0, -- for ranking and decay
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Knowledge Graph Relations
CREATE TABLE IF NOT EXISTS public.knowledge_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
    target_id UUID REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL, -- works_at, parent_of, relates_to, etc.
    strength FLOAT DEFAULT 1.0,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Specialized Memory Types
CREATE TABLE IF NOT EXISTS public.agent_memories_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID, -- Optional if global
    memory_type TEXT NOT NULL, -- episodic (events), semantic (facts), procedural (how-to)
    content TEXT NOT NULL,
    embedding vector(1536),
    importance_score FLOAT DEFAULT 1.0,
    context_tier TEXT DEFAULT 'L1', -- L0 (Hot), L1 (Warm), L2 (Cold)
    decay_rate FLOAT DEFAULT 0.05,
    last_accessed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Entity Resolution / Deduplication tracking
CREATE TABLE IF NOT EXISTS public.entity_resolution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_entity_id UUID REFERENCES public.knowledge_entities(id),
    merged_entity_id UUID, -- The ID that was merged/deduplicated
    resolution_method TEXT, -- automated, manual, ai_suggested
    confidence FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memories_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_resolution_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on knowledge entities" ON public.knowledge_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on knowledge relations" ON public.knowledge_relations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on agent memories" ON public.agent_memories_v2 FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read on resolution logs" ON public.entity_resolution_logs FOR SELECT TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_type ON public.knowledge_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_relations_source ON public.knowledge_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_relations_target ON public.knowledge_relations(target_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON public.agent_memories_v2(memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_tier ON public.agent_memories_v2(context_tier);
