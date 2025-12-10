import React, { useState, useEffect } from 'react';
import { Site, Area, InspectionPoint, Periodicity } from '../types';
import { storageService } from '../services/storageService';
import { geminiService } from '../services/geminiService';
import { checkSupabaseConfig, supabase } from '../services/supabaseClient';
import { Plus, Trash2, Save, Sparkles, X, Settings, ArrowUp, ArrowDown, Database, Copy, Check, Briefcase, RefreshCw, AlertTriangle, Phone, CalendarClock, Bot, Terminal, Key, Clock, Play, Send } from 'lucide-react';
import { toast } from 'react-hot-toast';

// Simple UUID generator fallback
const generateId = () => Math.random().toString(36).substring(2, 9);

export const AdminDashboard: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showDbGuide, setShowDbGuide] = useState(false);
  const [showCronGuide, setShowCronGuide] = useState(false);
  const [hasCopiedSql, setHasCopiedSql] = useState(false);
  const [hasCopiedCron, setHasCopiedCron] = useState(false);
  const [hasCopiedCronSql, setHasCopiedCronSql] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isRunningCron, setIsRunningCron] = useState(false);

  useEffect(() => {
    setSites(storageService.getSites());
  }, []);

  const handleCreateSite = () => {
    const newSite: Site = { id: generateId(), name: 'Nueva Cantera', areas: [] };
    setSites([...sites, newSite]);
    setEditingSite(newSite);
  };

  const handleDeleteSite = (id: string) => {
    if (confirm('¿Estás seguro de borrar esta instalación?')) {
      storageService.deleteSite(id);
      setSites(sites.filter(s => s.id !== id));
      if (editingSite?.id === id) setEditingSite(null);
    }
  };

  const handleSaveSite = () => {
    if (editingSite) {
      storageService.saveSite(editingSite);
      setSites(prev => prev.map(s => s.id === editingSite.id ? editingSite : s));
      toast.success('Cambios guardados');
      setEditingSite(null);
    }
  };

  const handleTestConnection = async () => {
    if (!checkSupabaseConfig() || !supabase) {
      toast.error("Configuración de Supabase inválida.");
      return;
    }
    
    setIsTestingConnection(true);
    const toastId = toast.loading("Verificando tablas y conexión...");
    
    try {
      // 1. Verificar tabla 'sites'
      const { error: sitesError } = await supabase
        .from('sites')
        .select('id')
        .limit(1);
        
      if (sitesError) throw new Error(`Error en tabla 'sites': ${sitesError.message}`);

      // 2. Verificar tabla 'inspections'
      const { error: inspError } = await supabase
        .from('inspections')
        .select('id')
        .limit(1);

      if (inspError) throw new Error(`Error en tabla 'inspections': ${inspError.message}`);
      
      toast.success(`Conexión Verificada`, { id: toastId });
      alert(`✅ TODO CORRECTO\n\nConexión establecida y tablas validadas.\nEl backend está listo para sincronizar datos.`);
    } catch (e: any) {
      console.error("Test Connection Error:", e);
      toast.error("Error de Verificación", { id: toastId });
      alert(`❌ Error de Conexión:\n\n${e.message}\n\nRevisa que has ejecutado el script SQL en Supabase para crear las tablas.`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleManualCronRun = async () => {
    if (!checkSupabaseConfig() || !supabase) {
        toast.error("No hay conexión con Supabase");
        return;
    }

    setIsRunningCron(true);
    const toastId = toast.loading("Ejecutando chequeo en la nube...");

    try {
        const { data, error } = await supabase.functions.invoke('check-inspections', {
            body: { manualTest: true }
        });
        
        if (error) {
            console.error("Supabase Function Error:", error);
            // Check for CORS or Fetch errors usually disguised
            if (error instanceof Error && (error.message.includes("FetchError") || error.message.includes("Failed to fetch"))) {
                 throw new Error("Error CORS/Red. Asegúrate de haber actualizado el código de la función (Deploy) para incluir los 'corsHeaders'.");
            }
            // Check for 404/500
            if (error instanceof Error && error.message.includes("FunctionsFetchError")) {
                throw new Error("La función no existe o no está desplegada (404/500).");
            }
            throw error;
        }
        
        const count = data?.sent || 0;
        if (count > 0) {
            toast.success(`¡Éxito! Se enviaron ${count} WhatsApps.`, { id: toastId });
        } else {
            toast.success("Chequeo completado. No hay inspecciones vencidas.", { id: toastId, icon: '👍' });
        }

    } catch (e: any) {
        console.error(e);
        toast.error(`Error: ${e.message}`, { id: toastId, duration: 5000 });
        if (e.message.includes("CORS")) {
             alert("⚠️ ERROR DE PERMISOS (CORS)\n\nEl navegador bloqueó la petición. \n\nSOLUCIÓN:\nCopia el NUEVO código de la función (abajo en la guía) y haz 'Deploy' de nuevo en Supabase. \n\nHe añadido las cabeceras 'Access-Control-Allow-Origin' necesarias.");
        }
    } finally {
        setIsRunningCron(false);
    }
  };

  const addArea = () => {
    if (!editingSite) return;
    const newArea: Area = { id: generateId(), name: 'Nueva Área', points: [] };
    setEditingSite({ ...editingSite, areas: [...editingSite.areas, newArea] });
  };

  const moveArea = (index: number, direction: 'up' | 'down') => {
    if (!editingSite) return;
    const newAreas = [...editingSite.areas];
    if (direction === 'up' && index > 0) {
      [newAreas[index], newAreas[index - 1]] = [newAreas[index - 1], newAreas[index]];
    } else if (direction === 'down' && index < newAreas.length - 1) {
      [newAreas[index], newAreas[index + 1]] = [newAreas[index + 1], newAreas[index]];
    }
    setEditingSite({ ...editingSite, areas: newAreas });
  };

  const movePoint = (areaIndex: number, pointIndex: number, direction: 'up' | 'down') => {
    if (!editingSite) return;
    
    const newAreas = [...editingSite.areas];
    const targetArea = { ...newAreas[areaIndex] };
    const newPoints = [...targetArea.points];

    if (direction === 'up' && pointIndex > 0) {
      [newPoints[pointIndex], newPoints[pointIndex - 1]] = [newPoints[pointIndex - 1], newPoints[pointIndex]];
    } else if (direction === 'down' && pointIndex < newPoints.length - 1) {
      [newPoints[pointIndex], newPoints[pointIndex + 1]] = [newPoints[pointIndex + 1], newPoints[pointIndex]];
    }
    
    targetArea.points = newPoints;
    newAreas[areaIndex] = targetArea;
    setEditingSite({ ...editingSite, areas: newAreas });
  };

  const addPoint = async (areaId: string, itemName: string = 'Nuevo Punto') => {
    if (!editingSite) return;
    
    // Optimistic UI update first
    const tempId = generateId();
    const newPoint: InspectionPoint = {
      id: tempId,
      name: itemName,
      question: '¿Estado correcto?',
      requiresPhoto: false
    };

    const updatedAreas = editingSite.areas.map(area => {
      if (area.id === areaId) {
        return { ...area, points: [...area.points, newPoint] };
      }
      return area;
    });
    setEditingSite({ ...editingSite, areas: updatedAreas });
  };

  const handleMagicFill = async (areaId: string, pointId: string, itemName: string) => {
    if (!itemName) return toast.error("Pon un nombre al elemento primero");
    
    setIsSuggesting(true);
    toast.loading('Consultando IA para sugerencias...', { id: 'ai-toast' });
    
    try {
      const suggestion = await geminiService.suggestInspectionDetails(itemName);
      
      setEditingSite(prev => {
        if (!prev) return null;
        return {
          ...prev,
          areas: prev.areas.map(area => {
            if (area.id === areaId) {
              return {
                ...area,
                points: area.points.map(pt => {
                  if (pt.id === pointId) {
                    return {
                      ...pt,
                      question: suggestion.question,
                      requiresPhoto: suggestion.requiresPhoto,
                      photoInstruction: suggestion.photoInstruction
                    };
                  }
                  return pt;
                })
              };
            }
            return area;
          })
        };
      });
      toast.success('¡Sugerencia aplicada!', { id: 'ai-toast' });
    } catch (e) {
      toast.error('Error al obtener sugerencias', { id: 'ai-toast' });
    } finally {
      setIsSuggesting(false);
    }
  };

  // --- SQL SNIPPETS & GUIDES ---

  const sqlSnippet = `
-- 1. TABLA DE SITIOS (Configuración)
create table if not exists sites (
  id text primary key,
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. TABLA DE INSPECCIONES (Resultados)
create table if not exists inspections (
  id text primary key,
  site_name text,
  inspector_name text,
  date text,
  pdf_url text, 
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. STORAGE (Para PDFs)
insert into storage.buckets (id, name, public) 
values ('reports', 'reports', true)
on conflict (id) do nothing;

drop policy if exists "Acceso Publico Reports" on storage.objects;
create policy "Acceso Publico Reports" on storage.objects for select using ( bucket_id = 'reports' );

drop policy if exists "Subida Publica Reports" on storage.objects;
create policy "Subida Publica Reports" on storage.objects for insert with check ( bucket_id = 'reports' );

-- 4. POLÍTICAS DE SEGURIDAD
alter table sites enable row level security;
drop policy if exists "Public sites" on sites;
create policy "Public sites" on sites for all using (true) with check (true);

alter table inspections enable row level security;
drop policy if exists "Public inspections" on inspections;
create policy "Public inspections" on inspections for all using (true) with check (true);
  `.trim();

  // Edge Function Code for Supabase (WITH CORS FIX)
  const edgeFunctionCode = `
import { createClient } from 'jsr:@supabase/supabase-js@2'

// CONFIGURACIÓN ULTRAMSG
const INSTANCE_ID = Deno.env.get('ULTRAMSG_INSTANCE_ID') || 'instance99999';
const TOKEN = Deno.env.get('ULTRAMSG_TOKEN') || 'token123456';

// HEADERS CORS (IMPORTANTE: Para evitar errores de bloqueo en navegador)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PERIOD_DAYS = {
  'mensual': 30,
  'trimestral': 90,
  'cuatrimestral': 120,
  'anual': 365
};

Deno.serve(async (req) => {
  // 1. GESTIONAR PREFLIGHT (OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { manualTest } = await req.json().catch(() => ({ manualTest: false }));

    // 2. Conectar a Base de Datos
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Obtener datos
    const { data: sites, error: siteError } = await supabase.from('sites').select('*');
    if (siteError) throw siteError;

    const { data: inspections, error: inspError } = await supabase
        .from('inspections')
        .select('id, data, date, site_name')
        .order('date', { ascending: false });
        
    if (inspError) throw inspError;

    let sentCount = 0;
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    for (const row of sites) {
        const site = row.data;
        if (!site.periodicity || !site.contactPhone) continue;

        // Verificar cooldown (Saltar si no es manualTest)
        const lastSent = site.lastReminderSent || 0;
        if (!manualTest && (now - lastSent < (7 * ONE_DAY))) {
             console.log(\`Skipping \${site.name} (Cooldown)\`);
             continue;
        }

        const lastInsp = inspections.find((i: any) => i.data.siteId === site.id);
        const lastDate = lastInsp ? new Date(lastInsp.date).getTime() : 0;
        const creationDate = row.created_at ? new Date(row.created_at).getTime() : 0;
        
        // CORRECCIÓN INTELIGENTE:
        // Si nunca se ha inspeccionado, usar fecha de creación del sitio
        const referenceDate = lastDate > 0 ? lastDate : creationDate;
        
        // Si referenceDate sigue siendo 0, asumir muy antiguo
        const effectiveDate = referenceDate > 0 ? referenceDate : (now - (366 * ONE_DAY)); 

        const daysElapsed = (now - effectiveDate) / ONE_DAY;
        const limit = PERIOD_DAYS[site.periodicity] || 30;

        if (daysElapsed >= limit) {
             const msg = \`⚠️ *RECORDATORIO DE INSPECCIÓN* ⚠️\\n\\nLa instalación *\${site.name}* requiere una inspección \${site.periodicity}.\\nÚltima inspección: \${lastDate > 0 ? new Date(lastDate).toLocaleDateString() : 'NUNCA'}\\nDías vencidos: \${Math.floor(daysElapsed - limit)}\\n\\nPor favor, acceda a la App para realizarla.\`;
             
             await fetch(\`https://api.ultramsg.com/\${INSTANCE_ID}/messages/chat\`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ token: TOKEN, to: site.contactPhone, body: msg })
             });

             site.lastReminderSent = now;
             await supabase.from('sites').update({ data: site }).eq('id', site.id);
             sentCount++;
             console.log(\`Enviado a \${site.name}\`);
        }
    }

    return new Response(JSON.stringify({ sent: sentCount }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
})
  `.trim();
  
  const cronSqlCode = `
-- ACTIVAR CRON DESDE BASE DE DATOS (PLAN B)
-- Ejecuta esto en SQL Editor si no encuentras el botón Schedule en la función.

-- 1. Habilitar extensiones necesarias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Crear el trabajo programado (ejecuta a las 8:00 AM)
-- REEMPLAZA <TU_PROYECTO> Y <TU_ANON_KEY>
select cron.schedule(
  'check-inspections-daily',
  '0 8 * * *',
  $$
  select
    net.http_post(
        url:='https://<TU_PROYECTO>.supabase.co/functions/v1/check-inspections',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer <TU_ANON_KEY>"}'::jsonb
    ) as request_id;
  $$
);
  `.trim();

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    toast.success("Copiado al portapapeles");
    setTimeout(() => setFn(false), 2000);
  };

  if (editingSite) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right pb-10">
        <div className="flex items-center justify-between mb-4 sticky top-16 bg-slate-50 py-2 z-10">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-500" />
            Editando Instalación
          </h2>
          <button onClick={handleSaveSite} className="bg-safety-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:bg-safety-700">
            <Save className="w-4 h-4" /> Guardar
          </button>
        </div>

        {/* Site Details Card */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre de la Cantera/Instalación</label>
              <input 
                type="text" 
                value={editingSite.name}
                onChange={(e) => setEditingSite({...editingSite, name: e.target.value})}
                className="w-full text-lg font-bold border-b-2 border-slate-200 focus:border-safety-500 outline-none py-1"
                placeholder="Ej. Cantera La Roca"
              />
          </div>

          {/* New Notification Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" /> Periodicidad Inspección
                  </label>
                  <select 
                      value={editingSite.periodicity || ''}
                      onChange={(e) => setEditingSite({...editingSite, periodicity: e.target.value as Periodicity})}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-safety-500"
                  >
                      <option value="">-- Sin Recordatorios --</option>
                      <option value="mensual">Mensual (30 días)</option>
                      <option value="trimestral">Trimestral (90 días)</option>
                      <option value="cuatrimestral">Cuatrimestral (120 días)</option>
                      <option value="anual">Anual (365 días)</option>
                  </select>
              </div>

              <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> Teléfono Responsable (WhatsApp)
                  </label>
                  <input 
                      type="tel"
                      value={editingSite.contactPhone || ''}
                      onChange={(e) => setEditingSite({...editingSite, contactPhone: e.target.value})}
                      placeholder="Ej. 34666123456"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-safety-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Incluir prefijo país sin '+'. Ej: 34...</p>
              </div>
          </div>
        </div>

        {/* Areas List */}
        <div className="space-y-6">
          <div className="flex justify-between items-center px-1">
             <h3 className="font-bold text-slate-700">Áreas y Recorrido</h3>
             <span className="text-xs text-slate-500">Ordena las áreas según la ruta de inspección</span>
          </div>

          {editingSite.areas.map((area, areaIdx) => (
            <div key={area.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-slate-100 p-3 border-b border-slate-200 flex justify-between items-center gap-2">
                
                {/* Reordering Controls */}
                <div className="flex flex-col gap-0.5">
                  <button 
                    onClick={() => moveArea(areaIdx, 'up')} 
                    disabled={areaIdx === 0}
                    className="p-1 hover:bg-white rounded text-slate-500 disabled:opacity-30"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => moveArea(areaIdx, 'down')}
                    disabled={areaIdx === editingSite.areas.length - 1}
                    className="p-1 hover:bg-white rounded text-slate-500 disabled:opacity-30"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">Nombre del Área</label>
                  <input 
                    type="text" 
                    value={area.name}
                    onChange={(e) => {
                      const newAreas = [...editingSite.areas];
                      newAreas[areaIdx].name = e.target.value;
                      setEditingSite({...editingSite, areas: newAreas});
                    }}
                    className="w-full bg-transparent font-bold text-slate-800 outline-none border-b border-transparent focus:border-slate-300"
                    placeholder="Nombre del Área"
                  />
                </div>
                
                <button 
                  onClick={() => {
                     const newAreas = editingSite.areas.filter(a => a.id !== area.id);
                     setEditingSite({...editingSite, areas: newAreas});
                  }}
                  className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  title="Eliminar Área"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Points in Area */}
              <div className="p-4 space-y-4">
                {area.points.map((point, pointIdx) => (
                  <div key={point.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200 relative group flex gap-2">
                     
                     {/* Point Reordering Controls */}
                     <div className="flex flex-col gap-1 justify-center border-r border-slate-200 pr-2 mr-1">
                        <button 
                          onClick={() => movePoint(areaIdx, pointIdx, 'up')}
                          disabled={pointIdx === 0}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-safety-600 disabled:opacity-20"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => movePoint(areaIdx, pointIdx, 'down')}
                          disabled={pointIdx === area.points.length - 1}
                          className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-safety-600 disabled:opacity-20"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                     </div>

                     <div className="flex-1 min-w-0">
                        <div className="flex justify-between mb-2">
                            <input 
                              value={point.name}
                              onChange={(e) => {
                                const newAreas = [...editingSite.areas];
                                newAreas[areaIdx].points[pointIdx].name = e.target.value;
                                setEditingSite({...editingSite, areas: newAreas});
                              }}
                              placeholder="Elemento (ej. Extintor)"
                              className="font-medium text-slate-800 bg-transparent outline-none w-2/3 border-b border-transparent focus:border-slate-300"
                            />
                            <div className="flex gap-2">
                                <button 
                                  onClick={() => handleMagicFill(area.id, point.id, point.name)}
                                  disabled={isSuggesting}
                                  className="text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md hover:bg-indigo-100 flex items-center gap-1 text-xs font-bold transition-colors"
                                  title="Autocompletar configuración con IA"
                                >
                                  <Sparkles className="w-3 h-3" /> IA
                                </button>
                                <button 
                                  onClick={() => {
                                    const newAreas = [...editingSite.areas];
                                    newAreas[areaIdx].points = newAreas[areaIdx].points.filter(p => p.id !== point.id);
                                    setEditingSite({...editingSite, areas: newAreas});
                                  }}
                                  className="text-slate-400 hover:text-red-500"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="grid gap-3">
                          <input 
                            value={point.question}
                            onChange={(e) => {
                                const newAreas = [...editingSite.areas];
                                newAreas[areaIdx].points[pointIdx].question = e.target.value;
                                setEditingSite({...editingSite, areas: newAreas});
                            }}
                            placeholder="Pregunta de control (ej. ¿Presión correcta?)"
                            className="text-sm w-full p-2 border border-slate-200 rounded bg-white focus:border-safety-400 outline-none"
                          />
                          <div className="flex items-center gap-3 bg-white p-2 rounded border border-slate-200">
                            <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer select-none">
                              <input 
                                  type="checkbox" 
                                  checked={point.requiresPhoto}
                                  className="accent-safety-600 w-4 h-4"
                                  onChange={(e) => {
                                    const newAreas = [...editingSite.areas];
                                    newAreas[areaIdx].points[pointIdx].requiresPhoto = e.target.checked;
                                    setEditingSite({...editingSite, areas: newAreas});
                                  }}
                              />
                              Requiere Foto
                            </label>
                            {point.requiresPhoto && (
                                <input 
                                value={point.photoInstruction || ''}
                                onChange={(e) => {
                                    const newAreas = [...editingSite.areas];
                                    newAreas[areaIdx].points[pointIdx].photoInstruction = e.target.value;
                                    setEditingSite({...editingSite, areas: newAreas});
                                }}
                                placeholder="Instrucción (ej. Foto del manómetro)"
                                className="text-sm flex-1 p-1 border-b border-slate-300 bg-transparent focus:border-safety-500 outline-none"
                                />
                            )}
                          </div>
                        </div>
                     </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => addPoint(area.id)}
                  className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-safety-400 hover:text-safety-600 hover:bg-safety-50 transition-all text-sm font-semibold flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Añadir Punto de Inspección
                </button>
              </div>
            </div>
          ))}

          <button 
            onClick={addArea}
            className="w-full py-4 bg-slate-800 text-white rounded-xl shadow-lg hover:bg-slate-700 font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <Plus className="w-5 h-5" /> Nueva Área
          </button>
        </div>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-2xl font-bold text-slate-800">Configuración</h2>
        <button onClick={handleCreateSite} className="bg-safety-600 text-white p-2 rounded-full shadow-lg hover:bg-safety-700">
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {/* --- START: DATABASE GUIDE --- */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
         <div 
           className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center cursor-pointer"
           onClick={() => setShowDbGuide(!showDbGuide)}
         >
             <div className="flex items-center gap-3">
                <Database className={`w-5 h-5 ${checkSupabaseConfig() ? 'text-green-500' : 'text-slate-400'}`} />
                <div>
                   <h3 className="font-bold text-slate-800 text-sm">Estado del Backend (Nube)</h3>
                   <p className="text-xs text-slate-500">
                     {checkSupabaseConfig() ? 'Conectado a Supabase' : 'Modo local (Sin sincronización)'}
                   </p>
                </div>
             </div>
             {showDbGuide ? <ArrowUp className="w-4 h-4 text-slate-400" /> : <ArrowDown className="w-4 h-4 text-slate-400" />}
         </div>
         
         {showDbGuide && (
             <div className="p-4 bg-slate-50 text-sm space-y-4 animate-in slide-in-from-top-2">
                 {/* Test Connection Button */}
                 {checkSupabaseConfig() && (
                   <button 
                     onClick={handleTestConnection}
                     disabled={isTestingConnection}
                     className="w-full py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-blue-100 mb-2"
                   >
                      {isTestingConnection ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Probar Conexión con Supabase
                   </button>
                 )}
                 
                 <ol className="list-decimal pl-4 space-y-2 text-slate-600">
                    <li>Crea una cuenta en <a href="https://supabase.com" target="_blank" className="text-blue-600 underline">supabase.com</a> y crea un proyecto.</li>
                    <li>
                        Ve al <strong>SQL Editor</strong> en Supabase y ejecuta este código (incluye creación de tablas y buckets):
                        <div className="relative mt-2">
                            <pre className="bg-slate-800 text-slate-200 p-3 rounded-lg text-xs overflow-x-auto">
                                {sqlSnippet}
                            </pre>
                            <button 
                                onClick={() => copyToClipboard(sqlSnippet, setHasCopiedSql)}
                                className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 rounded text-white"
                                title="Copiar SQL"
                            >
                                {hasCopiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </li>
                 </ol>
             </div>
         )}
      </div>
      {/* --- END: DATABASE GUIDE --- */}

      {/* --- START: AUTOMATION (CRON) GUIDE --- */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
         <div 
           className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center cursor-pointer"
           onClick={() => setShowCronGuide(!showCronGuide)}
         >
             <div className="flex items-center gap-3">
                <Bot className="w-5 h-5 text-indigo-600" />
                <div>
                   <h3 className="font-bold text-indigo-900 text-sm">Automatización (Cron Job)</h3>
                   <p className="text-xs text-indigo-500">
                     Configura avisos automáticos de WhatsApp 
                   </p>
                </div>
             </div>
             {showCronGuide ? <ArrowUp className="w-4 h-4 text-indigo-400" /> : <ArrowDown className="w-4 h-4 text-indigo-400" />}
         </div>
         
         {showCronGuide && (
             <div className="p-4 bg-indigo-50 text-sm space-y-4 animate-in slide-in-from-top-2">
                 <div className="flex justify-between items-center mb-4">
                     <p className="text-xs text-slate-600 max-w-[70%]">
                        Ejecuta una comprobación diaria (08:00 UTC) para detectar inspecciones vencidas.
                     </p>
                     
                     {/* MANUAL TRIGGER BUTTON */}
                     {checkSupabaseConfig() && (
                       <button 
                         onClick={handleManualCronRun}
                         disabled={isRunningCron}
                         className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-md hover:bg-indigo-700 active:scale-95 disabled:opacity-50 transition-all"
                       >
                         {isRunningCron ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                         Ejecutar Ahora (Test Manual)
                       </button>
                     )}
                 </div>

                 <h4 className="font-bold text-indigo-900 flex items-center gap-2 mt-4 border-b border-indigo-200 pb-1">
                     <Terminal className="w-4 h-4" /> 1. Código de la Función
                 </h4>
                 
                 <ol className="list-decimal pl-4 space-y-3 text-slate-700">
                    <li>Ve a <strong>Edge Functions</strong> en Supabase y crea <code>check-inspections</code>.</li>
                    <li>Copia este código y pégalo en el editor:
                        <div className="relative mt-2">
                            <pre className="bg-slate-900 text-slate-200 p-3 rounded-lg text-xs overflow-x-auto h-32">
                                {edgeFunctionCode}
                            </pre>
                            <button 
                                onClick={() => copyToClipboard(edgeFunctionCode, setHasCopiedCron)}
                                className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 rounded text-white"
                                title="Copiar Código"
                            >
                                {hasCopiedCron ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </li>
                 </ol>

                 <h4 className="font-bold text-indigo-900 flex items-center gap-2 mt-6 border-b border-indigo-200 pb-1">
                     <Key className="w-4 h-4" /> 2. Configurar Variables (Secrets)
                 </h4>
                 <div className="text-xs text-slate-600 space-y-2 mt-2">
                     <p>Las claves de UltraMsg NO van en el código. Se configuran en los ajustes globales del proyecto:</p>
                     <ul className="list-disc pl-5 space-y-1">
                         <li>Ve al menú principal izquierdo (la barra gris oscura lateral).</li>
                         <li>Pulsa el icono de engranaje ⚙️ (<strong>Project Settings</strong>) abajo del todo.</li>
                         <li>Selecciona <strong>Edge Functions</strong> en la lista.</li>
                         <li>Desactiva "Enforce JWT" (recomendado para Crons simples) o déjalo activo si sabes configurarlo.</li>
                         <li>Busca el botón <strong>"Add new secret"</strong>.</li>
                         <li>Añade <code>ULTRAMSG_INSTANCE_ID</code> y <code>ULTRAMSG_TOKEN</code> con tus valores reales.</li>
                     </ul>
                 </div>

                 <h4 className="font-bold text-indigo-900 flex items-center gap-2 mt-6 border-b border-indigo-200 pb-1">
                     <Clock className="w-4 h-4" /> 3. Activar Horario (Cron)
                 </h4>
                 <div className="text-xs text-slate-600 space-y-2 mt-2">
                     <p>Si no ves la opción "Schedule" en los detalles de la función, usa el <strong>SQL Editor</strong> para forzar la ejecución diaria:</p>
                     <div className="relative mt-2">
                        <pre className="bg-slate-800 text-yellow-50 p-3 rounded-lg text-xs overflow-x-auto">
                            {cronSqlCode}
                        </pre>
                        <button 
                            onClick={() => copyToClipboard(cronSqlCode, setHasCopiedCronSql)}
                            className="absolute top-2 right-2 p-1 bg-white/10 hover:bg-white/20 rounded text-white"
                            title="Copiar SQL Cron"
                        >
                            {hasCopiedCronSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                     </div>
                 </div>
             </div>
         )}
      </div>
      {/* --- END: AUTOMATION GUIDE --- */}

      <div className="space-y-4">
        {sites.map(site => (
            <div key={site.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex justify-between items-center">
            <div>
                <h3 className="font-bold text-lg">{site.name}</h3>
                <p className="text-sm text-slate-500">{site.areas.length} áreas configuradas</p>
                {site.periodicity && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full w-fit">
                    <CalendarClock className="w-3 h-3" />
                    <span className="capitalize">{site.periodicity}</span>
                  </div>
                )}
            </div>
            <div className="flex gap-2">
                <button onClick={() => setEditingSite(site)} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-700">
                <Settings className="w-5 h-5" />
                </button>
                <button onClick={() => handleDeleteSite(site.id)} className="p-2 bg-red-50 rounded-lg hover:bg-red-100 text-red-600">
                <Trash2 className="w-5 h-5" />
                </button>
            </div>
            </div>
        ))}
        
        {sites.length === 0 && (
            <div className="text-center py-10 text-slate-400">
                <Briefcase className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No hay canteras definidas.</p>
            </div>
        )}
      </div>
    </div>
  );
};
