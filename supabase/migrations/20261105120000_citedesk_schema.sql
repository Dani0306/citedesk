-- CiteDesk: the citedesk schema, pgvector, and the six tables (prompt 003, build guide T03).
-- Additive only. Retrieval indexes arrive with their tasks: HNSW + match_documents (T11),
-- the fts tsvector column + GIN index (T23, once the corpus language is fixed).

create schema if not exists citedesk;
create extension if not exists vector with schema extensions;

-- One row per source file. The two hashes make ingest idempotent: a file is re-chunked and
-- re-embedded only when its content or the chunking settings change (AGENTS.md §9).
create table citedesk.sources (
  id bigint generated always as identity primary key,
  path text not null unique check (length(path) between 1 and 500),
  source_url text not null check (source_url like 'https://%'),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  content_hash text not null,
  chunking_hash text not null,
  ingested_at timestamptz not null default now()
);

comment on table citedesk.sources is
  'One row per ingested source file, pinned to a commit. content_hash + chunking_hash decide whether ingest redoes it.';

-- One row per chunk. Every chunk of one section shares its chunk_key (source path + anchor), so
-- section-level eval labels survive re-chunking; (source_id, ordinal) is the unique key.
-- vector(1536) fixes text-embedding-3-small's dimension in the schema: vectors from another
-- model are meaningless next to these, so changing models means a new column and a re-embed.
create table citedesk.chunks (
  id bigint generated always as identity primary key,
  source_id bigint not null references citedesk.sources (id) on delete cascade,
  ordinal integer not null check (ordinal >= 0),
  chunk_key text not null check (length(chunk_key) between 1 and 600),
  heading_path text[] not null,
  anchor text not null,
  source_url text not null check (source_url like 'https://%'),
  content text not null check (length(content) > 0),
  token_count integer not null check (token_count > 0),
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);

comment on table citedesk.chunks is
  'One row per chunk, written together with its embedding. chunk_key is shared by the chunks of one section.';

-- The unique (source_id, ordinal) index leads with source_id, so it covers the foreign key.
create index chunks_chunk_key_idx on citedesk.chunks (chunk_key);

-- An answerable question lists the sections that should be retrieved; an unanswerable one lists none.
create table citedesk.eval_questions (
  id bigint generated always as identity primary key,
  question text not null check (length(question) between 1 and 2000),
  expected_chunk_keys text[] not null default '{}',
  answerable boolean not null,
  created_at timestamptz not null default now(),
  constraint eval_questions_labels_match_answerable check (answerable = (cardinality(expected_chunk_keys) > 0))
);

-- A copy of each eval run file (evals/runs/*.json stays the source of truth for the README).
create table citedesk.eval_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('retrieval', 'generation', 'judge')),
  config jsonb not null,
  models jsonb not null,
  prices_read_on date not null,
  cost_usd numeric(12, 8) not null check (cost_usd >= 0),
  results jsonb not null,
  created_at timestamptz not null default now()
);

-- One row per question asked through the app.
create table citedesk.query_log (
  id bigint generated always as identity primary key,
  query text not null check (length(query) between 1 and 2000),
  config jsonb not null,
  retrieved jsonb not null default '[]',
  rerank_status text not null check (rerank_status in ('applied', 'skipped', 'off')),
  cited_chunk_ids bigint[] not null default '{}',
  refused boolean not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_usd numeric(12, 8) not null default 0 check (cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

-- One row per model call, whatever the outcome. Same shape as the scripts' JSONL record
-- (ModelCallRecord in lib/calls/record.ts). raw_usage holds the provider's token counts only.
create table citedesk.model_calls (
  id bigint generated always as identity primary key,
  query_id bigint references citedesk.query_log (id) on delete set null,
  purpose text not null check (purpose in ('embed_document', 'embed_query', 'answer', 'rerank', 'judge', 'context')),
  model text not null check (length(model) between 1 and 100),
  outcome text not null check (outcome in ('ok', 'api_error', 'invalid_output')),
  input_tokens integer not null check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  reasoning_tokens integer not null default 0 check (reasoning_tokens >= 0),
  cost_usd numeric(12, 8) not null check (cost_usd >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  error text,
  raw_usage jsonb,
  created_at timestamptz not null default now(),
  constraint model_calls_error_matches_outcome check ((outcome = 'ok') = (error is null))
);

comment on table citedesk.model_calls is
  'One row per LLM, embedding or rerank call: tokens, cost, latency and outcome. Answer rows feed the daily demo cap.';

create index model_calls_query_id_idx on citedesk.model_calls (query_id);
-- The daily answer cap counts answer calls since midnight UTC.
create index model_calls_answer_created_at_idx on citedesk.model_calls (created_at) where purpose = 'answer';

-- Server-only access: RLS on with no policies, nothing for anon or authenticated, service_role only.
alter table citedesk.sources enable row level security;
alter table citedesk.chunks enable row level security;
alter table citedesk.eval_questions enable row level security;
alter table citedesk.eval_runs enable row level security;
alter table citedesk.query_log enable row level security;
alter table citedesk.model_calls enable row level security;

revoke all on schema citedesk from public, anon, authenticated;
grant usage on schema citedesk to service_role;
grant select, insert, update, delete on all tables in schema citedesk to service_role;
grant usage, select on all sequences in schema citedesk to service_role;
