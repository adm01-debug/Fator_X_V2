import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

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
};

export function Breadcrumbs() {
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);

  if (pathnames.length === 0) return null;

  return (
    <nav className="flex items-center space-x-1 text-[11px] font-black uppercase tracking-widest text-muted-foreground/60" aria-label="Breadcrumb">
      <Link
        to="/"
        className="hover:text-primary transition-colors flex items-center gap-1 group"
        aria-label="Início"
      >
        <Home className="h-3 w-3 mb-0.5 group-hover:scale-110 transition-transform" />
      </Link>

      {pathnames.map((value, index) => {
        const last = index === pathnames.length - 1;
        const to = `/${pathnames.slice(0, index + 1).join("/")}`;
        
        // Try to get a label, handle UUIDs or IDs by keeping them as is (or truncate)
        let label = PATH_LABELS[value] || value;
        if (value.length > 20) label = value.substring(0, 8) + "...";

        return (
          <div key={to} className="flex items-center space-x-1">
            <ChevronRight className="h-3 w-3 text-muted-foreground/30" />
            {last ? (
              <span className="text-foreground font-black border-b-2 border-primary/40 pb-0.5">
                {label}
              </span>
            ) : (
              <Link
                to={to}
                className="hover:text-primary transition-colors"
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
