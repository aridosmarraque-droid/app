import { Site, InspectionLog } from '../types';
import { supabase, checkSupabaseConfig } from './supabaseClient';

const SITES_KEY = 'sp_sites';
const INSPECTIONS_KEY = 'sp_inspections';

// Seed data: EMPTY now because we are connected to real data
const SEED_SITES: Site[] = [];

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
      let list = Array.isArray(parsed) ? parsed : [];

      // AUTO-CLEANUP: Remove the old demo site
      const hasDemo = list.some((s: any) => s.id === 'site-1');
      if (hasDemo) {
          list = list.filter((s: any) => s.id !== 'site-1');
          localStorage.setItem(SITES_KEY, JSON.stringify(list));
      }

      return list;
    } catch (e) {
      console.error("Error parsing sites", e);
      return [];
    }
  },

  downloadLatestSites: async () => {
    if (!checkSupabaseConfig() || !supabase || !navigator.onLine) return;

    try {
      const { data, error } = await supabase.from('sites').select('id, data');
      if (error) throw error;

      if (data) {
        const localSites = storageService.getSites();
        const siteMap = new Map(localSites.map(s => [s.id, s]));
        let hasChanges = false;

        data.forEach((row: any) => {
          const remoteSite = row.data as Site;
          const local = siteMap.get(remoteSite.id);
          
          if (!local || JSON.stringify(local) !== JSON.stringify(remoteSite)) {
             remoteSite.synced = true;
             siteMap.set(remoteSite.id, remoteSite);
             hasChanges = true;
          }
        });

        if (hasChanges) {
          const merged = Array.from(siteMap.values());
          localStorage.setItem(SITES_KEY, JSON.stringify(merged));
          window.dispatchEvent(new Event('sites-updated'));
        }
      }
    } catch (e) {
      console.error("Error downloading sites:", e);
    }
  },

  saveSite: async (site: Site) => {
    const sites = storageService.getSites();
    const index = sites.findIndex(s => s.id === site.id);
    site.synced = false; 
    if (index >= 0) sites[index] = site;
    else sites.push(site);
    
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
    window.dispatchEvent(new Event('sites-updated'));

    if (checkSupabaseConfig() && navigator.onLine && supabase) {
      try {
        const { error } = await supabase.from('sites').upsert({ id: site.id, data: site });
        if (!error) {
          const freshSites = storageService.getSites();
          const freshIndex = freshSites.findIndex(s => s.id === site.id);
          if (freshIndex >= 0) {
            freshSites[freshIndex].synced = true;
            localStorage.setItem(SITES_KEY, JSON.stringify(freshSites));
            window.dispatchEvent(new Event('sites-updated'));
          }
        }
      } catch (e) { console.warn("Site save offline", e); }
    }
  },

  deleteSite: async (siteId: string) => {
    const sites = storageService.getSites().filter(s => s.id !== siteId);
    localStorage.setItem(SITES_KEY, JSON.stringify(sites));
    window.dispatchEvent(new Event('sites-updated'));

    if (checkSupabaseConfig() && navigator.onLine && supabase) {
      await supabase.from('sites').delete().eq('id', siteId);
    }
  },

  // --- INSPECTIONS MANAGEMENT ---

  getInspections: (): InspectionLog[] => {
    try {
      const data = localStorage.getItem(INSPECTIONS_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return parsed.id ? [parsed] : [];
      return parsed;
    } catch (error) {
      return [];
    }
  },

  // NEW: Download FULL history from Supabase (PC to Mobile Sync)
  downloadLatestInspections: async () => {
    if (!checkSupabaseConfig() || !supabase || !navigator.onLine) return;

    try {
      // Fetch all inspections from cloud
      const { data, error } = await supabase.from('inspections').select('*');
      if (error) throw error;

      if (data) {
        const localLogs = storageService.getInspections();
        const logMap = new Map(localLogs.map(l => [l.id, l]));
        let hasChanges = false;

        data.forEach((row: any) => {
           // We prioritize the Cloud version if it has a PDF URL and local doesn't
           const existing = logMap.get(row.id);
           
           // If we don't have it locally, OR cloud has a PDF and we don't
           if (!existing || (row.pdf_url && !existing.pdfUrl)) {
              // Reconstruct the log object from the row
              // Note: row.data contains the JSON structure we saved
              const restoredLog: InspectionLog = {
                  ...row.data, 
                  pdfUrl: row.pdf_url, // Ensure top-level pdfUrl is set from column
                  synced: true
              };
              logMap.set(row.id, restoredLog);
              hasChanges = true;
           }
        });

        if (hasChanges) {
            const merged = Array.from(logMap.values());
            localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(merged));
            // Dispatch event so UI updates immediately
            window.dispatchEvent(new Event('inspections-updated'));
        }
      }
    } catch (e) {
        console.error("Error downloading history:", e);
    }
  },

  // Updated: Save metadata AND handles upload logic elsewhere
  saveInspection: async (inspection: InspectionLog) => {
    const inspections = storageService.getInspections();
    const existingIndex = inspections.findIndex(i => i.id === inspection.id);
    
    inspection.synced = false; 
    
    if (existingIndex >= 0) inspections[existingIndex] = inspection;
    else inspections.push(inspection);
    
    localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
    
    // Attempt sync immediately if no PDF is involved yet (drafts)
    if (checkSupabaseConfig() && navigator.onLine && supabase && !inspection.pdfUrl) {
       storageService.uploadInspectionToSupabase(inspection);
    }
  },

  // NEW: Upload PDF Blob to Storage and update DB
  uploadInspectionWithPDF: async (log: InspectionLog, pdfBlob: Blob) => {
      if (!checkSupabaseConfig() || !supabase) throw new Error("No hay conexión a la nube");

      const fileName = `${log.siteName.replace(/\s+/g, '_')}_${log.id}.pdf`;
      const filePath = `${fileName}`;

      // 1. Upload PDF to 'reports' bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
          .from('reports')
          .upload(filePath, pdfBlob, {
              contentType: 'application/pdf',
              upsert: true
          });

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: urlData } = supabase.storage.from('reports').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;

      // 3. Update Log object
      const updatedLog = { ...log, pdfUrl: publicUrl, synced: true };

      // 4. Save to Database (including pdf_url column)
      const { error: dbError } = await supabase.from('inspections').upsert({
          id: updatedLog.id,
          site_name: updatedLog.siteName,
          inspector_name: updatedLog.inspectorName,
          date: updatedLog.date,
          pdf_url: publicUrl, // Save URL in specific column
          data: updatedLog // Still save JSON for metadata/recovery, but PDF is master
      });

      if (dbError) throw dbError;

      // 5. Update Local Storage with the synced version (contains URL)
      await storageService.saveInspection(updatedLog);
      return publicUrl;
  },

  uploadInspectionToSupabase: async (log: InspectionLog) => {
    if (!supabase) return;
    
    const { error } = await supabase.from('inspections').upsert({
      id: log.id,
      site_name: log.siteName,
      inspector_name: log.inspectorName,
      date: log.date,
      pdf_url: log.pdfUrl || null,
      data: log
    });
    
    if (error) throw error;
    
    // Mark local as synced
    const inspections = storageService.getInspections();
    const idx = inspections.findIndex(i => i.id === log.id);
    if (idx >= 0) {
        inspections[idx].synced = true;
        localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
    }
  },

  syncPendingData: async () => {
    if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return { syncedCount: 0, error: null };

    // 1. Download Updates first (Sync PC -> Mobile)
    await storageService.downloadLatestSites();
    await storageService.downloadLatestInspections(); // <--- CRITICAL for cross-device history

    let syncedCount = 0;
    
    // 2. Upload Pending Inspections (Text data only, PDFs are uploaded manually at end of inspection)
    const pendingLogs = storageService.getInspections().filter(i => !i.synced);
    
    for (const log of pendingLogs) {
      try {
        await storageService.uploadInspectionToSupabase(log);
        syncedCount++;
      } catch (e) {
        console.error(`Failed to sync inspection ${log.id}`, e);
      }
    }

    // 3. Upload Pending Sites
    const pendingSites = storageService.getSites().filter(s => !s.synced);
    for (const site of pendingSites) {
      try {
         await supabase.from('sites').upsert({ id: site.id, data: site });
         // Update local synced status
         const allSites = storageService.getSites();
         const idx = allSites.findIndex(s => s.id === site.id);
         if (idx >= 0) {
             allSites[idx].synced = true;
             localStorage.setItem(SITES_KEY, JSON.stringify(allSites));
         }
      } catch (e) {}
    }

    return { syncedCount };
  }
};
