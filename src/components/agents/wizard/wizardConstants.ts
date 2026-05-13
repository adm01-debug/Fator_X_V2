import {
  Bot, Sparkles, Brain, Puzzle, FileText, Database, Rocket,
  User, MessageSquare, Search as SearchIcon,
  BarChart3, Headphones, Users, Layers,
  Globe, Code, Mail, Calendar, Hash, Webhook,
  LayoutTemplate, PenTool,
} from "lucide-react";

export const STEPS = [
  { key: "identity", label: "Identidade", icon: User, description: "Nome, descrição e objetivo" },
  { key: "type", label: "Tipo", icon: Bot, description: "Tipo do agente" },
  { key: "model", label: "Modelo", icon: Sparkles, description: "Modelo base de IA" },
  { key: "prompt", label: "Prompt", icon: FileText, description: "Prompt do sistema" },
  { key: "tools", label: "Ferramentas", icon: Puzzle, description: "Ferramentas habilitadas" },
  { key: "memory", label: "Memória", icon: Brain, description: "Configuração de memória" },
  { key: "knowledge", label: "Knowledge", icon: Database, description: "Base de conhecimento" },
  { key: "deploy", label: "Deploy", icon: Rocket, description: "Revisão e publicação" },
] as const;

export const TEMPLATE_STEPS = [
  { key: "select", label: "Escolher Template", icon: LayoutTemplate, description: "Selecione um modelo" },
  { key: "customize", label: "Personalizar", icon: PenTool, description: "Ajuste nome e prompt" },
  { key: "review", label: "Revisar & Criar", icon: Rocket, description: "Confirme e crie" },
] as const;

export const AGENT_TYPES = [
  { id: "chatbot", label: "Chatbot", icon: MessageSquare, desc: "Conversação com usuários finais" },
  { id: "copilot", label: "Copiloto", icon: Sparkles, desc: "Assistente para equipes internas" },
  { id: "analyst", label: "Analista", icon: BarChart3, desc: "Análise de dados e relatórios" },
  { id: "sdr", label: "SDR", icon: Users, desc: "Prospecção e qualificação de leads" },
  { id: "support", label: "Suporte", icon: Headphones, desc: "Atendimento L1/L2 automatizado" },
  { id: "researcher", label: "Pesquisador", icon: SearchIcon, desc: "Pesquisa web e análise documental" },
  { id: "orchestrator", label: "Orquestrador", icon: Layers, desc: "Coordena múltiplos sub-agentes" },
];

export const MODELS = [
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", cost: "Baixo", speed: "Instantâneo", quality: "Boa" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "Google", cost: "Médio", speed: "Rápido", quality: "Excelente" },
  { id: "google/gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "Google", cost: "Médio", speed: "Rápido", quality: "Máxima" },
  { id: "openai/gpt-5", name: "GPT-5", provider: "OpenAI", cost: "Alto", speed: "Médio", quality: "Máxima" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", provider: "OpenAI", cost: "Baixo", speed: "Rápido", quality: "Muito boa" },
  { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", provider: "Anthropic", cost: "Médio", speed: "Rápido", quality: "Excelente" },
];


export const TOOLS = [
  { id: "web_search", name: "Web Search", icon: Globe, category: "Busca" },
  { id: "code_exec", name: "Code Execution", icon: Code, category: "Dev" },
  { id: "sql_query", name: "SQL Query", icon: Database, category: "Dados" },
  { id: "email", name: "Email", icon: Mail, category: "Comunicação" },
  { id: "calendar", name: "Calendar", icon: Calendar, category: "Produtividade" },
  { id: "slack", name: "Slack", icon: Hash, category: "Comunicação" },
  { id: "webhook", name: "Webhooks", icon: Webhook, category: "Integração" },
  { id: "crm", name: "CRM", icon: Users, category: "Vendas" },
];

export const MEMORY_OPTIONS = [
  { id: "short_term", label: "Memória de curto prazo", desc: "Contexto da conversa atual", default: true },
  { id: "episodic", label: "Memória episódica", desc: "Interações passadas relevantes", default: false },
  { id: "semantic", label: "Memória semântica", desc: "Conhecimento geral aprendido", default: false },
  { id: "user_profile", label: "Perfil do usuário", desc: "Preferências e histórico do user", default: true },
  { id: "team_shared", label: "Memória compartilhada", desc: "Contexto do time/workspace", default: false },
];
