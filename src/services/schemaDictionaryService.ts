/**
 * Dicionario de esquema do banco -- leitura de `semantic_dictionary`.
 *
 * A tabela guarda um snapshot do catalogo (pg_catalog): schemas, tabelas e
 * colunas, todos com descricao. Foi populada por um agente fora do
 * versionamento e ate agora nao tinha nenhuma tela. A leitura e restrita a
 * admin da workspace pela policy `admin_read_dictionary`.
 */

import { fromTable } from '@/lib/supabaseExtended';

export type SchemaObjectKind = 'schema' | 'table' | 'column';

export interface SchemaDictionaryEntry {
  id: string;
  object_key: string;
  object_kind: SchemaObjectKind;
  schema_name: string | null;
  relation_name: string | null;
  attribute_name: string | null;
  owner_name: string | null;
  description: string | null;
  existing_comment: string | null;
  catalog_metadata: Record<string, unknown> | null;
  captured_at: string;
}

const TABLE = 'semantic_dictionary';

/** Todos os objetos do snapshot, ordenados por schema e nome. */
export async function listSchemaDictionary(): Promise<SchemaDictionaryEntry[]> {
  const { data, error } = await fromTable(TABLE)
    .select('*')
    .order('schema_name', { ascending: true })
    .order('relation_name', { ascending: true })
    .order('attribute_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SchemaDictionaryEntry[];
}

/** Data da captura mais recente do snapshot. */
export function lastCapturedAt(entries: SchemaDictionaryEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries.reduce(
    (max, e) => (e.captured_at > max ? e.captured_at : max),
    entries[0].captured_at,
  );
}

export interface DictionaryStats {
  schemas: number;
  tables: number;
  columns: number;
  documented: number;
  total: number;
}

export function dictionaryStats(entries: SchemaDictionaryEntry[]): DictionaryStats {
  const schemas = entries.filter((e) => e.object_kind === 'schema').length;
  const tables = entries.filter((e) => e.object_kind === 'table').length;
  const columns = entries.filter((e) => e.object_kind === 'column').length;
  const documented = entries.filter((e) => (e.description ?? '').trim().length > 0).length;
  return { schemas, tables, columns, documented, total: entries.length };
}

/** Filtra por schema, tipo e texto livre (nome ou descricao). */
export function filterEntries(
  entries: SchemaDictionaryEntry[],
  opts: { schema?: string; kind?: SchemaObjectKind | 'all'; query?: string },
): SchemaDictionaryEntry[] {
  const q = (opts.query ?? '').trim().toLowerCase();
  return entries.filter((e) => {
    if (opts.schema && opts.schema !== 'all' && e.schema_name !== opts.schema) return false;
    if (opts.kind && opts.kind !== 'all' && e.object_kind !== opts.kind) return false;
    if (!q) return true;
    const hay = `${e.object_key} ${e.description ?? ''} ${e.relation_name ?? ''} ${e.attribute_name ?? ''}`;
    return hay.toLowerCase().includes(q);
  });
}