-- CiteDesk T23 (prompt 007): full-text search over chunks, headings weighted above body text.
-- A generated column can only call immutable functions and array_to_string is merely stable,
-- so heading_text wraps it; for text[] the output doesn't depend on any setting.
create function citedesk.heading_text(heading_path text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$ select pg_catalog.array_to_string(heading_path, ' ') $$;

alter table citedesk.chunks
  add column fts tsvector generated always as (
    setweight(to_tsvector('english'::regconfig, citedesk.heading_text(heading_path)), 'A') ||
    setweight(to_tsvector('english'::regconfig, content), 'B')
  ) stored;

create index chunks_fts_idx on citedesk.chunks using gin (fts);

-- Top-k chunks by keyword rank. The question's lexemes are ORed, not ANDed: websearch_to_tsquery
-- matched 0 of 835 chunks for natural-sentence questions (prompt 007). ts_rank_cd then rewards
-- chunks that cover more of them, headings (weight A) above body (weight B). The cosine similarity
-- to the query is returned too, so every fused chunk carries one and the refusal gate stays honest.
create or replace function citedesk.keyword_documents(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count integer default 50
)
returns table (
  id bigint,
  chunk_key text,
  heading_path text[],
  anchor text,
  source_url text,
  content text,
  similarity double precision,
  keyword_rank real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  q tsquery;
begin
  if match_count is null or match_count < 1 or match_count > 200 then
    raise exception 'match_count must be between 1 and 200, got %', match_count;
  end if;
  select pg_catalog.string_agg(pg_catalog.quote_literal(t.lexeme), ' | ')::tsquery
    into q
    from pg_catalog.unnest(pg_catalog.to_tsvector('english'::regconfig, coalesce(query_text, ''))) as t;
  if q is null then
    return;
  end if;
  return query
    select c.id, c.chunk_key, c.heading_path, c.anchor, c.source_url, c.content,
           (1 - (c.embedding operator(extensions.<=>) query_embedding))::double precision as similarity,
           pg_catalog.ts_rank_cd(c.fts, q) as keyword_rank
    from citedesk.chunks c
    where c.fts operator(pg_catalog.@@) q
    order by keyword_rank desc, c.id
    limit match_count;
end;
$$;

revoke execute on function citedesk.keyword_documents(text, extensions.vector, integer) from public, anon, authenticated;
grant execute on function citedesk.keyword_documents(text, extensions.vector, integer) to service_role;
revoke execute on function citedesk.heading_text(text[]) from public, anon, authenticated;
grant execute on function citedesk.heading_text(text[]) to service_role;
