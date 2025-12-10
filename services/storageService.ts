import { Site, InspectionLog, InspectionDraft } from '../types';
import { supabase, checkSupabaseConfig } from './supabaseClient';
import { db } from './db';

const SITES_KEY = 'sp_sites';
const INSPECTIONS_KEY = 'sp_inspections';
const DRAFTS_KEY = 'sp_drafts';

const SEED_SITES: Site[] = [];

// Helper to remove heavy data from logs
const stripHeavyData = (log: InspectionLog): InspectionLog => {
    return {
        ...log,
        answers: log.answers.map(a => ({ ...a, photoUrl: undefined }))
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

  uploadPhotoBlob: async (path: string, base64Data: string): Promise<string | null> => {
     if (!checkSupabaseConfig() || !supabase) return null;
     try {
        const res = await fetch(base64Data);
        const blob = await res.blob();
        const { data, error } = await supabase.storage
            .from('reports')
            .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('reports').getPublicUrl(path);
        return urlData.publicUrl;
     } catch (e) {
        console.error("Single photo upload failed", e);
        return null;
     }
  },

  saveInspection: async (inspection: InspectionLog) => {
    let inspections = storageService.getInspections();
    const existingIndex = inspections.findIndex(i => i.id === inspection.id);
    inspection.synced = false; 
    
    if (existingIndex >= 0) inspections[existingIndex] = inspection;
    else inspections.push(inspection);
    
    try {
        localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
        // NEW: If successfully saved completed inspection, delete draft
        storageService.deleteDraft(inspection.siteId);
    } catch (e: any) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.warn("Storage Full! Cleanup...");
            inspections = inspections.map(i => i.synced ? stripHeavyData(i) : i);
            localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
        }
    }
  },

  prepareLogForPdf: async (log: InspectionLog): Promise<InspectionLog> => {
      const updatedAnswers = await Promise.all(log.answers.map(async (ans) => {
          if (ans.photoUrl && ans.photoUrl.startsWith('local::')) {
              const localId = ans.photoUrl.replace('local::', '');
              const base64 = await db.getPhoto(localId);
              if (base64) {
                  return { ...ans, photoUrl: base64 };
              }
          }
          return ans;
      }));
      return { ...log, answers: updatedAnswers };
  },

  uploadInspectionWithPDF: async (log: InspectionLog, pdfBlob: Blob) => {
      if (!checkSupabaseConfig() || !supabase) throw new Error("No hay conexión a la nube");

      const finalAnswers = await Promise.all(log.answers.map(async (ans) => {
          if (ans.photoUrl && ans.photoUrl.startsWith('local::')) {
              const localId = ans.photoUrl.replace('local::', '');
              const base64 = await db.getPhoto(localId);
              if (base64) {
                  const fileName = `photos/${log.id}/${ans.pointId}.jpg`;
                  const publicUrl = await storageService.uploadPhotoBlob(fileName, base64);
                  if (publicUrl) {
                      await db.deletePhoto(localId);
                      return { ...ans, photoUrl: publicUrl };
                  }
              }
          }
          return ans;
      }));

      const finalLog = { ...log, answers: finalAnswers };
      const fileName = `${finalLog.siteName.replace(/\s+/g, '_')}_${finalLog.id}.pdf`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
          .from('reports')
          .upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('reports').getPublicUrl(filePath);
      const publicUrl = urlData.publicUrl;
      const updatedLog = { ...finalLog, pdfUrl: publicUrl, synced: true };

      const { error: dbError } = await supabase.from('inspections').upsert({
          id: updatedLog.id,
          site_name: updatedLog.siteName,
          inspector_name: updatedLog.inspectorName,
          date: updatedLog.date,
          pdf_url: publicUrl,
          data: updatedLog
      });

      if (dbError) throw dbError;
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
    
    const inspections = storageService.getInspections();
    const idx = inspections.findIndex(i => i.id === log.id);
    if (idx >= 0) {
        inspections[idx].synced = true;
        localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(inspections));
    }
  },

  syncPendingData: async () => {
    if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return { syncedCount: 0, error: null };
    
    const inspections = storageService.getInspections();
    const pending = inspections.filter(i => !i.synced);
    let syncedCount = 0;

    for (const log of pending) {
        try {
            // 1. Resolve and Upload Photos
            const finalAnswers = await Promise.all(log.answers.map(async (ans) => {
                if (ans.photoUrl && ans.photoUrl.startsWith('local::')) {
                    const localId = ans.photoUrl.replace('local::', '');
                    try {
                        const base64 = await db.getPhoto(localId);
                        if (base64) {
                            const fileName = `photos/${log.siteId}/${ans.pointId}_${ans.timestamp || Date.now()}.jpg`;
                            
                            const res = await fetch(base64);
                            const blob = await res.blob();
                            
                            const { error: uploadError } = await supabase!.storage
                                .from('reports')
                                .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

                            if (!uploadError) {
                                const { data: urlData } = supabase!.storage.from('reports').getPublicUrl(fileName);
                                await db.deletePhoto(localId); 
                                return { ...ans, photoUrl: urlData.publicUrl };
                            }
                        }
                    } catch (photoErr) {
                        console.error("Photo sync error", photoErr);
                    }
                }
                return ans;
            }));
            
            const updatedLog = { ...log, answers: finalAnswers, synced: true };

            // 2. Upload JSON Data
            const { error } = await supabase.from('inspections').upsert({
                id: updatedLog.id,
                site_name: updatedLog.siteName,
                inspector_name: updatedLog.inspectorName,
                date: updatedLog.date,
                pdf_url: updatedLog.pdfUrl || null,
                data: updatedLog
            });

            if (error) throw error;

            // 3. Update Local State (Persist)
            const currentInspections = storageService.getInspections();
            const index = currentInspections.findIndex(i => i.id === log.id);
            if (index >= 0) {
                currentInspections[index] = updatedLog;
                localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(currentInspections));
            }
            
            syncedCount++;

        } catch (e) {
            console.error(`Failed to sync inspection ${log.id}`, e);
        }
    }

    if (syncedCount > 0) {
        window.dispatchEvent(new Event('inspections-updated'));
    }

    return { syncedCount };
  },

  performInitialLoad: async () => {
     if (!navigator.onLine || !checkSupabaseConfig() || !supabase) return;
     try {
        const { data: cloudSites } = await supabase.from('sites').select('*');
        if (cloudSites) {
            const localSites = storageService.getSites();
            const pendingSites = localSites.filter(s => !s.synced);
            const formattedCloudSites = cloudSites.map((row: any) => ({ ...row.data, synced: true }));
            const mergedSitesMap = new Map();
            formattedCloudSites.forEach((s: any) => mergedSitesMap.set(s.id, s));
            pendingSites.forEach(s => mergedSitesMap.set(s.id, s));
            localStorage.setItem(SITES_KEY, JSON.stringify(Array.from(mergedSitesMap.values())));
        }
        const { data: cloudLogs } = await supabase
           .from('inspections')
           .select('*')
           .order('created_at', { ascending: false });

        if (cloudLogs) {
             const localLogs = storageService.getInspections();
             const pendingLogs = localLogs.filter(l => !l.synced);
             const formattedCloudLogs = cloudLogs.map((row: any) => {
                 let data = stripHeavyData(row.data);
                 return { ...data, pdfUrl: row.pdf_url || row.data.pdfUrl, synced: true };
             });
             const mergedLogsMap = new Map();
             formattedCloudLogs.forEach((l: any) => mergedLogsMap.set(l.id, l));
             pendingLogs.forEach(l => mergedLogsMap.set(l.id, l));
             localStorage.setItem(INSPECTIONS_KEY, JSON.stringify(Array.from(mergedLogsMap.values())));
        }
        window.dispatchEvent(new Event('sites-updated'));
        window.dispatchEvent(new Event('inspections-updated'));
     } catch (error) {
         console.error("Critical error during initial load", error);
     }
  },

  // --- DRAFTS MANAGEMENT (New) ---

  saveDraft: (draft: InspectionDraft) => {
      try {
          const draftsStr = localStorage.getItem(DRAFTS_KEY);
          let drafts: Record<string, InspectionDraft> = draftsStr ? JSON.parse(draftsStr) : {};
          
          drafts[draft.siteId] = draft;
          localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
      } catch (e) {
          console.error("Failed to save draft", e);
      }
  },

  getDraft: (siteId: string): InspectionDraft | null => {
      try {
          const draftsStr = localStorage.getItem(DRAFTS_KEY);
          if (!draftsStr) return null;
          const drafts: Record<string, InspectionDraft> = JSON.parse(draftsStr);
          return drafts[siteId] || null;
      } catch (e) {
          return null;
      }
  },

  deleteDraft: (siteId: string) => {
      try {
          const draftsStr = localStorage.getItem(DRAFTS_KEY);
          if (!draftsStr) return;
          let drafts: Record<string, InspectionDraft> = JSON.parse(draftsStr);
          if (drafts[siteId]) {
              delete drafts[siteId];
              localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
          }
      } catch (e) {
          console.error("Failed to delete draft", e);
      }
  }
};
