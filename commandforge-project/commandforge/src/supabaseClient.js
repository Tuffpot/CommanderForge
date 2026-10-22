import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase environment variables. Copy .env.example to .env and fill in your project's URL and anon key."
  );
}

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "");
