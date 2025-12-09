import { Site, InspectionLog } from '../types';
import { supabase, checkSupabaseConfig } from './supabaseClient';

const SITES_KEY = 'sp_sites';
const INSPECTIONS_KEY = 'sp_inspections';

// Seed data: EMPTY now because we are connected to real data
const SEED_SITES: Site[] = [];

// Helper to remove heavy data from logs to save space
const stripHeavyData = (log: InspectionLog): InspectionLog => {
    return {
        ...log,
        answers: log.answers.map(a => ({ ...a, photoUrl: undefined })) // Remove base64 photos
    };
};

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

  // Used for background updates
  downloadLatestSites: async () => {
    if (!checkSupabaseConfig() || !supabase || !navigator.onLine) return;

    try {
      const { data, error } = await supabase.from('sites').select('id, data');
      if (error) throw error;
      // We don't force replace here to avoid UI jumps, just update existing
      // Ideally rely on performInitialLoad for clean slate
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
    
    try {
        localStorage.setItem(SITES_KEY, JSON.stringify(sites));
        window.dispatchEvent(new Event('sites-updated'));
    } catch (e) {
        console.error("Storage Full (Sites)", e);
    }

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

  downloadLatestInspections: async () => {
    // This method is for background sync, keeps it gentle
    if (!checkSupabaseConfig() || !supabase || !navigator.onLine) return;
    // Implementation left for background checks if needed, 
    // but performInitialLoad does the heavy lifting now.
  },

  // Updated: Save metadata AND handles upload logic elsewhere
  saveInspection: async (inspection: InspectionLog) => {
    let inspections = storageService.getInspections();
    const existingIndex = inspections.findIndex(i => i.id === inspection.id);
    
    inspection.synced = false; 
    
    if (existingIndex >= 0) inspections[existingIndex] = inspection;
    else inspections.push(inspection);
    
    try {
        localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
    } catch (e: any) {
        // QUOTA EXCEEDED HANDLING
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("Storage Full! Attempting cleanup...");
            
            // 1. Remove photos from ALREADY SYNCED inspections
            // We keep the log for history, but remove heavy base64 strings
            inspections = inspections.map(i => {
                if (i.synced && i.id !== inspection.id) {
                    return stripHeavyData(i);
                }
                return i;
            });
            
            try {
                localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
            } catch (retryError) {
                console.error("Critical Storage Failure: Cannot save locally.", retryError);
                // Even if local save fails, we proceed to attempt Cloud Upload below if online.
                // But we should re-throw or notify if offline so UI knows.
                if (!navigator.onLine) throw retryError;
            }
        }
    }
    
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
      // Note: We upload the FULL log data to Supabase (including photos if small enough, but usually text)
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
      // And now that it is synced, we can potentially strip heavy data locally if needed
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
        
        // OPTIMIZATION: If we just synced, and storage is getting full, 
        // we could strip photos from the local copy here. 
        // For now, just mark synced.
        
        localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
    }
  },

  syncPendingData: async () => {
    if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return { syncedCount: 0, error: null };

    // 1. Upload Pending Inspections
    const pendingLogs = storageService.getInspections().filter(i => !i.synced);
    let syncedCount = 0;
    
    for (const log of pendingLogs) {
      try {
        await storageService.uploadInspectionToSupabase(log);
        syncedCount++;
      } catch (e) {
        console.error(`Failed to sync inspection ${log.id}`, e);
      }
    }

    // 2. Upload Pending Sites
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
  },

  // CRITICAL: New method to perform a full authoritative load from Supabase
  // ensuring local data matches cloud data exactly (removing deleted items),
  // while preserving local unsynced changes.
  performInitialLoad: async () => {
     if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return;

     // 1. Try to push pending changes first so we don't lose them
     await storageService.syncPendingData();

     try {
        // 2. Fetch ALL Sites from Cloud
        const { data: cloudSites, error: siteError } = await supabase.from('sites').select('*');
        
        if (!siteError && cloudSites) {
            // Get current local Pending sites (that haven't reached cloud yet)
            const localSites = storageService.getSites();
            const pendingSites = localSites.filter(s => !s.synced);
            
            // Reconstruct: Pending + Cloud
            const formattedCloudSites = cloudSites.map((row: any) => ({
                ...row.data,
                synced: true
            }));
            
            // Use a Map to merge, prioritizing Pending if ID conflict (rare)
            const mergedSitesMap = new Map();
            formattedCloudSites.forEach((s: any) => mergedSitesMap.set(s.id, s));
            pendingSites.forEach(s => mergedSitesMap.set(s.id, s));
            
            try {
              localStorage.setItem(SITES_KEY, JSON.stringify(Array.from(mergedSitesMap.values())));
            } catch(e) {
              console.error("Quota Exceeded saving sites", e);
            }
        }

        // 3. Fetch Inspections from Cloud (ordered by date)
        // We limit to 50 latest to ensure performance, or could fetch all and strip data.
        const { data: cloudLogs, error: logError } = await supabase
           .from('inspections')
           .select('*')
           .order('created_at', { ascending: false });

        if (!logError && cloudLogs) {
             const localLogs = storageService.getInspections();
             const pendingLogs = localLogs.filter(l => !l.synced);

             const formattedCloudLogs = cloudLogs.map((row: any) => {
                 let data = row.data;

                 // CRITICAL FIX: Strip heavy base64 photos from historical items
                 // coming from the cloud. We don't need raw photos in LocalStorage 
                 // for history (we have the PDF url). This prevents QuotaExceededError.
                 data = stripHeavyData(data);

                 // Prioritize the pdf_url column from the DB row over the JSON blob inside
                 return {
                     ...data,
                     pdfUrl: row.pdf_url || row.data.pdfUrl,
                     synced: true
                 };
             });

             const mergedLogsMap = new Map();
             // 1. Add cloud logs first (stripped)
             formattedCloudLogs.forEach((l: any) => mergedLogsMap.set(l.id, l));
             // 2. Overwrite with local pending logs (keep full data with photos for upload)
             pendingLogs.forEach(l => mergedLogsMap.set(l.id, l));

             // Overwrite Local Storage
             try {
                localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(Array.from(mergedLogsMap.values())));
             } catch(e) {
                console.error("Quota Exceeded saving inspections", e);
                // If still failing, try saving only the pending logs to not lose work
                localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(pendingLogs));
                // And alert user?
             }
        }

        // 4. Notify UI
        window.dispatchEvent(new Event('sites-updated'));
        window.dispatchEvent(new Event('inspections-updated'));

     } catch (error) {
         console.error("Critical error during initial load", error);
     }
  }
};
