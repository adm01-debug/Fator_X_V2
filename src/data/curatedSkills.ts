/**
 * Catálogo curado de skills nativas do Nexus — fonte única da verdade.
 *
 * Motivação: a coleta automática no GitHub (skill-harvester) traz sobretudo
 * repositórios genéricos (awesome-lists, coletâneas), que foram despromovidos
 * na higiene do registry. Sem um núcleo curado, os 41 templates de agentes
 * especialistas ficam sem skills reais para vincular.
 *
 * Estas skills são determinísticas, escritas em PT-BR, cobrem os 10
 * departamentos da taxonomia canônica e são semeadas em `skill_registry`
 * com `author = 'Nexus'` e `source_repo = NULL`.
 *
 * O teste `src/test/curated-skills.test.ts` garante integridade (slugs únicos,
 * departamentos válidos, cobertura mínima por departamento).
 */
import type { SkillDepartment } from '@/config/skill-departments';

export type SkillCategory = 'tools' | 'knowledge' | 'prompts' | 'workflows' | 'integrations';

export interface CuratedSkill {
  slug: string;
  name: string;
  description: string;
  department: SkillDepartment;
  category: SkillCategory;
  tags: string[];
  /** Nota de qualidade atribuída na curadoria (0..100). */
  qualityScore: number;
}

export const CURATED_SKILLS: CuratedSkill[] = [
  // ----------------------------- FINANCEIRO -----------------------------
  {
    slug: 'nexus-conciliacao-bancaria',
    name: 'Conciliação Bancária Automática',
    description:
      'Compara extratos bancários com lançamentos do ERP, aponta divergências por valor, data e contraparte, e sugere a classificação contábil de cada item não conciliado.',
    department: 'financeiro',
    category: 'workflows',
    tags: ['financeiro', 'conciliacao', 'contabil', 'extrato', 'erp', 'fluxo', 'caixa'],
    qualityScore: 92,
  },
  {
    slug: 'nexus-regua-cobranca',
    name: 'Régua de Cobrança Inteligente',
    description:
      'Monta a régua de cobrança por faixa de atraso, gera mensagens personalizadas por perfil de cliente e prioriza os títulos com maior risco de inadimplência.',
    department: 'financeiro',
    category: 'workflows',
    tags: ['financeiro', 'cobranca', 'dunning', 'receivable', 'inadimplencia', 'fatura'],
    qualityScore: 90,
  },
  {
    slug: 'nexus-analise-dre',
    name: 'Analista de DRE e Fluxo de Caixa',
    description:
      'Lê a DRE e o fluxo de caixa do período, calcula margens, variações contra o orçamento e produz um resumo executivo com as três maiores alavancas de resultado.',
    department: 'financeiro',
    category: 'knowledge',
    tags: ['financeiro', 'dre', 'orcamento', 'budget', 'margem', 'fluxo', 'caixa', 'despesa'],
    qualityScore: 91,
  },
  {
    slug: 'nexus-validador-fiscal-nfe',
    name: 'Validador Fiscal de NF-e',
    description:
      'Confere CFOP, NCM, base de cálculo e alíquotas de notas fiscais eletrônicas, sinalizando riscos tributários antes da transmissão à SEFAZ.',
    department: 'financeiro',
    category: 'tools',
    tags: ['financeiro', 'fiscal', 'nfe', 'nota', 'tributario', 'imposto', 'contabil'],
    qualityScore: 88,
  },

  // ----------------------------- COMERCIAL ------------------------------
  {
    slug: 'nexus-qualificacao-bant',
    name: 'Qualificação de Leads BANT/MEDDIC',
    description:
      'Entrevista o lead, extrai orçamento, autoridade, necessidade e prazo, e devolve um score de qualificação com a próxima melhor ação para o vendedor.',
    department: 'comercial',
    category: 'prompts',
    tags: ['comercial', 'vendas', 'lead', 'qualificacao', 'sdr', 'pipeline', 'crm', 'prospect'],
    qualityScore: 94,
  },
  {
    slug: 'nexus-cadencia-outbound',
    name: 'Cadência de Prospecção Outbound',
    description:
      'Gera sequências multicanal de e-mail, telefone e LinkedIn com variação de copy por persona, respeitando intervalos e limites de toque por contato.',
    department: 'comercial',
    category: 'workflows',
    tags: ['comercial', 'cadencia', 'cadence', 'outbound', 'outreach', 'prospeccao', 'sdr'],
    qualityScore: 92,
  },
  {
    slug: 'nexus-gerador-proposta',
    name: 'Gerador de Propostas Comerciais',
    description:
      'Monta propostas e cotações a partir do catálogo de produtos, aplica política de desconto por faixa e produz o documento final pronto para assinatura.',
    department: 'comercial',
    category: 'tools',
    tags: ['comercial', 'proposta', 'proposal', 'cotacao', 'quote', 'orcamento', 'vendas', 'deal'],
    qualityScore: 90,
  },
  {
    slug: 'nexus-forecast-pipeline',
    name: 'Forecast de Pipeline',
    description:
      'Analisa o funil por estágio, calcula probabilidade ponderada de fechamento e alerta sobre negócios estagnados que ameaçam a meta do trimestre.',
    department: 'comercial',
    category: 'knowledge',
    tags: ['comercial', 'forecast', 'pipeline', 'funil', 'funnel', 'deal', 'quota', 'crm'],
    qualityScore: 89,
  },

  // -------------------------------- RH ----------------------------------
  {
    slug: 'nexus-triagem-curriculos',
    name: 'Triagem de Currículos',
    description:
      'Compara currículos com a descrição da vaga, pontua aderência por competência e gera perguntas de entrevista específicas para cada candidato.',
    department: 'rh',
    category: 'prompts',
    tags: ['rh', 'recrutamento', 'recruiting', 'curriculo', 'candidato', 'vaga', 'entrevista'],
    qualityScore: 93,
  },
  {
    slug: 'nexus-onboarding-colaborador',
    name: 'Onboarding de Colaborador',
    description:
      'Constrói o plano de integração dos primeiros 30/60/90 dias com acessos, treinamentos e checkpoints, e acompanha as pendências por responsável.',
    department: 'rh',
    category: 'workflows',
    tags: ['rh', 'onboarding', 'admissao', 'integracao', 'colaborador', 'treinamento'],
    qualityScore: 91,
  },
  {
    slug: 'nexus-analise-clima',
    name: 'Análise de Clima Organizacional',
    description:
      'Consolida respostas de pesquisas de clima, identifica temas recorrentes por área e propõe planos de ação priorizados por impacto na retenção.',
    department: 'rh',
    category: 'knowledge',
    tags: ['rh', 'clima', 'engajamento', 'retencao', 'pesquisa', 'cultura', 'pessoas'],
    qualityScore: 87,
  },
  {
    slug: 'nexus-conferencia-folha',
    name: 'Conferência de Folha de Pagamento',
    description:
      'Verifica proventos, descontos, encargos e horas extras da folha, apontando divergências contra a convenção coletiva e o mês anterior.',
    department: 'rh',
    category: 'tools',
    tags: ['rh', 'folha', 'payroll', 'pagamento', 'encargo', 'trabalhista', 'colaborador'],
    qualityScore: 88,
  },

  // -------------------------------- TI ----------------------------------
  {
    slug: 'nexus-triagem-incidentes',
    name: 'Triagem de Incidentes',
    description:
      'Classifica chamados por severidade e serviço afetado, sugere runbook aplicável e escala automaticamente quando o SLA está em risco.',
    department: 'ti',
    category: 'workflows',
    tags: ['ti', 'incidente', 'chamado', 'suporte', 'sla', 'runbook', 'oncall', 'observabilidade'],
    qualityScore: 93,
  },
  {
    slug: 'nexus-revisor-codigo',
    name: 'Revisor de Código e Segurança',
    description:
      'Revisa pull requests em busca de bugs, vazamento de segredos, injeção de SQL e regressões de performance, propondo o patch corrigido.',
    department: 'ti',
    category: 'tools',
    tags: ['ti', 'codigo', 'code', 'review', 'seguranca', 'security', 'devops', 'git'],
    qualityScore: 95,
  },
  {
    slug: 'nexus-diagnostico-rede',
    name: 'Diagnóstico de Rede e Infraestrutura',
    description:
      'Conduz troubleshooting guiado de rede, servidores e backups, coletando evidências em ordem e registrando a causa raiz encontrada.',
    department: 'ti',
    category: 'knowledge',
    tags: ['ti', 'rede', 'network', 'servidor', 'backup', 'infraestrutura', 'troubleshooting'],
    qualityScore: 89,
  },
  {
    slug: 'nexus-pipeline-cicd',
    name: 'Assistente de Pipeline CI/CD',
    description:
      'Interpreta falhas de build e deploy, isola o passo responsável e sugere a correção do pipeline com rollback seguro quando necessário.',
    department: 'ti',
    category: 'integrations',
    tags: ['ti', 'cicd', 'pipeline', 'deploy', 'build', 'devops', 'rollback', 'automacao'],
    qualityScore: 90,
  },

  // ----------------------------- MARKETING ------------------------------
  {
    slug: 'nexus-calendario-conteudo',
    name: 'Calendário Editorial de Conteúdo',
    description:
      'Planeja pautas por persona e etapa do funil, distribui os formatos entre os canais e entrega o calendário com briefing de cada peça.',
    department: 'marketing',
    category: 'workflows',
    tags: ['marketing', 'conteudo', 'content', 'editorial', 'pauta', 'funil', 'persona', 'seo'],
    qualityScore: 92,
  },
  {
    slug: 'nexus-otimizador-campanhas',
    name: 'Otimizador de Campanhas Pagas',
    description:
      'Analisa CPA, ROAS e criativos por conjunto de anúncios, recomenda realocação de verba e aponta anúncios com fadiga de audiência.',
    department: 'marketing',
    category: 'tools',
    tags: ['marketing', 'campanha', 'anuncio', 'ads', 'trafego', 'roas', 'cpa', 'performance'],
    qualityScore: 91,
  },
  {
    slug: 'nexus-auditoria-seo',
    name: 'Auditoria de SEO On-Page',
    description:
      'Audita títulos, meta descrições, headings, dados estruturados e Core Web Vitals, priorizando as correções por impacto orgânico estimado.',
    department: 'marketing',
    category: 'knowledge',
    tags: ['marketing', 'seo', 'organico', 'conteudo', 'keyword', 'serp', 'web', 'vitals'],
    qualityScore: 90,
  },
  {
    slug: 'nexus-social-listening',
    name: 'Monitor de Redes e Reputação',
    description:
      'Acompanha menções à marca, classifica sentimento por canal e alerta sobre picos negativos com sugestão de resposta oficial.',
    department: 'marketing',
    category: 'integrations',
    tags: ['marketing', 'social', 'redes', 'reputacao', 'sentimento', 'mencao', 'branding'],
    qualityScore: 87,
  },

  // ------------------------------ JURIDICO ------------------------------
  {
    slug: 'nexus-revisor-contratos',
    name: 'Revisor de Contratos',
    description:
      'Compara cláusulas contra a política interna, destaca riscos de multa, rescisão e foro, e sugere redação alternativa para cada ponto crítico.',
    department: 'juridico',
    category: 'prompts',
    tags: ['juridico', 'contrato', 'clausula', 'risco', 'legal', 'compliance', 'minuta'],
    qualityScore: 94,
  },
  {
    slug: 'nexus-checklist-lgpd',
    name: 'Checklist de Conformidade LGPD',
    description:
      'Mapeia bases legais, finalidades e retenção de dados pessoais por processo, apontando lacunas de conformidade e evidências pendentes.',
    department: 'juridico',
    category: 'knowledge',
    tags: ['juridico', 'lgpd', 'privacidade', 'compliance', 'dados', 'pessoais', 'auditoria'],
    qualityScore: 92,
  },
  {
    slug: 'nexus-triagem-processos',
    name: 'Triagem de Processos Judiciais',
    description:
      'Resume andamentos processuais, classifica risco de perda e valor de provisão, e monta a agenda de prazos com responsáveis.',
    department: 'juridico',
    category: 'workflows',
    tags: ['juridico', 'processo', 'judicial', 'prazo', 'provisao', 'risco', 'trabalhista'],
    qualityScore: 88,
  },
  {
    slug: 'nexus-parecer-trabalhista',
    name: 'Parecer Trabalhista Rápido',
    description:
      'Responde consultas trabalhistas citando CLT e convenção coletiva aplicável, com recomendação prática e nível de risco associado.',
    department: 'juridico',
    category: 'knowledge',
    tags: ['juridico', 'trabalhista', 'clt', 'convencao', 'parecer', 'legal', 'rh'],
    qualityScore: 87,
  },

  // ------------------------------ LOGISTICA -----------------------------
  {
    slug: 'nexus-controle-estoque',
    name: 'Controle de Estoque e Ruptura',
    description:
      'Monitora giro, cobertura e ponto de pedido por SKU, antecipando rupturas e sugerindo quantidades de reposição por fornecedor.',
    department: 'logistica',
    category: 'workflows',
    tags: ['logistica', 'estoque', 'inventario', 'ruptura', 'sku', 'reposicao', 'suprimentos'],
    qualityScore: 93,
  },
  {
    slug: 'nexus-roteirizacao-entregas',
    name: 'Roteirização de Entregas',
    description:
      'Agrupa pedidos por região, sugere a sequência de entrega com menor custo e prazo, e estima a janela de chegada por cliente.',
    department: 'logistica',
    category: 'tools',
    tags: ['logistica', 'entrega', 'rota', 'transporte', 'frete', 'expedicao', 'prazo'],
    qualityScore: 90,
  },
  {
    slug: 'nexus-cotacao-frete',
    name: 'Cotação e Auditoria de Frete',
    description:
      'Compara tabelas de transportadoras por peso, cubagem e rota, e audita faturas de frete cobradas acima do contratado.',
    department: 'logistica',
    category: 'integrations',
    tags: ['logistica', 'frete', 'transportadora', 'cotacao', 'cubagem', 'auditoria', 'custo'],
    qualityScore: 88,
  },
  {
    slug: 'nexus-conferencia-recebimento',
    name: 'Conferência de Recebimento',
    description:
      'Confere a nota fiscal contra o pedido de compra e o físico recebido, registrando divergências de quantidade, lote e avaria.',
    department: 'logistica',
    category: 'tools',
    tags: ['logistica', 'recebimento', 'conferencia', 'lote', 'avaria', 'compras', 'fornecedor'],
    qualityScore: 86,
  },

  // ------------------------------ POS_VENDA -----------------------------
  {
    slug: 'nexus-atendimento-suporte',
    name: 'Atendimento de Suporte ao Cliente',
    description:
      'Responde dúvidas com base na central de ajuda, identifica intenção e sentimento, e escala ao humano quando o risco de churn sobe.',
    department: 'pos_venda',
    category: 'prompts',
    tags: ['pos_venda', 'atendimento', 'suporte', 'cliente', 'ticket', 'helpdesk', 'churn'],
    qualityScore: 93,
  },
  {
    slug: 'nexus-analise-nps',
    name: 'Análise de NPS e CSAT',
    description:
      'Classifica comentários de NPS e CSAT por tema, quantifica detratores por causa raiz e propõe ações de recuperação por segmento.',
    department: 'pos_venda',
    category: 'knowledge',
    tags: ['pos_venda', 'nps', 'csat', 'satisfacao', 'feedback', 'cliente', 'experiencia'],
    qualityScore: 90,
  },
  {
    slug: 'nexus-playbook-retencao',
    name: 'Playbook de Retenção e Churn',
    description:
      'Detecta sinais de abandono no uso e no atendimento, dispara o playbook de retenção adequado e mede o resultado por coorte.',
    department: 'pos_venda',
    category: 'workflows',
    tags: ['pos_venda', 'retencao', 'churn', 'sucesso', 'cliente', 'coorte', 'playbook'],
    qualityScore: 89,
  },
  {
    slug: 'nexus-base-conhecimento-suporte',
    name: 'Curador da Base de Conhecimento',
    description:
      'Identifica perguntas sem resposta na central de ajuda, redige novos artigos e mantém os existentes atualizados por frequência de uso.',
    department: 'pos_venda',
    category: 'knowledge',
    tags: ['pos_venda', 'conhecimento', 'artigo', 'faq', 'central', 'ajuda', 'suporte'],
    qualityScore: 87,
  },

  // -------------------------------- DADOS -------------------------------
  {
    slug: 'nexus-analista-sql',
    name: 'Analista SQL',
    description:
      'Traduz perguntas de negócio em consultas SQL seguras sobre o modelo de dados, explica o plano de execução e valida o resultado.',
    department: 'dados',
    category: 'tools',
    tags: ['dados', 'sql', 'query', 'analytics', 'banco', 'database', 'relatorio'],
    qualityScore: 94,
  },
  {
    slug: 'nexus-qualidade-dados',
    name: 'Qualidade de Dados',
    description:
      'Executa testes de completude, unicidade e integridade referencial nas tabelas críticas e reporta as quebras com amostras.',
    department: 'dados',
    category: 'workflows',
    tags: ['dados', 'qualidade', 'quality', 'validacao', 'integridade', 'pipeline', 'etl'],
    qualityScore: 91,
  },
  {
    slug: 'nexus-construtor-dashboards',
    name: 'Construtor de Dashboards',
    description:
      'Define métricas, dimensões e granularidade a partir da pergunta do gestor e entrega a especificação pronta do painel.',
    department: 'dados',
    category: 'knowledge',
    tags: ['dados', 'dashboard', 'metrica', 'kpi', 'bi', 'visualizacao', 'relatorio'],
    qualityScore: 89,
  },
  {
    slug: 'nexus-deteccao-anomalias',
    name: 'Detecção de Anomalias em Séries',
    description:
      'Monitora séries temporais de negócio, sinaliza desvios estatisticamente relevantes e sugere hipóteses de causa.',
    department: 'dados',
    category: 'tools',
    tags: ['dados', 'anomalia', 'serie', 'temporal', 'estatistica', 'monitoramento', 'alerta'],
    qualityScore: 88,
  },

  // ------------------------------ EXECUTIVO -----------------------------
  {
    slug: 'nexus-acompanhamento-okr',
    name: 'Acompanhamento de OKRs',
    description:
      'Consolida o progresso dos resultados-chave por área, sinaliza metas em risco e prepara a pauta do check-in trimestral.',
    department: 'executivo',
    category: 'workflows',
    tags: ['executivo', 'okr', 'meta', 'indicador', 'kpi', 'estrategia', 'gestao'],
    qualityScore: 93,
  },
  {
    slug: 'nexus-briefing-executivo',
    name: 'Briefing Executivo Diário',
    description:
      'Reúne indicadores, incidentes e decisões pendentes em um resumo diário de uma página, com as três prioridades do dia.',
    department: 'executivo',
    category: 'prompts',
    tags: ['executivo', 'briefing', 'resumo', 'diario', 'prioridade', 'decisao', 'gestao'],
    qualityScore: 91,
  },
  {
    slug: 'nexus-analise-concorrencia',
    name: 'Análise de Concorrência',
    description:
      'Monitora movimentos de concorrentes em preço, produto e posicionamento, e resume as implicações estratégicas para o negócio.',
    department: 'executivo',
    category: 'knowledge',
    tags: ['executivo', 'concorrencia', 'mercado', 'estrategia', 'posicionamento', 'benchmark'],
    qualityScore: 89,
  },
  {
    slug: 'nexus-ata-reuniao',
    name: 'Ata e Follow-up de Reuniões',
    description:
      'Transforma a transcrição da reunião em ata estruturada com decisões, responsáveis e prazos, e cobra os pendentes no vencimento.',
    department: 'executivo',
    category: 'tools',
    tags: ['executivo', 'ata', 'reuniao', 'decisao', 'followup', 'prazo', 'produtividade'],
    qualityScore: 88,
  },
];

/** Quantidade de skills curadas por departamento. */
export function curatedCoverage(): Record<string, number> {
  return CURATED_SKILLS.reduce<Record<string, number>>((acc, s) => {
    acc[s.department] = (acc[s.department] ?? 0) + 1;
    return acc;
  }, {});
}
