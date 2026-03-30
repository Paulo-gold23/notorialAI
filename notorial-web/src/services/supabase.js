import { createClient } from '@supabase/supabase-js'

// Variáveis de ambiente no Vite usam o prefixo VITE_ 
// Precisaremos adicioná-las no .env local do frontend depois.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sua-url.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || 'sua-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
