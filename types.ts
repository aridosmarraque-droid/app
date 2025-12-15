
export interface InspectionPoint {
  id: string;
  name: string; // e.g., "Extintor"
  question: string; // e.g., "¿Presión correcta?"
  requiresPhoto: boolean;
  photoInstruction?: string; // e.g., "Foto del manómetro"
}

export interface Area {
  id: string;
  name: string; // e.g., "Caseta de Control"
  points: InspectionPoint[];
}

export type Periodicity = 'mensual' | 'trimestral' | 'cuatrimestral' | 'anual';

export interface Site {
  id: string;
  name: string; // e.g., "Cantera Principal"
  areas: Area[];
  synced?: boolean; // New flag
  
  // New Fields for Notifications
  periodicity?: Periodicity;
  contactPhone?: string; // Format: 34600000000
  lastReminderSent?: number; // Timestamp of last WhatsApp sent
}

export interface Answer {
  pointId: string;
  pointName: string;
  question: string;
  areaName: string;
  isOk: boolean; // Yes/No
  photoUrl?: string;
  comments?: string; // Nuevo campo de comentarios
  timestamp: number;
}

export interface InspectionLog {
  id: string;
  siteId: string;
  siteName: string;
  date: string;
  inspectorName: string;
  inspectorDni: string;
  inspectorEmail: string;
  answers: Answer[];
  status: 'completed' | 'draft';
  synced?: boolean; // New flag: true if saved to Supabase
  pdfUrl?: string; // URL del PDF en Supabase Storage
}

// NEW: Draft Interface
export interface InspectionDraft {
  siteId: string;
  currentStepIndex: number;
  answers: Record<string, Answer>;
  inspectorInfo: {
    name: string;
    dni: string;
    email: string;
  };
  lastModified: number;
}

export enum AppView {
  HOME = 'HOME',
  ADMIN = 'ADMIN',
  HISTORY = 'HISTORY',
  INSPECTION_SELECT = 'INSPECTION_SELECT',
  INSPECTION_RUN = 'INSPECTION_RUN',
  INSPECTION_SUMMARY = 'INSPECTION_SUMMARY',
}
