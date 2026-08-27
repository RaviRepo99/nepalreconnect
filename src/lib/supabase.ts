import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const hasSupabaseConfig = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  (supabaseAnonKey.startsWith("eyJ") || supabaseAnonKey.startsWith("sb_")),
);

export const supabaseConfigError = supabaseUrl && supabaseAnonKey && !hasSupabaseConfig
  ? "The Supabase API key is invalid or truncated."
  : null;

export const supabase = hasSupabaseConfig
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export const reportPhotoBucket = "report-photos";
