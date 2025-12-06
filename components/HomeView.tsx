import React, { useEffect, useState } from 'react';
import { Site } from '../types';
import { storageService } from '../services/storageService';
import { ChevronRight, MapPin, AlertCircle } from 'lucide-react';

interface HomeViewProps {
  onSelectSite: (site: Site) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onSelectSite }) => {
  const [sites, setSites] = useState<Site[]>([]);

  useEffect(() => {
    // Initial load
    setSites(storageService.getSites());

    // Listen for updates from sync or admin panel
    const handleUpdate = () => {
      setSites(storageService.getSites());
    };

    window.addEventListener('sites-updated', handleUpdate);
    return () => window.removeEventListener('sites-updated', handleUpdate);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-gradient-to-br from-safety-500 to-safety-600 rounded-2xl p-6 text-white shadow-lg">
        <h2 className="text-2xl font-bold mb-2">Iniciar Inspección</h2>
        <p className="opacity-90">Selecciona una instalación para comenzar el control preventivo.</p>
      </div>

      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider ml-1">Instalaciones Disponibles</h3>
      
      <div className="grid gap-4">
        {sites.length === 0 ? (
          <div className="bg-slate-100 rounded-xl p-8 text-center border-2 border-dashed border-slate-300">
            <AlertCircle className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No hay instalaciones configuradas.</p>
            <p className="text-sm text-slate-500 mt-1">Ve a Configuración para añadir canteras.</p>
          </div>
        ) : (
          sites.map(site => (
            <button
              key={site.id}
              onClick={() => onSelectSite(site)}
              className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-safety-400 transition-all flex items-center justify-between text-left"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-safety-50 transition-colors">
                  <MapPin className="w-5 h-5 text-slate-600 group-hover:text-safety-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">{site.name}</h4>
                  <p className="text-sm text-slate-500">
                    {site.areas.length} Áreas • {site.areas.reduce((acc, a) => acc + a.points.length, 0)} Puntos
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-safety-500" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};
