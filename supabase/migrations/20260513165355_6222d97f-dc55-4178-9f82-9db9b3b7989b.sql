-- Function to increment version
CREATE OR REPLACE FUNCTION public.increment_version_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add version column and trigger to agent_graphs
ALTER TABLE public.agent_graphs ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_agent_graphs_version ON public.agent_graphs;
CREATE TRIGGER increment_agent_graphs_version
BEFORE UPDATE ON public.agent_graphs
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();

-- Add version column and trigger to knowledge_bases
ALTER TABLE public.knowledge_bases ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_knowledge_bases_version ON public.knowledge_bases;
CREATE TRIGGER increment_knowledge_bases_version
BEFORE UPDATE ON public.knowledge_bases
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();

-- Add version column and trigger to workspaces
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_workspaces_version ON public.workspaces;
CREATE TRIGGER increment_workspaces_version
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();

-- Add version column and trigger to skill_registry
ALTER TABLE public.skill_registry ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_skill_registry_version ON public.skill_registry;
CREATE TRIGGER increment_skill_registry_version
BEFORE UPDATE ON public.skill_registry
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();

-- Add version column and trigger to agent_installed_skills
ALTER TABLE public.agent_installed_skills ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_agent_installed_skills_version ON public.agent_installed_skills;
CREATE TRIGGER increment_agent_installed_skills_version
BEFORE UPDATE ON public.agent_installed_skills
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();

-- Add version column and trigger to agent_skills
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
DROP TRIGGER IF EXISTS increment_agent_skills_version ON public.agent_skills;
CREATE TRIGGER increment_agent_skills_version
BEFORE UPDATE ON public.agent_skills
FOR EACH ROW
EXECUTE FUNCTION public.increment_version_column();
