import { Link, useLocation } from "react-router-dom";
import { ChevronRight, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Maps common path segments to readable labels
 */
const PATH_LABELS: Record<string, string> = {
  agents: "Agentes",
  new: "Novo",
  templates: "Templates",
  versions: "Versões",
  traces: "Traces",
  alerts: "Alertas",
  builder: "Builder",
  brain: "Super Cérebro",
  knowledge: "Conhecimento",
  memory: "Memória",
  tools: "Ferramentas",
  prompts: "Prompts",
  workflows: "Workflows",
  automation: "Automação",
  settings: "Configurações",
  billing: "Faturamento",
  team: "Equipe",
  monitoring: "Monitoramento",
  deployments: "Implantações",
  security: "Segurança",
  datahub: "DataHub",
  oracle: "Oráculo",
  approvals: "Aprovações",
  admin: "Admin BD",
  lgpd: "LGPD",
  chat: "Conversar",
  skills: "Skills",
  audit: "Auditoria",
  evaluations: "Avaliações",
  orchestration: "Orquestração",
  routing: "Roteamento",
  docs: "Documentação",
  partitioning: "Particionamento",
  "ai-studio": "AI Studio",
  "mcp-servers": "MCP Servers",
  "fine-tuning": "Fine-tuning",
  "data-storage": "Dados & Storage",
};

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);

  if (pathnames.length === 0) return null;

  return (
    <nav 
      className="flex items-center text-meta font-black uppercase tracking-[0.2em] text-muted-foreground/40" 
      aria-label="Navegação hierárquica"
    >
      <Link
        to="/"
        className="hover:text-primary transition-all flex items-center gap-1.5 group px-1 py-0.5 rounded-md hover:bg-primary/5"
        aria-label="Ir para o Dashboard"
      >
        <LayoutDashboard className="h-3.5 w-3.5 group-hover:scale-110 transition-transform text-primary/60" />
      </Link>

      {pathnames.map((value, index) => {
        const last = index === pathnames.length - 1;
        const to = `/${pathnames.slice(0, index + 1).join("/")}`;
        
        // Try to get a label, handle UUIDs or IDs
        let label = PATH_LABELS[value] || value;
        if (value.length > 20) label = value.substring(0, 8) + "...";

        return (
          <div key={to} className="flex items-center">
            <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground/20 stroke-[3px]" />
            {last ? (
              <span
                aria-current="page"
                className="text-foreground/90 font-black px-2 py-0.5 rounded-md bg-secondary/30 border border-border/40 shadow-nexus-sm animate-in fade-in slide-in-from-left-1 duration-300"
              >
                {label}
              </span>
            ) : (
              <Link
                to={to}
                className={cn(
                  "hover:text-primary transition-all px-1.5 py-0.5 rounded-md hover:bg-primary/5",
                  "focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none"
                )}
              >
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
