// The pinned corpus (open decision 1, closed 5 Nov 2026). Change the commit and every hash in
// `sources` changes with it, so the next ingest redoes the files that moved.

export const CORPUS = {
  repo: "https://github.com/supabase/supabase.git",
  commit: "aa9d04e4f77447e2b6aaf317b686007aff05aa96",
  guidesRoot: "apps/docs/content/guides",
  partialsRoot: "apps/docs/content/_partials",
  sections: ["database", "ai"],
  urlBase: "https://supabase.com/docs/guides",
} as const;

/** Paths the sparse checkout needs: the two guide sections plus the partials they include. */
export const SPARSE_PATHS = [
  ...CORPUS.sections.map((s) => `/${CORPUS.guidesRoot}/${s}/`),
  `/${CORPUS.partialsRoot}/`,
];

/** `database/postgres/indexes` from a path relative to the guides root, e.g. `database/postgres/indexes.mdx`. */
export function relPath(pathInGuides: string): string {
  return pathInGuides.replace(/\\/g, "/").replace(/\.mdx$/, "");
}

export function pageUrl(rel: string): string {
  return `${CORPUS.urlBase}/${rel}`;
}

export function sectionUrl(rel: string, anchor: string): string {
  return anchor ? `${pageUrl(rel)}#${anchor}` : pageUrl(rel);
}

/** Shared by every chunk of one section, so eval labels survive re-chunking. */
export function chunkKey(rel: string, anchor: string): string {
  return anchor ? `${rel}#${anchor}` : rel;
}
