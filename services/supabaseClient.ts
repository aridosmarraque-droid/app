import { createClient } from '@supabase/supabase-js';

// --- CONFIGURACIÓN DE SUPABASE ---

// 1. Claves de Respaldo (Funcionan en local/preview)
const FALLBACK_URL = 'https://tdgyqgrzjkafxwfkqtix.supabase.co'; 
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3lxZ3J6amthZnh3ZmtxdGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjEyODQsImV4cCI6MjA4MDQ5NzI4NH0.qplUc1Dy1dUdQgijek-J0cA1aMOxwqia_8W7LhmbxiY';

// 2. Intentar leer variables de entorno de Vite (Vercel/Producción)
// Usamos una función auxiliar para leer de import.meta.env de forma segura
const getEnv = (key: string) => {
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {
    // Silencioso en caso de error
  }
  return undefined;
};

const envUrl = getEnv('VITE_SUPABASE_URL');
const envKey = getEnv('VITE_SUPABASE_ANON_KEY');

// 3. Selección de Credenciales (Prioridad: Entorno > Fallback)
const SUPABASE_URL = (envUrl && typeof envUrl === 'string' && envUrl.length > 0) ? envUrl : FALLBACK_URL;
const SUPABASE_ANON_KEY = (envKey && typeof envKey === 'string' && envKey.length > 0) ? envKey : FALLBACK_ANON_KEY;

// ---------------------------------

// Verificamos si las claves parecen válidas
const isConfigured = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;

// Log para depuración
console.log(`[Supabase] Init: ${isConfigured ? 'OK' : 'MISSING CONFIG'} | URL: ${SUPABASE_URL}`);

// 4. FIX: Almacenamiento en Memoria
// Evita que Supabase intente acceder a localStorage/cookies
const memoryStorage = {
  getItem: (key: string) => null,
  setItem: (key: string, value: string) => {},
  removeItem: (key: string) => {},
};

// 5. FIX: Fetch personalizado para evitar Tracking Prevention
// Forzamos 'credentials: omit' para que no se envíen cookies de terceros.
// Añadimos 'referrerPolicy: no-referrer' para privacidad adicional.
const customFetch = (input: any, init?: any) => {
  return fetch(input, {
    ...init,
    credentials: 'omit', // No enviar cookies
    referrerPolicy: 'no-referrer', // No enviar origen completo
  });
};

export const supabase = isConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: memoryStorage,
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        fetch: customFetch 
      }
    }) 
  : null;

export const checkSupabaseConfig = () => isConfigured;
