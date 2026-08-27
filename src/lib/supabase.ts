import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || 'https://brwsxmmcvozyqavueyrh.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyd3N4bW1jdm96eXFhdnVleXJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzU2MDQsImV4cCI6MjEwMjgxMTYwNH0.Jk0kYB_QzJuapFYPMN6McNwZbDiU0pDLOV4WOMTtuiY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
  global: {
    fetch: (...args) => fetch(...args),
  },
});
