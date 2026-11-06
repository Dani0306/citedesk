-- CiteDesk T17 (prompt 005): the per-query fields the generation evals and the diagnosis table
-- need. Additive only, on a table that is still empty.

alter table citedesk.query_log
  add column answer text,
  add column refusal_reason text check (refusal_reason in ('low_score', 'not_in_sources', 'no_matches')),
  -- Markers pointing at no source retrieved for this query: hallucinated citations, target 0.
  add column invalid_citations integer not null default 0 check (invalid_citations >= 0),
  -- Prose sentences with no marker, a rough heuristic (lib/answer/citations.ts).
  add column uncited_sentences integer not null default 0 check (uncited_sentences >= 0),
  add constraint query_log_refusal_has_reason check (refused = (refusal_reason is not null)),
  add constraint query_log_answer_or_refusal check (refused or answer is not null);

comment on column citedesk.query_log.answer is 'The model''s answer verbatim; null on a refusal.';
