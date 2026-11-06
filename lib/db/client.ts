import "server-only";
import { createClient } from "@supabase/supabase-js";

// The only Supabase client in the app: the secret key, scoped to the citedesk schema. RLS has
// no policies, so only this service_role client can read or write. Wrap every query in unwrap().

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

function makeClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SECRET_KEY"), {
    db: { schema: "citedesk" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let client: ReturnType<typeof makeClient> | undefined;

export function db() {
  client ??= makeClient();
  return client;
}
