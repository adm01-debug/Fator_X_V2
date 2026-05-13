# Nexus Agents Studio Onboarding

## Welcome!
Nexus is a high-performance agent orchestration platform built on Supabase Cloud and React.

## Stack Overview
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui.
- **Backend**: Supabase (PostgreSQL + RLS + Edge Functions).
- **Gateway**: Lovable AI Gateway for LLM provider abstraction.

## Getting Started
1. **Environment Setup**: Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set.
2. **Database Access**: All data operations should use `supabaseExternal` (Dual-Client architecture).
3. **Security**: Row Level Security (RLS) is active on 100% of tables. Always test your queries against RLS personas.

## Key Concepts
- **Agents**: Autonomous entities with specific missions and tools.
- **Workflows**: Multi-step automated sequences.
- **Super Cérebro**: RAG engine with vector embeddings.
