
export interface JobPosition {
  id: string;
  name: string;
}

export interface Worker {
  id: string;
  name: string;
  dni: string; // We use this for auth (first 4 digits)
  phone: string;
  positionIds: string[];
  role: 'admin' | 'worker' | 'cp'; // Añadido 'cp'
}

export interface CostCenter {
  id: string;
  name: string; // e.g., "Cantera Pura Machacadora"
}

export interface MaintenanceDefinition {
  id?: string; // Optional for creation
  machineId?: string;
  name: string; // e.g., "Mantenimiento 500h"
  
  // Logic Config
  maintenanceType: 'HOURS' | 'DATE'; // Nuevo: Tipo de mantenimiento
  
  // Hours Logic
  intervalHours?: number; // 500
  warningHours?: number; // 50
  lastMaintenanceHours?: number | null; // Cuándo se hizo por última vez
  remainingHours?: number; // Horas hasta el próximo

  // Date Logic
  intervalMonths?: number; // Nuevo: Intervalo en meses
  nextDate?: Date; // Nuevo: Próxima fecha programada
  lastMaintenanceDate?: Date; // Nuevo: Fecha última realización
  
  tasks: string; // "Cambio aceite y filtros"
  pending?: boolean; // Check "Mantenimiento Pendiente"
}

export interface Machine {
  id: string;
  costCenterId: string;
  name: string;
  companyCode?: string; // Código Interno
  currentHours: number;
  requiresHours: boolean;
  adminExpenses: boolean; // "Gastos de Administración"
  transportExpenses: boolean; // "Gastos de Transporte"
  maintenanceDefs: MaintenanceDefinition[];
  selectableForReports?: boolean; // Para partes de trabajo personal
  responsibleWorkerId?: string; // Nuevo: Responsable de la máquina
}

export interface ServiceProvider {
  id: string;
  name: string; // "Volvo Service", "IDESA"
}

// Logs for operations
export type OperationType = 'LEVELS' | 'BREAKDOWN' | 'MAINTENANCE' | 'SCHEDULED' | 'REFUELING';

export interface OperationLog {
  id: string;
  date: Date;
  workerId: string;
  machineId: string;
  hoursAtExecution: number;
  type: OperationType;
  
  // Levels Specific
  motorOil?: number;
  hydraulicOil?: number;
  coolant?: number;

  // Breakdown Specific
  breakdownCause?: string;
  breakdownSolution?: string;
  repairerId?: string;

  // Maintenance Specific
  maintenanceType?: 'CLEANING' | 'GREASING' | 'OTHER';
  description?: string;
  materials?: string;
  
  // Scheduled Specific
  maintenanceDefId?: string;
  
  // Refueling Specific
  fuelLitres?: number;
}

// --- CANTERA PURA TYPES ---

export interface CPDailyReport {
    id: string;
    date: Date;
    workerId: string;
    crusherStart: number;
    crusherEnd: number;
    millsStart: number;
    millsEnd: number;
    comments?: string;
}

export interface CPWeeklyPlan {
    id: string;
    mondayDate: string; // YYYY-MM-DD
    hoursMon: number;
    hoursTue: number;
    hoursWed: number;
    hoursThu: number;
    hoursFri: number;
}

// --- PERSONAL REPORT TYPES ---

export interface PersonalReport {
    id: string;
    date: Date;
    workerId: string;
    hours: number;
    
    // New Fields for Machine flow
    costCenterId?: string;
    machineId?: string;
    machineName?: string; // Helper for display
    costCenterName?: string; // Helper for display

    description?: string; // Optional now?
    location?: string; // Legacy/Optional
}

