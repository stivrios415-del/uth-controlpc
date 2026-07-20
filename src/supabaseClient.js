import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase URL:', supabaseUrl); // Debe mostrar la URL
console.log('Supabase Key:', supabaseAnonKey); // Debe mostrar la clave

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan variables de entorno en .env');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    experimental: { passkey: true },
  },
});
