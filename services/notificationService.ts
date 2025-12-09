import { Site, InspectionLog, Periodicity } from '../types';
import { storageService } from './storageService';
import { toast } from 'react-hot-toast';

// CONFIGURACIÓN ULTRAMSG
// Lo ideal es mover esto a variables de entorno (VITE_ULTRAMSG_INSTANCE, etc)
const INSTANCE_ID = "instance114416"; // CAMBIAR POR TU INSTANCE ID
const TOKEN = "ayg70rcuhiafs27y";         // CAMBIAR POR TU TOKEN

const PERIOD_DAYS: Record<Periodicity, number> = {
  'mensual': 30,
  'trimestral': 90,
  'cuatrimestral': 120,
  'anual': 365
};

export const notificationService = {
  
  checkAndNotifyDueInspections: async () => {
    // Solo correr si hay configuración (simulada aquí con length check)
    if (INSTANCE_ID === "instance99999") {
        console.warn("UltraMsg no configurado. Saltando chequeo de notificaciones.");
        return;
    }

    const sites = storageService.getSites();
    const inspections = storageService.getInspections();
    let notificationsSent = 0;

    const now = Date.now();
    const REMINDER_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 días en milisegundos

    for (const site of sites) {
      // 1. Verificar si el sitio tiene configuración de notificaciones
      if (!site.periodicity || !site.contactPhone) continue;

      // 2. Verificar si ya enviamos recordatorio recientemente (evitar spam)
      if (site.lastReminderSent && (now - site.lastReminderSent < REMINDER_COOLDOWN)) {
          continue; 
      }

      // 3. Encontrar fecha de última inspección
      const siteInspections = inspections
          .filter(i => i.siteId === site.id && i.status === 'completed')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const lastDate = siteInspections.length > 0 ? new Date(siteInspections[0].date).getTime() : 0;
      
      // 4. Calcular días transcurridos
      const daysElapsed = (now - lastDate) / (1000 * 60 * 60 * 24);
      const threshold = PERIOD_DAYS[site.periodicity];

      if (daysElapsed >= threshold) {
        // TOCA INSPECCIÓN
        const message = `⚠️ *RECORDATORIO DE INSPECCIÓN* ⚠️\n\n` +
                        `La instalación *${site.name}* requiere una inspección ${site.periodicity}.\n` +
                        `Última inspección: ${lastDate > 0 ? new Date(lastDate).toLocaleDateString() : 'NUNCA'}\n` +
                        `Días transcurridos: ${Math.floor(daysElapsed)}\n\n` +
                        `Por favor, acceda a la App Controles Preventivos para realizarla.`;

        try {
           await notificationService.sendWhatsApp(site.contactPhone, message);
           
           // Actualizar el timestamp del recordatorio en el sitio
           site.lastReminderSent = now;
           await storageService.saveSite(site); // Guardar cambio para no repetir mañana
           
           notificationsSent++;
           toast(`Recordatorio enviado para ${site.name}`, { icon: '📱' });
        } catch (error) {
           console.error(`Fallo envío WhatsApp a ${site.name}`, error);
        }
      }
    }

    if (notificationsSent > 0) {
        console.log(`Se enviaron ${notificationsSent} notificaciones de WhatsApp.`);
    }
  },

  sendWhatsApp: async (phone: string, body: string) => {
    // Limpiar teléfono (quitar + o espacios)
    const cleanPhone = phone.replace(/\D/g, ''); 
    
    const url = `https://api.ultramsg.com/${INSTANCE_ID}/messages/chat`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            token: TOKEN,
            to: cleanPhone,
            body: body
        })
    });

    if (!response.ok) {
        throw new Error('Error en API UltraMsg');
    }
    
    return await response.json();
  }
};
