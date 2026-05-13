import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

export interface GraphNode {
  id: string;
  agent_id?: string | null;
  role?: string;
  label?: string;
  position: { x: number; y: number };
}

export interface GraphEdge {
  id?: string;
  from: string;
  to: string;
  condition?: string;
}

// Map the Database type to our cleaner interface
type AgentGraphRow = Database['public']['Tables']['agent_graphs']['Row'];
type GraphExecutionRow = Database['public']['Tables']['graph_executions']['Row'];

export interface AgentGraph extends Omit<AgentGraphRow, 'nodes' | 'edges'> {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphExecution extends Omit<GraphExecutionRow, 'trace'> {
  trace: Array<{
    node_id: string;
    agent_id: string | null;
    agent_name: string;
    input: string;
    output: string;
    latency_ms: number;
    cost_cents: number;
    ts: string;
  }>;
}

export const agentGraphService = {
  async listGraphs(workspaceId: string): Promise<AgentGraph[]> {
    const { data, error } = await supabase
      .from('agent_graphs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as AgentGraph[];
  },

  async getGraph(id: string): Promise<AgentGraph> {
    const { data, error } = await supabase.from('agent_graphs').select('*').eq('id', id).single();
    if (error) throw error;
    return data as unknown as AgentGraph;
  },

  async createGraph(workspaceId: string, name: string, description = ''): Promise<AgentGraph> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error('Não autenticado');
    const { data, error } = await supabase
      .from('agent_graphs')
      .insert({ 
        workspace_id: workspaceId, 
        created_by: u.user.id, 
        name, 
        description, 
        nodes: [], 
        edges: [] 
      })
      .select()
      .single();
    if (error) throw error;
    return data as unknown as AgentGraph;
  },

  async updateGraph(id: string, patch: Partial<Pick<AgentGraph, 'name' | 'description' | 'nodes' | 'edges' | 'entry_node_id'>>): Promise<void> {
    const { error } = await supabase.from('agent_graphs').update(patch as any).eq('id', id);
    if (error) throw error;
  },

  async deleteGraph(id: string): Promise<void> {
    const { error } = await supabase.from('agent_graphs').delete().eq('id', id);
    if (error) throw error;
  },

  async executeGraph(graphId: string, input: string): Promise<{ execution_id: string; final_output: string; steps: number; total_cost_cents: number }> {
    const { data, error } = await supabase.functions.invoke('graph-execute', { body: { graph_id: graphId, input } });
    if (error) throw error;
    return data;
  },

  async listExecutions(graphId: string): Promise<GraphExecution[]> {
    const { data, error } = await supabase
      .from('graph_executions')
      .select('*')
      .eq('graph_id', graphId)
      .order('started_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []) as unknown as GraphExecution[];
  },

  async getExecution(id: string): Promise<GraphExecution> {
    const { data, error } = await supabase.from('graph_executions').select('*').eq('id', id).single();
    if (error) throw error;
    return data as unknown as GraphExecution;
  },
};
