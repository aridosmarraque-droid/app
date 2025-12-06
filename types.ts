
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

export interface Site {
  id: string;
  name: string; // e.g., "Cantera Principal"
  areas: Area[];
  synced?: boolean; // New flag
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

export enum AppView {
  HOME = 'HOME',
  ADMIN = 'ADMIN',
  HISTORY = 'HISTORY',
  INSPECTION_SELECT = 'INSPECTION_SELECT',
  INSPECTION_RUN = 'INSPECTION_RUN',
  INSPECTION_SUMMARY = 'INSPECTION_SUMMARY',
}
