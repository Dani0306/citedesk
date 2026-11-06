// Demo mode (T31): questions a visitor can click instead of typing. Three answer from the corpus,
// one sits outside it and shows the refusal; each was checked live (prompts 005, 007).
export const SAMPLE_QUESTIONS = [
  "How do I create a partial index?",
  "How do I enable row level security on a table?",
  "When should I pick HNSW over IVFFlat?",
  "How do I set up TOTP MFA in Supabase Auth?",
] as const;

export const MAX_QUESTION_CHARS = 2000;
