import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type GroupRecord = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type WordRecord = {
  id: string;
  user_id: string;
  group_id: string;
  word: string;
  pronunciation: string;
  meaning: string;
  explanation: string;
  example_sentence: string;
  note: string;
  favorite: boolean;
  seen_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;
