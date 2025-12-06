import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Site, InspectionLog, Answer } from '../types';
import { Camera, Check, X, ChevronRight, AlertCircle, RotateCcw, User, Mail, CreditCard, MessageSquare, ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Props {
  site: Site;
  onComplete: (log: InspectionLog) => void;
  onCancel: () => void;
}

// Helper to compress images before storing them
const compressImage = (base64Str: string, maxWidth = 1024, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
          resolve(base64Str); // Fallback
      }
    };
    img.onerror = () => resolve(base64Str); // Fallback
  });
};

export const InspectionRunner: React.FC<Props> = ({ site, onComplete, onCancel }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Flatten points structure to linear steps
  const steps = useMemo(() => {
    const list: { areaName: string; areaId: string; point: any; index: number; total: number }[] = [];
    site.areas.forEach(area => {
      area.points.forEach(point => {
        list.push({ areaName: area.name, areaId: area.id, point, index: list.length, total: 0 });
      });
    });
    return list.map(item => ({ ...item, total: list.length }));
  }, [site]);

  // Step -1 represents the Inspector Info form
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  
  // Inspector Info State
  const [inspectorInfo, setInspectorInfo] = useState({
    name: '',
    dni: '',
    email: ''
  });

  // Local state for the current step
  const [selectedStatus, setSelectedStatus] = useState<boolean | null>(null);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [comment, setComment] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState(false);

  const currentStep = currentStepIndex >= 0 ? steps[currentStepIndex] : null;

  // Reset local state when step changes and SCROLL TO TOP
  useEffect(() => {
    setSelectedStatus(null);
    setTempPhoto(null);
    setComment('');
    
    // Force scroll to top
    if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
    }
  }, [currentStepIndex]);

  const handleStart = () => {
    if (!inspectorInfo.name || !inspectorInfo.dni || !inspectorInfo.email) {
      toast.error('Por favor completa todos los datos del inspector');
      return;
    }
    setCurrentStepIndex(0);
  };

  const handleNext = () => {
    if (!currentStep) return;

    if (selectedStatus === null) {
      toast.error('Debes seleccionar SI o NO');
      return;
    }

    // Validation: Photo required check
    if (currentStep.point.requiresPhoto && !tempPhoto) {
      toast.error('Es obligatorio tomar una foto');
      return;
    }

    const answer: Answer = {
      pointId: currentStep.point.id,
      pointName: currentStep.point.name,
      question: currentStep.point.question,
      areaName: currentStep.areaName,
      isOk: selectedStatus,
      photoUrl: tempPhoto || undefined,
      comments: comment.trim() || undefined,
      timestamp: Date.now()
    };

    const newAnswers = { ...answers, [currentStep.point.id]: answer };
    setAnswers(newAnswers);

    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      // Finish
      const log: InspectionLog = {
        id: `insp-${Date.now()}`,
        siteId: site.id,
        siteName: site.name,
        date: new Date().toISOString(),
        inspectorName: inspectorInfo.name,
        inspectorDni: inspectorInfo.dni,
        inspectorEmail: inspectorInfo.email,
        answers: Object.values(newAnswers),
        status: 'completed'
      };
      onComplete(log);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsCompressing(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
            const rawBase64 = reader.result as string;
            // Compress to avoid QuotaExceededError in localStorage
            const compressed = await compressImage(rawBase64);
            setTempPhoto(compressed);
        } catch(err) {
            toast.error("Error procesando imagen");
        } finally {
            setIsCompressing(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  if (steps.length === 0) {
    return (
       <div className="text-center p-8">
         <p>Esta instalación no tiene puntos de inspección.</p>
         <button onClick={onCancel} className="mt-4 text-blue-500">Volver</button>
       </div>
    );
  }

  // --- Login Form View ---
  if (currentStepIndex === -1) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right">
        <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100">
           <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
             <User className="w-6 h-6 text-safety-600" />
             Datos del Inspector
           </h2>
           
           <div className="space-y-4">
             <div>
               <label className="block text-sm font-bold text-slate-500 mb-1">Nombre Completo</label>
               <div className="relative">
                 <User className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                 <input 
                   type="text" 
                   value={inspectorInfo.name}
                   onChange={e => setInspectorInfo({...inspectorInfo, name: e.target.value})}
                   className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 focus:ring-2 focus:ring-safety-100 outline-none transition-all"
                   placeholder="Ej. Juan Pérez"
                 />
               </div>
             </div>

             <div>
               <label className="block text-sm font-bold text-slate-500 mb-1">DNI / Identificación</label>
               <div className="relative">
                 <CreditCard className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                 <input 
                   type="text" 
                   value={inspectorInfo.dni}
                   onChange={e => setInspectorInfo({...inspectorInfo, dni: e.target.value})}
                   className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 focus:ring-2 focus:ring-safety-100 outline-none transition-all"
                   placeholder="Ej. 12345678X"
                 />
               </div>
             </div>

             <div>
               <label className="block text-sm font-bold text-slate-500 mb-1">Correo Electrónico</label>
               <div className="relative">
                 <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-300" />
                 <input 
                   type="email" 
                   value={inspectorInfo.email}
                   onChange={e => setInspectorInfo({...inspectorInfo, email: e.target.value})}
                   className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 focus:ring-2 focus:ring-safety-100 outline-none transition-all"
                   placeholder="Ej. inspector@empresa.com"
                 />
               </div>
             </div>
           </div>

           <div className="mt-8 flex gap-3">
             <button onClick={onCancel} className="flex-1 py-3 text-slate-500 font-bold">Cancelar</button>
             <button 
               onClick={handleStart}
               className="flex-[2] py-3 bg-safety-600 text-white rounded-xl font-bold shadow-lg shadow-safety-200 hover:bg-safety-700 active:scale-[0.98] transition-all"
             >
               Comenzar Inspección
             </button>
           </div>
        </div>
      </div>
    );
  }

  // --- Inspection Steps View ---
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] relative">
      {/* Header Info - Step counter */}
      <div className="mb-4">
        <div className="flex justify-end text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
          <span>Paso {currentStepIndex + 1}/{steps.length}</span>
        </div>
        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-safety-500 transition-all duration-300" 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Main Card with Scroll Reference */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pb-24 no-scrollbar scroll-smooth"
      >
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-8">
          
          {/* 1. Typography Adjusted: Zone Blue/Large, Point Large */}
          <div>
            <div className="text-xl font-bold text-blue-600 mb-1 leading-tight">
               {currentStep?.areaName}
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2 uppercase leading-tight">
              {currentStep?.point.name}
            </h3>
            <h2 className="text-lg font-medium text-slate-500 leading-snug">
              {currentStep?.point.question}
            </h2>
          </div>

          {/* 2. Answer Selection */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              onClick={() => setSelectedStatus(false)}
              className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                selectedStatus === false 
                  ? 'border-red-500 bg-red-50 text-red-600' 
                  : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
              }`}
            >
              <div className={`p-2 rounded-full ${selectedStatus === false ? 'bg-red-100' : 'bg-slate-100'}`}>
                <X className="w-6 h-6" />
              </div>
              <span className="font-bold">NO / Mal</span>
            </button>

            <button 
              onClick={() => setSelectedStatus(true)}
              className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                selectedStatus === true 
                  ? 'border-green-500 bg-green-50 text-green-600' 
                  : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'
              }`}
            >
              <div className={`p-2 rounded-full ${selectedStatus === true ? 'bg-green-100' : 'bg-slate-100'}`}>
                <Check className="w-6 h-6" />
              </div>
              <span className="font-bold">SI / Bien</span>
            </button>
          </div>

          {/* 3. Optional Comments */}
          <div className="animate-in fade-in">
             <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                Comentarios / Observaciones
             </label>
             <textarea 
               value={comment}
               onChange={(e) => setComment(e.target.value)}
               placeholder="Escribe aquí si hay algún detalle relevante..."
               className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-safety-500 outline-none text-sm min-h-[80px]"
             />
          </div>

          {/* 4. Photo Section (Conditional) */}
          {currentStep?.point.requiresPhoto ? (
            <div className="animate-in fade-in slide-in-from-bottom-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Foto Requerida
              </label>
              <div className={`border-2 border-dashed rounded-xl overflow-hidden transition-colors ${tempPhoto ? 'border-safety-500' : 'border-slate-300 bg-slate-50'}`}>
                {isCompressing ? (
                    <div className="h-48 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-8 h-8 border-4 border-slate-300 border-t-safety-500 rounded-full animate-spin mb-2"></div>
                        <p className="text-xs">Procesando imagen...</p>
                    </div>
                ) : tempPhoto ? (
                  <div className="relative h-56 bg-black">
                    <img src={tempPhoto} alt="Evidence" className="w-full h-full object-contain" />
                    <button 
                      onClick={() => setTempPhoto(null)} 
                      className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full backdrop-blur-md"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-48 cursor-pointer active:bg-slate-100">
                    <Camera className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm font-medium text-slate-600 text-center px-4">
                      {currentStep.point.photoInstruction || 'Toma una foto de evidencia'}
                    </p>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>
            </div>
          ) : null}
          
          {/* Spacer for bottom nav */}
          <div className="h-4"></div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-10 md:absolute md:rounded-b-2xl">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold"
          >
            Cancelar
          </button>
          <button 
            onClick={handleNext}
            disabled={selectedStatus === null || isCompressing}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold shadow-lg transition-all ${
              selectedStatus !== null && !isCompressing
                ? 'bg-safety-600 text-white shadow-safety-200 active:scale-[0.98]' 
                : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {currentStepIndex === steps.length - 1 ? 'Finalizar' : 'Siguiente'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
