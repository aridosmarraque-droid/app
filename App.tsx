import React, { useState, useEffect } from 'react';
import { AppView, Site, InspectionLog } from './types';
import { storageService } from './services/storageService';
import { HomeView } from './components/HomeView';
import { AdminDashboard } from './components/AdminDashboard';
import { InspectionRunner } from './components/InspectionRunner';
import { InspectionSummary } from './components/InspectionSummary';
import { InspectionHistory } from './components/InspectionHistory';
import { Toaster, toast } from 'react-hot-toast';
import { Menu, X, Settings, ListChecks, History, Wifi, WifiOff, RefreshCw, Lock, User, ArrowRight, Database } from 'lucide-react';
import { checkSupabaseConfig } from './services/supabaseClient';

export default function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // Loading State
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [currentView, setCurrentView] = useState<AppView>(AppView.HOME);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [inspectionResult, setInspectionResult] = useState<InspectionLog | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  // Network State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Monitor Network & Sync
  useEffect(() => {
    const handleStatusChange = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine && isAuthenticated && !isLoadingData) {
        triggerSync();
      }
    };

    window.addEventListener('online', handleStatusChange);
    window.addEventListener('offline', handleStatusChange);

    return () => {
      window.removeEventListener('online', handleStatusChange);
      window.removeEventListener('offline', handleStatusChange);
    };
  }, [isAuthenticated, isLoadingData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUser === 'Aridos25' && loginPass === 'Rioja') {
      setIsAuthenticated(true);
      
      // BLOCKING INITIAL LOAD
      if (navigator.onLine && checkSupabaseConfig()) {
          setIsLoadingData(true);
          try {
             await storageService.performInitialLoad();
          } catch(e) {
             console.error("Load failed", e);
             toast.error("Error cargando datos de nube");
          } finally {
             // Ensure we minimum show spinner for UX feedback or until done
             setIsLoadingData(false);
             updatePendingCount();
          }
      } else {
         // Offline or no config
         updatePendingCount();
      }
      
      toast.success('Bienvenido');

    } else {
      toast.error('Credenciales incorrectas');
    }
  };

  const updatePendingCount = () => {
     const logs = storageService.getInspections();
     const pending = logs.filter(l => !l.synced).length;
     setPendingCount(pending);
  };

  const triggerSync = async () => {
    if (!checkSupabaseConfig()) return;
    setIsSyncing(true);
    try {
       const { syncedCount } = await storageService.syncPendingData();
       if (syncedCount > 0) {
           toast.success(`${syncedCount} inspecciones subidas a la nube.`);
       }
       updatePendingCount();
    } catch (e) {
       console.error(e);
    } finally {
       setIsSyncing(false);
    }
  };

  const handleStartInspection = (site: Site) => {
    setSelectedSite(site);
    setCurrentView(AppView.INSPECTION_RUN);
    setIsMenuOpen(false);
  };

  const handleFinishInspection = async (log: InspectionLog) => {
    // SAVE IMMEDIATELY: Ensure data is persisted before any other UI interaction
    await storageService.saveInspection(log);
    toast.success("Inspección guardada correctamente");
    updatePendingCount();
    triggerSync();

    setInspectionResult(log);
    setCurrentView(AppView.INSPECTION_SUMMARY);
  };

  const handleExitSummary = () => {
    setInspectionResult(null);
    setSelectedSite(null);
    setCurrentView(AppView.HOME);
  };
  
  const handleViewHistoryReport = (log: InspectionLog) => {
    setInspectionResult(log);
    setCurrentView(AppView.INSPECTION_SUMMARY);
    setIsMenuOpen(false);
  };

  const NavItem = ({ view, icon: Icon, label }: { view: AppView, icon: any, label: string }) => (
    <button
      onClick={() => {
        setCurrentView(view);
        setIsMenuOpen(false);
      }}
      className={`flex items-center w-full px-4 py-3 mb-2 rounded-lg transition-colors ${
        currentView === view ? 'bg-safety-100 text-safety-900 font-semibold' : 'text-slate-600 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-5 h-5 mr-3" />
      {label}
    </button>
  );

  // --- LOGIN SCREEN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <Toaster position="bottom-center" />
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-safety-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3">
               <ListChecks className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Controles<span className="text-red-600">Preventivos</span></h1>
            <p className="text-slate-400 mt-2 text-sm">Acceso restringido a personal autorizado</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Usuario</label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                <input 
                  type="text" 
                  value={loginUser}
                  onChange={e => setLoginUser(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 focus:ring-2 focus:ring-safety-100 outline-none transition-all"
                  placeholder="Introduzca usuario"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                <input 
                  type="password" 
                  value={loginPass}
                  onChange={e => setLoginPass(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 focus:ring-2 focus:ring-safety-100 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 flex items-center justify-center gap-2 mt-4"
            >
              Entrar <ArrowRight className="w-4 h-4" />
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-xs text-slate-300">Áridos Marraque v1.0</p>
          </div>
        </div>
      </div>
    );
  }

  // --- FULL SCREEN DATA LOADER ---
  if (isLoadingData) {
      return (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white p-6">
              <div className="w-24 h-24 mb-8 relative">
                  <div className="absolute inset-0 border-4 border-slate-600 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-safety-500 border-t-transparent rounded-full animate-spin"></div>
                  <RefreshCw className="absolute inset-0 m-auto w-8 h-8 text-safety-500 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Sincronizando Datos</h2>
              <p className="text-slate-400 text-center max-w-xs">
                  Descargando configuración de centros e historial de inspecciones desde la nube...
              </p>
              <div className="mt-8 flex items-center gap-2 text-xs text-slate-500 bg-slate-800 px-4 py-2 rounded-full">
                  <Database className="w-3 h-3" />
                  <span>Por favor espere, no cierre la aplicación.</span>
              </div>
          </div>
      );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Toaster position="bottom-center" />
      
      {/* Mobile Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 h-16 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-safety-500 rounded-lg flex items-center justify-center mr-3 shadow-md">
            <ListChecks className="text-white w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Controles<span className="text-red-600">Preventivos</span></h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Indicator */}
          <div className="flex items-center gap-1">
             {isSyncing ? (
                 <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
             ) : !isOnline ? (
                 <WifiOff className="w-4 h-4 text-red-400" />
             ) : (
                 <div className="relative">
                    <Wifi className="w-4 h-4 text-green-500" />
                    {pendingCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full">
                            {pendingCount}
                        </span>
                    )}
                 </div>
             )}
          </div>

          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-full hover:bg-slate-100"
          >
            {isMenuOpen ? <X className="w-6 h-6 text-slate-600" /> : <Menu className="w-6 h-6 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* Navigation Drawer (Mobile) */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}>
          <div className="absolute top-16 right-0 w-64 bg-white h-[calc(100vh-4rem)] shadow-xl p-4" onClick={e => e.stopPropagation()}>
            <nav className="mt-4">
              <NavItem view={AppView.HOME} icon={ListChecks} label="Inicio / Inspeccionar" />
              <NavItem view={AppView.HISTORY} icon={History} label="Historial Inspecciones" />
              <NavItem view={AppView.ADMIN} icon={Settings} label="Configuración" />
            </nav>
            <div className="border-t border-slate-100 mt-4 pt-4 px-4">
                <p className="text-xs text-slate-400 font-bold mb-2">ESTADO DE CONEXIÓN</p>
                <div className="flex items-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                    {isOnline ? 'Conectado a Internet' : 'Sin conexión'}
                </div>
                {!checkSupabaseConfig() && (
                    <p className="text-xs text-orange-500 mt-2">Supabase no configurado. Solo modo local.</p>
                )}
                {pendingCount > 0 && (
                    <button 
                       onClick={triggerSync} 
                       disabled={!isOnline || isSyncing}
                       className="mt-3 w-full py-2 bg-blue-50 text-blue-600 rounded text-xs font-bold flex items-center justify-center gap-2"
                    >
                       <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} /> 
                       Sincronizar ({pendingCount})
                    </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto p-4 md:p-6 pb-24">
        {currentView === AppView.HOME && (
          <HomeView onSelectSite={handleStartInspection} />
        )}
        
        {currentView === AppView.HISTORY && (
          <InspectionHistory onViewReport={handleViewHistoryReport} />
        )}

        {currentView === AppView.ADMIN && (
          <AdminDashboard />
        )}

        {currentView === AppView.INSPECTION_RUN && selectedSite && (
          <InspectionRunner 
            site={selectedSite} 
            onComplete={handleFinishInspection}
            onCancel={() => setCurrentView(AppView.HOME)}
          />
        )}

        {currentView === AppView.INSPECTION_SUMMARY && inspectionResult && (
          <InspectionSummary 
            log={inspectionResult} 
            onConfirm={handleExitSummary}
            onBack={() => {
                if(inspectionResult.status === 'completed' && !selectedSite) {
                    setCurrentView(AppView.HISTORY);
                } else {
                    // Even if just finished, data is saved, so safe to go Home/History
                    setCurrentView(AppView.HOME);
                }
            }}
          />
        )}
      </main>
    </div>
  );
