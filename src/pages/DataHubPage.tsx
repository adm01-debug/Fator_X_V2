import { useState, useMemo, useEffect, useCallback } from 'react';
import { useDatahubStore } from '@/stores/datahubStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Search, Database, ArrowRight, Eye, RefreshCcw, Table2, 
  Link2, Loader2, CheckCircle2, Snowflake, Server, Activity, 
  Code2, Brain, GitBranch, ShieldCheck, Network, 
  Layers
} from 'lucide-react';
import { ENTITY_MAPPINGS, ENTITY_LIST } from '@/config/datahub-entities';
import { DataBrowser } from '@/components/datahub/DataBrowser';
import { DataHubHealthTab } from '@/components/datahub/DataHubHealthTab';
import { DataHubQueryBuilderTab } from '@/components/datahub/DataHubQueryBuilderTab';
import { DataHubIdentityResolutionTab } from '@/components/datahub/DataHubIdentityResolutionTab';
import { DataHubSyncTab } from '@/components/datahub/DataHubSyncTab';
import { DataHubExplorerTab } from '@/components/datahub/DataHubExplorerTab';
import { DataHubPermissionsTab } from '@/components/datahub/DataHubPermissionsTab';
import { HibernatedDatabasesPanel } from '@/components/datahub/HibernatedDatabasesPanel';
import { ConnectionCard, DEFAULT_CONNECTIONS, type ConnectionDef } from '@/components/datahub/ConnectionCard';
import { EntityDetailPanel, ENTITY_ICONS, getConnectionLabel } from '@/components/datahub/EntityDetailPanel';
import { MCPServerPanel } from '@/components/datahub/MCPServerPanel';
import { DATAHUB_TABLE_BLACKLIST } from '@/config/datahub-blacklist';
import { streamInvoke } from '@/services/datahubService';
import { NLPAnalysisDialog } from '@/components/shared/NLPAnalysisDialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function DataHubPage() {
  const datahubActions = useDatahubStore();
  const storeSelectEntity = datahubActions.selectEntity;
  const [search, setSearch] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [browsingEntity, setBrowsingEntity] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionDef[]>(DEFAULT_CONNECTIONS);
  const [entityCounts, setEntityCounts] = useState<Record<string, number>>({});
  const [testingConnections, setTestingConnections] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);


  // Sync entity selection to store
  useEffect(() => { storeSelectEntity(selectedEntity); }, [selectedEntity, storeSelectEntity]);

  const testConnections = useCallback(async () => {
    setTestingConnections(true);
    setIsStreaming(true);

    try {
      const now = new Date();
      // Start streaming connection tests
      await streamInvoke('test_connections', {}, (event: string, data: any) => {
        if (event === 'connection') {
          setConnections((prev) => prev.map((c) => {
            if (c.id === data.id) {
              return { 
                ...c, 
                status: data.status === 'connected' ? 'connected' as const : 'error' as const, 
                count: data.count, 
                error: data.error,
                latency: data.latency_ms,
                lastTested: now 
              };
            }
            return c;
          }));
        }
        if (event === 'done') {
          toast.success('Teste de conexões concluído!');
        }
      });

    } catch (e: unknown) { 
      toast.error(`Erro ao testar conexões: ${e instanceof Error ? e.message : String(e)}`); 
    } finally { 
      setTestingConnections(false); 
      setIsStreaming(false);
    }

  }, []);

  const loadEntityCounts = useCallback(async () => {
    setLoadingCounts(true);
    setIsStreaming(true);

    try { 
      await streamInvoke('list_entities', {}, (event: string, data: any) => {
        if (event === 'entity_count') {
          setEntityCounts(prev => ({ ...prev, [data.id]: data.count }));
        }
      });

    } catch (e: unknown) { 
      toast.error(`Erro ao carregar contagens: ${e instanceof Error ? e.message : String(e)}`); 
    } finally { 
      setLoadingCounts(false); 
      setIsStreaming(false);
    }

  }, []);


  useEffect(() => { testConnections(); loadEntityCounts(); }, [testConnections, loadEntityCounts]);

  const filteredEntities = useMemo(() => {
    if (!search.trim()) return ENTITY_LIST;
    const q = search.toLowerCase();
    return ENTITY_LIST.filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q) || e.primary.connection.toLowerCase().includes(q) || e.primary.table.toLowerCase().includes(q));
  }, [search]);

  const selectedMapping = selectedEntity ? ENTITY_MAPPINGS[selectedEntity] : null;
  const activeConnections = connections.filter((c) => c.status !== 'hibernated');
  const connectedCount = activeConnections.filter((c) => c.status === 'connected').length;
  const totalRecords = Object.values(entityCounts).reduce((sum, v) => sum + (v >= 0 ? v : 0), 0);
  const crossDbCount = ENTITY_LIST.reduce((acc, e) => acc + (e.cross_db?.length ?? 0), 0);

  if (browsingEntity) {
    return (
      <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="sm" onClick={() => setBrowsingEntity(null)} className="rounded-xl h-10 px-4 gap-2 font-bold border-border/40 hover:bg-secondary/50">
            <ArrowRight className="h-4 w-4 rotate-180" /> Voltar ao Hub
          </Button>
          <div className="h-4 w-px bg-border/40 mx-2" />
          <h2 className="text-xl font-heading font-black text-foreground">Explorador de Dados</h2>
        </div>
        <DataBrowser entityId={browsingEntity} onClose={() => setBrowsingEntity(null)} />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 space-y-10 max-w-[1440px] mx-auto animate-page-enter">
      {/* Header Elevated 10/10 */}
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/40 p-10 rounded-[2.5rem] shadow-2xl shadow-primary/5 mb-10 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/[0.04] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:bg-primary/[0.06] transition-colors duration-500 pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 relative">
          <div className="flex items-center gap-7">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20 shadow-2xl shadow-primary/10 group-hover:scale-105 transition-transform duration-500">
              <Database className="h-11 w-11 text-primary animate-float" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-heading font-black text-foreground tracking-tight sm:text-5xl">DataHub</h1>
                <Badge className="bg-nexus-cyan/10 text-nexus-cyan border-none font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase">Grid de Dados Industrial</Badge>
              </div>
              <p className="text-title-sm text-muted-foreground max-w-xl font-medium leading-relaxed">
                Orquestração unificada de dados. Gerencie entidades, conexões federadas e mapeamentos cross-database com precisão industrial.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 text-nexus-emerald font-black text-body-sm uppercase tracking-tighter">
                <ShieldCheck className="h-4 w-4" /> Federado & Seguro
              </div>
              <p className="text-meta text-muted-foreground font-bold tracking-widest uppercase">Conectividade Ativa</p>
            </div>
            <div className="h-10 w-px bg-border/40 mx-4" />
            {isStreaming && (
              <Badge className="bg-nexus-cyan/20 text-nexus-cyan border-nexus-cyan/30 animate-pulse font-black px-3 py-1 rounded-full text-meta tracking-widest uppercase mr-4">
                <Activity className="h-3 w-3 mr-1" /> Live Stream Ativo
              </Badge>
            )}
            <NLPAnalysisDialog />

          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Entidades Mapeadas', value: ENTITY_LIST.length, icon: Layers, color: 'text-nexus-cyan', bg: 'bg-nexus-cyan/10' },
          { label: 'Conexões Ativas', value: `${connectedCount}/${activeConnections.length}`, icon: Network, color: 'text-nexus-purple', bg: 'bg-nexus-purple/10' },
          { label: 'Registros Totais', value: totalRecords.toLocaleString(), icon: Activity, color: 'text-nexus-emerald', bg: 'bg-nexus-emerald/10' },
          { label: 'Cross-DB Joins', value: crossDbCount, icon: GitBranch, color: 'text-nexus-amber', bg: 'bg-nexus-amber/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-card border border-border/40 p-6 rounded-[2rem] flex items-center gap-5 hover:border-primary/20 transition-all group">
            <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform", stat.bg)}>
              <stat.icon className={cn("h-7 w-7", stat.color)} />
            </div>
            <div>
              <p className="text-meta font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-black text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="entities" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="entities" className="gap-1.5"><Database className="h-3.5 w-3.5" /> Entidades</TabsTrigger>
          <TabsTrigger value="explorer" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Explorer</TabsTrigger>
          <TabsTrigger value="connections" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> Conexões</TabsTrigger>
          <TabsTrigger value="schema" className="gap-1.5"><Table2 className="h-3.5 w-3.5" /> Schema</TabsTrigger>
          <TabsTrigger value="mcp" className="gap-1.5"><Server className="h-3.5 w-3.5" /> MCP Server</TabsTrigger>
          <TabsTrigger value="health" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Health</TabsTrigger>
          <TabsTrigger value="query" className="gap-1.5"><Code2 className="h-3.5 w-3.5" /> Query</TabsTrigger>
          <TabsTrigger value="identity" className="gap-1.5"><Link2 className="h-3.5 w-3.5" /> Identity</TabsTrigger>
          <TabsTrigger value="sync" className="gap-1.5"><Brain className="h-3.5 w-3.5" /> Sync</TabsTrigger>
          <TabsTrigger value="permissions" className="gap-1.5"><GitBranch className="h-3.5 w-3.5" /> Permissions</TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar entidade, tabela ou conexão..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/30" />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-meta ml-3" onClick={loadEntityCounts} disabled={loadingCounts}>
              {loadingCounts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Atualizar Contagens
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {ENTITY_LIST.map((entity) => {
              const Icon = ENTITY_ICONS[entity.id] ?? Database;
              const count = entityCounts[entity.id];
              return (
                <button key={entity.id} onClick={() => setBrowsingEntity(entity.id)} className="nexus-card p-3 text-center hover:border-primary/40 hover:bg-primary/5 transition-all group">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2 group-hover:bg-primary/20 transition-colors"><Icon className="h-4 w-4 text-primary" /></div>
                  <p className="text-meta font-semibold text-foreground">{entity.name}</p>
                  {count !== undefined && count >= 0 && <p className="text-meta text-muted-foreground font-mono mt-0.5">{count.toLocaleString()}</p>}
                  {count === -1 && <p className="text-meta text-destructive mt-0.5">erro</p>}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
            <div className="space-y-2">
              {filteredEntities.map((entity) => {
                const Icon = ENTITY_ICONS[entity.id] ?? Database;
                const isSelected = selectedEntity === entity.id;
                const count = entityCounts[entity.id];
                return (
                  <button key={entity.id} onClick={() => setSelectedEntity(isSelected ? null : entity.id)} className={`w-full text-left nexus-card p-4 transition-all hover:border-primary/30 ${isSelected ? 'border-primary/50 ring-1 ring-primary/20 bg-primary/5' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${isSelected ? 'bg-primary/20' : 'bg-primary/10'}`}><Icon className="h-4.5 w-4.5 text-primary" /></div>
                        <div>
                          <h3 className="text-body-sm font-semibold text-foreground">{entity.name}</h3>
                          <p className="text-meta text-muted-foreground font-mono">{entity.primary.table} → {getConnectionLabel(entity.primary.connection)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {count !== undefined && count >= 0 && <Badge variant="secondary" className="text-meta font-mono">{count.toLocaleString()}</Badge>}
                        {(entity.secondary?.length ?? 0) > 0 && <Badge variant="secondary" className="text-meta">+{entity.secondary?.length} joins</Badge>}
                        {(entity.cross_db?.length ?? 0) > 0 && <Badge variant="outline" className="text-meta border-nexus-emerald/30 text-nexus-emerald">{entity.cross_db?.length} cross-db</Badge>}
                        <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </button>
                );
              })}
              {filteredEntities.length === 0 && <div className="text-center py-8 text-body-sm text-muted-foreground">Nenhuma entidade encontrada para "{search}"</div>}
            </div>
            <div>
              {selectedEntity && selectedMapping ? (
                <EntityDetailPanel entityId={selectedEntity} mapping={selectedMapping} onBrowse={setBrowsingEntity} />
              ) : (
                <div className="nexus-card flex flex-col items-center justify-center py-16 text-center">
                  <Eye className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-body-sm text-muted-foreground">Selecione uma entidade para ver o mapeamento completo</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="connections" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-body-sm text-muted-foreground"><span className="font-semibold text-foreground">{connectedCount}</span> de {activeConnections.length} conexões ativas</p>
            <Button variant="outline" size="sm" className="gap-1.5 text-meta" onClick={testConnections} disabled={testingConnections}>
              {testingConnections ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Testar Conexões
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">{connections.map((conn) => <ConnectionCard key={conn.id} conn={conn} />)}</div>
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground flex items-center gap-2"><Link2 className="h-4 w-4 text-nexus-emerald" /> Mapeamentos Cross-Database</h3>
            <div className="space-y-2">
              {ENTITY_LIST.filter((e) => e.cross_db && e.cross_db.length > 0).map((entity) => (
                <div key={entity.id} className="rounded-lg bg-secondary/20 border border-border/20 p-3">
                  <div className="flex items-center gap-2 mb-2"><span>{entity.icon}</span><span className="text-body-sm font-semibold text-foreground">{entity.name}</span></div>
                  {entity.cross_db?.map((cross, i) => (
                    <div key={i} className="flex items-center gap-2 text-meta text-muted-foreground ml-6">
                      <span className="font-mono text-foreground">{getConnectionLabel(entity.primary.connection)}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-mono text-nexus-emerald">{getConnectionLabel(cross.connection)}</span>
                      <span className="text-muted-foreground/60">via {cross.match_by}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="space-y-4">
          <div className="nexus-card space-y-3">
            <h3 className="text-body-sm font-semibold text-foreground">Tabelas Blacklisted ({(DATAHUB_TABLE_BLACKLIST as Set<string>).size})</h3>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(DATAHUB_TABLE_BLACKLIST as Set<string>).sort().map((t) => <Badge key={t} variant="outline" className="text-meta font-mono text-destructive/70 border-destructive/20">{t}</Badge>)}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {connections.map((conn) => {
              const entities = ENTITY_LIST.filter((e) => e.primary.connection === conn.id);
              const allTables = new Set<string>();
              entities.forEach((e) => { allTables.add(e.primary.table); e.secondary?.forEach((s) => allTables.add(s.table)); });
              return (
                <div key={conn.id} className={`nexus-card space-y-2 ${conn.status === 'hibernated' ? 'opacity-50' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span>{conn.icon}</span><h4 className="text-body-sm font-semibold text-foreground">{conn.label}</h4>
                    <Badge variant="secondary" className="text-meta">{allTables.size} tabelas</Badge>
                    {conn.status === 'connected' && <CheckCircle2 className="h-3.5 w-3.5 text-nexus-emerald" />}
                    {conn.status === 'hibernated' && <Snowflake className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  {allTables.size > 0 ? (
                    <div className="flex flex-wrap gap-1">{Array.from(allTables).sort().map((t) => <Badge key={t} variant="outline" className="text-meta font-mono">{t}</Badge>)}</div>
                  ) : <p className="text-meta text-muted-foreground italic">Nenhuma tabela mapeada</p>}
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-4"><MCPServerPanel /></TabsContent>
        <TabsContent value="health" className="space-y-4"><DataHubHealthTab /><HibernatedDatabasesPanel /></TabsContent>
        <TabsContent value="query" className="space-y-4"><DataHubQueryBuilderTab /></TabsContent>
        <TabsContent value="identity" className="space-y-4"><DataHubIdentityResolutionTab /></TabsContent>
        <TabsContent value="sync" className="space-y-4"><DataHubSyncTab /></TabsContent>
        <TabsContent value="explorer" className="space-y-4"><DataHubExplorerTab /></TabsContent>
        <TabsContent value="permissions" className="space-y-4"><DataHubPermissionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
