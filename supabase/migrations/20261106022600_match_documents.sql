-- CiteDesk T11 (prompt 004): HNSW index on chunks.embedding and the match_documents function.
-- HNSW (rejected: IVFFlat) builds a neighbour graph that works on any amount of data and stays
-- good as rows arrive; IVFFlat needs data before it is built and probes tuning as it drifts.
-- The cosine operator class matches the <=> operator match_documents orders by.

create index chunks_embedding_hnsw_idx on citedesk.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- Top-k chunks by cosine similarity. It sizes HNSW's candidate list (hnsw.ef_search, default 40)
-- to the request so a top-50 pull can actually return 50 rows; see the measurement in prompt 004.
-- search_path is empty, so every name, including the operator, is schema-qualified.
create or replace function citedesk.match_documents(
  query_embedding extensions.vector(1536),
  match_count integer default 10
)
returns table (
  id bigint,
  chunk_key text,
  heading_path text[],
  anchor text,
  source_url text,
  content text,
  similarity double precision
)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if match_count is null or match_count < 1 or match_count > 200 then
    raise exception 'match_count must be between 1 and 200, got %', match_count;
  end if;
  perform set_config('hnsw.ef_search', greatest(match_count, 40)::text, true);
  return query
    select c.id, c.chunk_key, c.heading_path, c.anchor, c.source_url, c.content,
           (1 - (c.embedding operator(extensions.<=>) query_embedding))::double precision as similarity
    from citedesk.chunks c
    order by c.embedding operator(extensions.<=>) query_embedding
    limit match_count;
end;
$$;

-- Functions are executable by PUBLIC by default, which would let the publishable key call it.
revoke execute on function citedesk.match_documents(extensions.vector, integer) from public, anon, authenticated;
grant execute on function citedesk.match_documents(extensions.vector, integer) to service_role;
