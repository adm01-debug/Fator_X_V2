import { logger } from '@/lib/logger';
import { useState, useMemo, lazy, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Search, Command } from "lucide-react";
import { NotificationsDrawer } from "@/components/shared/NotificationsDrawer";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { AgentDrilldownBadge } from "@/components/shared/AgentDrilldownBadge";
import { DirectionalTransition } from "@/components/shared/DirectionalTransition";
import { NavigationProgress } from "@/components/shared/NavigationProgress";
import { ScrollRestoration } from "@/components/shared/ScrollRestoration";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { SwipeNavigation } from "@/components/shared/SwipeNavigation";
import { UnsavedChangesProvider } from "@/hooks/use-unsaved-changes";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDocumentTitle } from "@/hooks/use-document-title";

// Lazy-load dialogs only shown on interaction.
// Retry once on failure — Vite dev/preview occasionally serves a stale chunk
// reference after HMR, surfacing as "Failed to fetch dynamically imported module".
// A single hard reload of the import resolves it without forcing a full page refresh.
function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      logger.warn("Dynamic import failed, retrying once:", err);
      await new Promise((r) => setTimeout(r, 150));
      try {
        return await factory();
      } catch (err2) {
        // Final fallback: force a full reload so the user is not stuck on a blank screen.
        logger.error("Dynamic import failed twice, reloading:", err2);
        if (typeof window !== "undefined") window.location.reload();
        throw err2;
      }
    }
  });
}

const CommandPalette = lazyWithRetry(() => import("@/components/shared/CommandPalette").then(m => ({ default: m.CommandPalette })));
const KeyboardShortcutsDialog = lazyWithRetry(() => import("@/components/shared/KeyboardShortcutsDialog").then(m => ({ default: m.KeyboardShortcutsDialog })));
const OnboardingTour = lazyWithRetry(() => import("@/components/shared/OnboardingTour").then(m => ({ default: m.OnboardingTour })));
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Keyboard, LogOut } from "lucide-react";

interface AppLayoutProps {
  children: React.ReactNode;
}

const SIDEBAR_KEY = "nexus-sidebar-state";

function getDefaultOpen() {
  try {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored !== "false";
  } catch (err) { logger.error("Operation failed:", err);
    return true;
  }
}

export function AppLayout({ children }: AppLayoutProps) {
  
  const [defaultOpen] = useState(getDefaultOpen);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { user, signOut } = useAuth();
  

  // Dynamic document title
  useDocumentTitle();

  // Network status detection
  useNetworkStatus();

  // Global keyboard shortcuts
  const shortcuts = useMemo(() => [
    { key: 'g', description: 'Ir para Dashboard', handler: () => navigate('/') },
    { key: 'a', description: 'Ir para Agentes', handler: () => navigate('/agents') },
    { key: 'n', shift: true, description: 'Novo Agente', handler: () => navigate('/agents/new') },
    { key: 'Backspace', alt: true, description: 'Voltar', handler: () => {
      if (window.history.length > 2) navigate(-1);
      else navigate('/');
    }},
  ], [navigate]);
  useKeyboardShortcuts(shortcuts);

  // Announce route changes for screen readers
  const pageTitle = useMemo(() => {
    const path = location.pathname;
    const titles: Record<string, string> = {
      '/': 'Dashboard',
      '/dashboard': 'Dashboard',
      '/agents': 'Agentes',
      '/brain': 'Super Cérebro',
      '/oracle': 'Oráculo',
      '/ai-studio': 'AI Studio',
      '/knowledge': 'Conhecimento / RAG',
      '/memory': 'Memória',
      '/tools': 'Ferramentas',
      '/prompts': 'Prompts',
      '/workflows': 'Workflows',
      '/automation': 'Automação',
      '/fine-tuning': 'Fine-tuning',
      '/smolagent': 'Smolagent',
      '/evaluations': 'Avaliações',
      '/deployments': 'Implantações',
      '/monitoring': 'Monitoramento',
      '/data-storage': 'Dados & Storage',
      '/datahub': 'DataHub',
      '/security': 'Segurança',
      '/lgpd': 'LGPD',
      '/approvals': 'Aprovações',
      '/team': 'Equipe',
      '/billing': 'Faturamento',
      '/settings': 'Configurações',
      '/admin': 'Admin BD',
    };
    // Match exact or prefix for dynamic routes
    if (titles[path]) return titles[path];
    for (const [route, title] of Object.entries(titles)) {
      if (path.startsWith(route + '/')) return title;
    }
    return 'Página';
  }, [location.pathname]);

  return (
    <UnsavedChangesProvider>
      <SidebarProvider
        defaultOpen={defaultOpen}
        onOpenChange={(open) => {
          try { localStorage.setItem(SIDEBAR_KEY, String(open)); } catch (err) { logger.error("Operation failed:", err);}
        }}
      >
        {/* Skip to content link — accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
        >
          Pular para o conteúdo
        </a>

        {/* Screen reader route announcer */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          Navegou para {pageTitle}
        </div>

        <NavigationProgress />
        <ScrollRestoration />
        <div className="min-h-screen flex w-full">
          <AppSidebar />
           <div className="flex-1 flex flex-col min-w-0">
             <header className="h-16 flex items-center justify-between border-b border-border/40 px-6 bg-background/80 backdrop-blur-md sticky top-0 z-40 transition-all duration-300" role="banner">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl h-10 w-10 transition-all shrink-0" aria-label="Alternar sidebar" />
                  <div className="h-6 w-px bg-border/40 hidden sm:block" />
                </div>
                
                {/* Breadcrumb Elevated */}
                <nav className="hidden sm:flex items-center gap-2 text-sm" aria-label="Breadcrumb">
                  <div className="h-2 w-2 rounded-full bg-primary/20 animate-pulse" />
                  <span className="font-black text-foreground uppercase tracking-widest text-[11px]">{pageTitle}</span>
                </nav>

                {/* Mobile search icon */}
                <button
                  onClick={() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
                  }}
                  className="md:hidden flex items-center justify-center h-10 w-10 rounded-xl bg-secondary/50 text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all shrink-0 ml-auto"
                  aria-label="Abrir busca rápida"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
                {/* Desktop search bar Elevated */}
                <button
                  onClick={() => {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
                  }}
                  className="hidden md:flex items-center gap-3 rounded-xl bg-secondary/30 border border-border/30 px-4 py-2 text-sm text-muted-foreground cursor-pointer hover:bg-secondary/50 hover:border-primary/30 transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:outline-none ml-auto group"
                  aria-label="Abrir busca rápida (⌘K)"
                >
                  <Search className="h-4 w-4 group-hover:text-primary transition-colors" aria-hidden="true" />
                  <span className="font-medium group-hover:text-foreground transition-colors">Busca Global...</span>
                  <kbd className="ml-6 inline-flex h-6 items-center gap-1 rounded-lg border border-border/40 bg-background/50 px-2 text-[10px] font-black font-mono text-muted-foreground/60 shadow-sm" aria-hidden="true">
                    <Command className="h-3 w-3" />K
                  </kbd>
                </button>
              </div>
              
              <div className="flex items-center gap-3 sm:gap-4 ml-4">
                <div className="flex items-center gap-1 bg-secondary/20 p-1 rounded-2xl border border-border/40">
                  <AgentDrilldownBadge />
                  <ThemeToggle />
                  <NotificationBell />
                </div>
                
                <NotificationsDrawer />
                
                <div className="h-8 w-px bg-border/40 hidden sm:block" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="relative h-10 w-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 overflow-hidden group hover:scale-105 transition-transform duration-300 shadow-lg shadow-primary/5"
                      aria-label="Menu do usuário"
                    >
                      {user?.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="h-full w-full nexus-gradient-bg flex items-center justify-center text-sm font-black text-primary-foreground">
                          {(user?.email?.[0] || 'U').toUpperCase()}
                        </div>
                      )}
                      <div className="absolute inset-0 border border-white/10 rounded-2xl pointer-events-none" />
                      <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-nexus-emerald border-2 border-background shadow-[0_0_8px_rgba(16,185,129,0.5)]" aria-label="Online" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 rounded-2xl border-border/40 shadow-2xl p-2">
                    <DropdownMenuLabel className="font-normal px-4 py-3">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-black text-foreground uppercase tracking-tight">Comando Central</p>
                        <p className="text-xs font-medium text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-border/40" />
                    <div className="p-1 space-y-1">
                      <DropdownMenuItem onClick={() => navigate('/settings')} className="gap-3 cursor-pointer rounded-xl py-2.5 font-bold text-xs uppercase tracking-wider">
                        <Settings className="h-4 w-4 text-primary" /> Configurações
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                        const event = new KeyboardEvent('keydown', { key: '?' });
                        window.dispatchEvent(event);
                      }} className="gap-3 cursor-pointer rounded-xl py-2.5 font-bold text-xs uppercase tracking-wider">
                        <Keyboard className="h-4 w-4 text-primary" /> Atalhos
                        <kbd className="ml-auto h-5 px-1.5 flex items-center justify-center rounded border border-border/40 bg-muted/50 text-[10px] font-black">?</kbd>
                      </DropdownMenuItem>
                    </div>
                    <DropdownMenuSeparator className="bg-border/40" />
                    <div className="p-1">
                      <DropdownMenuItem onClick={signOut} className="gap-3 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10 rounded-xl py-2.5 font-black text-xs uppercase tracking-wider">
                        <LogOut className="h-4 w-4" /> Encerrar Sessão
                      </DropdownMenuItem>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>
            <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1} aria-label={pageTitle}>
              <ErrorBoundary>
                {isMobile ? (
                  <SwipeNavigation>
                    <DirectionalTransition>
                      {children}
                    </DirectionalTransition>
                  </SwipeNavigation>
                ) : (
                  <DirectionalTransition>
                    {children}
                  </DirectionalTransition>
                )}
              </ErrorBoundary>
            </main>
          </div>
        </div>
        <Suspense fallback={null}>
          <CommandPalette />
          <KeyboardShortcutsDialog />
          <OnboardingTour />
        </Suspense>
      </SidebarProvider>
    </UnsavedChangesProvider>
  );
}
