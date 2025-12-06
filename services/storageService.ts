import { Site, InspectionLog } from '../types';
import { supabase, checkSupabaseConfig } from './supabaseClient';

const SITES_KEY = 'sp_sites';
const INSPECTIONS_KEY = 'sp_inspections';

// Seed data
const SEED_SITES: Site[] = [
  {
    id: 'site-1',
    name: 'Cantera Los Álamos (Demo)',
    areas: [
      {
        id: 'area-1',
        name: 'Caseta de Control',
        points: [
          { id: 'pt-1', name: 'Extintor Principal', question: '¿El extintor está cargado?', requiresPhoto: true, photoInstruction: 'Foto manómetro' }
        ]
      }
    ]
  }
];

export const storageService = {
  // --- SITES MANAGEMENT ---

  getSites: (): Site[] => {
    try {
      const data = localStorage.getItem(SITES_KEY);
      if (!data) {
        localStorage.setItem(SITES_KEY, JSON.stringify(SEED_SITES));
        return SEED_SITES;
      }
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : SEED_SITES;
    } catch (e) {
      console.error("Error parsing sites", e);
      return SEED_SITES;
    }
  },

  saveSite: async (site: Site) => {
    const sites = storageService.getSites();
    const index = sites.findIndex(s => s.id === site.id);
    
    // Always mark as unsynced when modifying locally first
    site.synced = false; 
    
    if (index >= 0) sites[index] = site;
    else sites.push(site);
    
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));

    // Try Sync
    if (checkSupabaseConfig() && navigator.onLine && supabase) {
      try {
        const { error } = await supabase
          .from('sites')
          .upsert({ id: site.id, data: site });
        
        if (!error) {
          // Re-read to ensure we don't overwrite concurrent changes
          const freshSites = storageService.getSites();
          const freshIndex = freshSites.findIndex(s => s.id === site.id);
          if (freshIndex >= 0) {
            freshSites[freshIndex].synced = true;
            localStorage.setItem(SITES_KEY, JSON.stringify(freshSites));
          }
        } else {
            console.error("Supabase Save Site Error:", error);
        }
      } catch (e) {
        console.warn("Offline or Blocked: Site saved locally only.", e);
      }
    }
  },

  deleteSite: async (siteId: string) => {
    const sites = storageService.getSites().filter(s => s.id !== siteId);
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));

    if (checkSupabaseConfig() && navigator.onLine && supabase) {
      const { error } = await supabase.from('sites').delete().eq('id', siteId);
      if (error) console.error("Supabase Delete Site Error:", error);
    }
  },

  // --- INSPECTIONS MANAGEMENT ---

  getInspections: (): InspectionLog[] => {
    try {
      const data = localStorage.getItem(INSPECTIONS_KEY);
      if (!data) return [];
      
      const parsed = JSON.parse(data);
      // Critical check: Ensure it is an array
      if (!Array.isArray(parsed)) {
        // Attempt recovery if it's a single object wrapped oddly
        if (parsed && typeof parsed === 'object' && parsed.id) {
            return [parsed];
        }
        return [];
      }
      return parsed;
    } catch (error) {
      console.error("Error reading inspections:", error);
      return [];
    }
  },

  saveInspection: async (inspection: InspectionLog) => {
    // 1. ALWAYS Save Local First (Safety)
    // We read fresh data inside the function to avoid stale closures
    const inspections = storageService.getInspections();
    
    const existingIndex = inspections.findIndex(i => i.id === inspection.id);
    
    inspection.synced = false; 
    
    if (existingIndex >= 0) {
      inspections[existingIndex] = inspection;
    } else {
      inspections.push(inspection);
    }
    
    localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));

    // 2. Try Sync immediately if online
    if (checkSupabaseConfig() && navigator.onLine && supabase) {
      try {
         await storageService.uploadInspectionToSupabase(inspection);
         
         // 3. Mark as synced safely
         // Re-read storage again to make sure we don't overwrite new inspections added while we were uploading
         const freshInspections = storageService.getInspections();
         const targetIndex = freshInspections.findIndex(i => i.id === inspection.id);
         
         if(targetIndex >= 0) {
             freshInspections[targetIndex].synced = true;
             localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(freshInspections));
         }
         return true;
      } catch (error) {
        console.error("Upload failed, saved locally.", error);
        return false;
      }
    }
    return false;
  },

  // Helper to upload a single record
  uploadInspectionToSupabase: async (log: InspectionLog) => {
    if (!supabase) return;
    
    // Transform data for Supabase if needed, or send JSONB directly
    const { error } = await supabase.from('inspections').upsert({
      id: log.id,
      site_name: log.siteName,
      inspector_name: log.inspectorName,
      date: log.date,
      data: log
    });
    
    if (error) throw error;
  },

  // --- SYNC MECHANISM ---

  syncPendingData: async () => {
    if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return { syncedCount: 0, error: null };

    let syncedCount = 0;
    
    // 1. Sync Inspections
    // We get the list of IDs to sync first
    const initialInspections = storageService.getInspections();
    const pendingLogs = initialInspections.filter(i => !i.synced);
    
    for (const log of pendingLogs) {
      try {
        await storageService.uploadInspectionToSupabase(log);
        
        // Critical: Re-read storage before writing back the synced status
        // This prevents overwriting new inspections created during the upload of this one
        const currentList = storageService.getInspections();
        const itemIndex = currentList.findIndex(i => i.id === log.id);
        
        if (itemIndex >= 0) {
          currentList[itemIndex].synced = true;
          localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(currentList));
          syncedCount++;
        }
      } catch (e) {
        console.error(`Failed to sync inspection ${log.id}`, e);
      }
    }

    // 2. Sync Sites (Configuration)
    const sites = storageService.getSites();
    const pendingSites = sites.filter(s => !s.synced);
    
    for (const site of pendingSites) {
      try {
         const { error } = await supabase.from('sites').upsert({ id: site.id, data: site });
         if (error) throw error;

         // Re-read to save
         const currentSites = storageService.getSites();
         const siteIdx = currentSites.findIndex(s => s.id === site.id);
         if (siteIdx >= 0) {
             currentSites[siteIdx].synced = true;
             localStorage.setItem(SITES_KEY, JSON.stringify(currentSites));
         }
      } catch (e) { console.error("Site sync fail", e); }
    }

    return { syncedCount };
  }
};
