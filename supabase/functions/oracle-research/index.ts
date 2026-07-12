/**
 * ═══════════════════════════════════════════════════════════════
 * Nexus Agents Studio — Oracle Deep Research
 * ═══════════════════════════════════════════════════════════════
 * Iterative deep research: search → analyze → find gaps → search more → synthesize.
 * Honors client-side ResearchConfig: strategy, queries_per_iteration, limits,
 * stop_on_no_gaps, synthesis_model, language, include_internal.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  handleCorsPreflight, jsonResponse, errorResponse,
  authenticateRequest,
  checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
  parseBody, z,
} from "../_shared/mod.ts";

const LimitsSchema = z.object({
  max_tokens: z.number().int().min(1000).max(500_000).default(60_000),
  max_sources: z.number().int().min(5).max(50).default(20),
  max_latency_ms: z.number().int().min(30_000).max(600_000).default(180_000),
  max_cost_usd: z.number().min(0.1).max(20).default(2.0),
}).partial().default({});

const ResearchInput = z.object({
  query: z.string().min(10).max(5000),
  max_iterations: z.number().int().min(1).max(10).default(5),
  queries_per_iteration: z.number().int().min(1).max(5).default(3),
  strategy: z.enum(['broad', 'balanced', 'focused']).default('balanced'),
  depth: z.enum(['quick', 'standard', 'deep']).default('standard'),
  synthesis_model: z.string().default('claude-sonnet-4-6'),
  include_internal: z.boolean().default(true),
  stop_on_no_gaps: z.boolean().default(true),
  language: z.enum(['pt', 'en', 'es']).default('pt'),
  limits: LimitsSchema,
});

interface ResearchStep {
  iteration: number;
  action: string;
  query: string;
  findings: string;
  sources: string[];
  gaps_identified: string[];
  timestamp: number;
}

// Strategy → temperature + gap-followup style
const STRATEGY_TUNING: Record<'broad' | 'balanced' | 'focused', { temp: number; planTemp: number; description: string }> = {
  broad:    { temp: 0.7, planTemp: 0.6, description: 'Explore widely across diverse angles and adjacent topics.' },
  balanced: { temp: 0.4, planTemp: 0.3, description: 'Balance breadth of coverage with focused depth on key sub-questions.' },
  focused:  { temp: 0.2, planTemp: 0.15, description: 'Drill deep into the core question. Avoid tangents.' },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user, supabase } = auth;

    const identifier = getRateLimitIdentifier(req, user.id);
    const rateCheck = checkRateLimit(identifier, RATE_LIMITS.oracle);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck);

    const parsed = await parseBody(req, ResearchInput);
    if (parsed.error) return parsed.error;
    const {
      query, max_iterations, queries_per_iteration, strategy, depth,
      synthesis_model, include_internal, stop_on_no_gaps, language, limits,
    } = parsed.data;

    const maxTokensBudget = limits.max_tokens ?? 60_000;
    const maxSources = limits.max_sources ?? 20;
    const maxLatencyMs = limits.max_latency_ms ?? 180_000;
    const maxCostUsd = limits.max_cost_usd ?? 2.0;
    const tuning = STRATEGY_TUNING[strategy];

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization')!;
    const startTime = Date.now();
    const steps: ResearchStep[] = [];
    let allFindings = '';
    const allSources: string[] = [];
    let totalTokens = 0;
    const totalCost = 0;
    let stoppedReason: 'completed' | 'no_gaps' | 'budget_tokens' | 'budget_time' | 'budget_sources' = 'completed';

    // Optional internal RAG seeding (agent_memories) when include_internal=true
    if (include_internal) {
      try {
        const { data: memories } = await supabase
          .from('agent_memories_v2')
          .select('content')
          .textSearch('content', query.split(' ').slice(0, 6).join(' '), { type: 'websearch' })
          .limit(3);
        if (memories && memories.length > 0) {
          allFindings += `\n\n--- Internal Knowledge ---\n${memories.map((m) => (m as { content: string }).content).join('\n')}`;
        }
      } catch { /* internal search optional */ }
    }

    // ═══ Research Loop ═══
    let currentQuery = query;
    for (let i = 0; i < max_iterations; i++) {
      const iterStart = Date.now();

      // Budget guards
      if (Date.now() - startTime > maxLatencyMs) { stoppedReason = 'budget_time'; break; }
      if (totalTokens > maxTokensBudget) { stoppedReason = 'budget_tokens'; break; }
      if (allSources.length > maxSources) { stoppedReason = 'budget_sources'; break; }

      // Step 1: Plan search queries with strategy-aware prompt
      const planResp = await fetch(`${supabaseUrl}/functions/v1/llm-gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': anonKey },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          messages: [
            { role: 'system', content: `You are a research planner using a "${strategy}" strategy: ${tuning.description} Generate exactly ${queries_per_iteration} specific search queries to fill knowledge gaps. Return ONLY a JSON array of strings. Language: ${language}` },
            { role: 'user', content: `Main query: "${currentQuery}"\n\nPrevious findings:\n${allFindings.slice(-2000) || 'None yet'}\n\nGenerate ${queries_per_iteration} search queries:` },
          ],
          temperature: tuning.planTemp, max_tokens: 500,
        }),
      });
      const planData = await planResp.json();
      totalTokens += (planData as Record<string, Record<string, number>>).usage?.total_tokens || 0;

      let searchQueries: string[];
      try {
        const content = String((planData as Record<string, string>).content || '[]');
        searchQueries = JSON.parse(content.replace(/```json\n?|```/g, '').trim());
      } catch {
        searchQueries = [currentQuery];
      }
      searchQueries = searchQueries.slice(0, queries_per_iteration);

      // Step 2: Search (DuckDuckGo) — cap by max_sources remaining
      const searchResults: string[] = [];
      for (const sq of searchQueries) {
        if (allSources.length >= maxSources) break;
        try {
          const searchResp = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(sq)}&format=json&no_html=1`);
          const searchData = await searchResp.json();
          const abstract = String((searchData as Record<string, string>).Abstract || '');
          const relatedTopics = ((searchData as Record<string, Array<Record<string, string>>>).RelatedTopics || [])
            .slice(0, 3)
            .map(t => t.Text || '')
            .filter(Boolean);

          if (abstract) searchResults.push(abstract);
          searchResults.push(...relatedTopics);
          const url = String((searchData as Record<string, string>).AbstractURL || sq);
          if (url && !allSources.includes(url)) allSources.push(url);
        } catch { /* skip failed searches */ }
      }

      // Step 3: Analyze + identify gaps
      const analyzeResp = await fetch(`${supabaseUrl}/functions/v1/llm-gateway`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': anonKey },
        body: JSON.stringify({
          model: depth === 'deep' ? synthesis_model : 'claude-haiku-4-5-20251001',
          messages: [
            { role: 'system', content: `Analyze search results for the research query using a "${strategy}" strategy. Summarize key findings. Identify up to 3 remaining gaps (empty array if none). Language: ${language}. Return JSON: {"findings": "...", "gaps": ["..."]}` },
            { role: 'user', content: `Query: "${query}"\nSearch results:\n${searchResults.join('\n\n').slice(0, 3000)}` },
          ],
          temperature: tuning.temp, max_tokens: 1500,
        }),
      });
      const analyzeData = await analyzeResp.json();
      totalTokens += (analyzeData as Record<string, Record<string, number>>).usage?.total_tokens || 0;

      let findings = '';
      let gaps: string[] = [];
      try {
        const content = String((analyzeData as Record<string, string>).content || '{}');
        const parsedAnalysis = JSON.parse(content.replace(/```json\n?|```/g, '').trim());
        findings = parsedAnalysis.findings || content;
        gaps = Array.isArray(parsedAnalysis.gaps) ? parsedAnalysis.gaps : [];
      } catch {
        findings = String((analyzeData as Record<string, string>).content || '');
      }

      allFindings += `\n\n--- Iteration ${i + 1} ---\n${findings}`;

      steps.push({
        iteration: i + 1,
        action: 'search_and_analyze',
        query: searchQueries.join(' | '),
        findings,
        sources: allSources.slice(-5),
        gaps_identified: gaps,
        timestamp: Date.now() - iterStart,
      });

      if (depth === 'quick') break;
      if (stop_on_no_gaps && gaps.length === 0) { stoppedReason = 'no_gaps'; break; }
      currentQuery = gaps[0] ?? currentQuery;
    }

    // ═══ Final Synthesis ═══
    const synthesisResp = await fetch(`${supabaseUrl}/functions/v1/llm-gateway`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'apikey': anonKey },
      body: JSON.stringify({
        model: synthesis_model,
        messages: [
          { role: 'system', content: `You are an expert researcher. Synthesize all findings into a comprehensive, well-structured report in ${language === 'pt' ? 'Portuguese' : language === 'es' ? 'Spanish' : 'English'}. Use a "${strategy}" tone. Include sections with headers. Cite sources where possible. Be thorough and analytical.` },
          { role: 'user', content: `Research query: "${query}"\n\nAll findings from ${steps.length} iterations:\n${allFindings}\n\nSources found: ${[...new Set(allSources)].join(', ')}\n\nWrite a comprehensive report:` },
        ],
        temperature: Math.min(0.6, tuning.temp + 0.1), max_tokens: 8000,
      }),
    });
    const synthesisData = await synthesisResp.json();
    totalTokens += (synthesisData as Record<string, Record<string, number>>).usage?.total_tokens || 0;

    const report = String((synthesisData as Record<string, string>).content || 'Report generation failed');
    const totalLatency = Date.now() - startTime;

    // Persist (both success and stopped-by-budget)
    await supabase.from('oracle_history').insert({
      query,
      mode: 'deep_research',
      result: { report, steps, sources: [...new Set(allSources)], stopped_reason: stoppedReason, strategy, depth },
      total_tokens: totalTokens,
      total_cost: totalCost,
      latency_ms: totalLatency,
    });

    return jsonResponse(req, {
      report,
      iterations: steps.length,
      sources: [...new Set(allSources)],
      total_tokens: totalTokens,
      latency_ms: totalLatency,
      depth,
      strategy,
      stopped_reason: stoppedReason,
      budgets: { maxTokensBudget, maxSources, maxLatencyMs, maxCostUsd },
      steps,
    });

  } catch (error) {
    return errorResponse(req, error instanceof Error ? error.message : 'Research failed', 500);
  }
});
