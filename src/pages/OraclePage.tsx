import { useState } from 'react';
import { History, Sparkles, Brain, Search, Activity, Share2, AlertTriangle } from 'lucide-react';
import { useOracleStore } from '@/stores/oracleStore';
import { OracleInputArea } from '@/components/oracle/OracleInputArea';
import { OracleResultsPanel } from '@/components/oracle/OracleResultsPanel';
import { StageProgress } from '@/components/oracle/StageProgress';
import { OracleHistory } from '@/components/oracle/OracleHistory';
import { DeepResearchPanel } from '@/components/oracle/DeepResearchPanel';
import { OracleComparisonPanel } from '@/components/oracle/OracleComparisonPanel';
import { OracleAnalyticsPanel } from '@/components/oracle/OracleAnalyticsPanel';
import { AccessControl } from '@/components/rbac';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function OraclePage() {
  const store = useOracleStore();
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('consult');

  return (
    <div className="p-6 sm:p-10 lg:p-12 space-y-8 max-w-[1400px] mx-auto animate-page-enter bg-secondary/5 min-h-screen">
      <div className="bg-card border border-border p-8 rounded-3xl shadow-sm mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/[0.03] rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15 shadow-inner">
              <Sparkles className="h-9 w-9 text-primary animate-pulse" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-extrabold text-foreground tracking-tight flex items-center gap-3">
                Oráculo v2
                <Badge className="bg-primary/20 text-primary border-none text-[10px] font-bold px-2 py-0">PRO</Badge>
              </h1>
              <p className="text-sm text-muted-foreground max-w-md">O Conselho Multi-LLM definitivo para decisões complexas e pesquisa profunda</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" className="nexus-gradient-bg text-primary-foreground gap-1.5 h-10 rounded-xl px-5 font-bold shadow-lg shadow-primary/20" onClick={() => setActiveTab('research')}>
              <Search className="h-4 w-4" /> Deep Research
            </Button>
             <Button variant="outline" size="sm" className="gap-1.5 h-10 rounded-xl" onClick={() => setShowHistory(!showHistory)}>
              <History className="h-4 w-4" /> Histórico
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-10 rounded-xl">
              <Share2 className="h-4 w-4" /> Compartilhar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-8 space-y-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-muted/50 p-1 rounded-2xl h-12 w-full max-w-[400px] mb-6">
              <TabsTrigger value="consult" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Brain className="h-4 w-4" /> Consultar
              </TabsTrigger>
              <TabsTrigger value="research" className="rounded-xl flex-1 gap-2 font-bold data-[state=active]:bg-card data-[state=active]:shadow-sm">
                <Search className="h-4 w-4" /> Pesquisar
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="consult" className="space-y-6 mt-0">
              <OracleInputArea />
              {store.isRunning && <StageProgress mode={store.mode} currentStage={store.currentStage} />}
              {store.error && (
                <Card className="border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm text-destructive font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> {store.error}
                  </p>
                </Card>
              )}
              {store.results && <OracleResultsPanel />}
            </TabsContent>

            <TabsContent value="research" className="mt-0">
              <AccessControl permission="oracle.write">
                <DeepResearchPanel />
              </AccessControl>
            </TabsContent>
          </Tabs>

          {showHistory && (
            <Card className="p-6 rounded-2xl animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <History className="h-5 w-5 text-muted-foreground" />
                  Histórico de Consultas
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>Fechar</Button>
              </div>
              <OracleHistory />
            </Card>
          )}
        </div>

        {/* Sidebar / Stats */}
        <div className="lg:col-span-4 space-y-6">
          <OracleComparisonPanel />
          <OracleAnalyticsPanel />
          
          <Card className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Status do Conselho
            </h4>
            <div className="space-y-3">
              {[
                { label: 'Uptime', value: '99.9%', color: 'text-nexus-emerald' },
                { label: 'Modelos Prontos', value: '24/26', color: 'text-primary' },
                { label: 'Latência Média', value: '1.2s', color: 'text-foreground' },
              ].map(stat => (
                <div key={stat.label} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground font-medium">{stat.label}</span>
                  <span className={`font-bold ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
