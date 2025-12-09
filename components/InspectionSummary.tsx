import React, { useRef, useState, useEffect } from 'react';
import { InspectionLog, Answer } from '../types';
import { CheckCircle, AlertTriangle, Upload, FileDown, Home, ListChecks, Cloud } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { storageService } from '../services/storageService';
import { checkSupabaseConfig } from '../services/supabaseClient';
import { db } from '../services/db';

declare global {
  interface Window {
    jspdf: any;
    html2canvas: any;
  }
}

interface Props {
  log: InspectionLog;
  onConfirm: () => void;
  onBack: () => void;
}

export const InspectionSummary: React.FC<Props> = ({ log, onConfirm, onBack }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [resolvedAnswers, setResolvedAnswers] = useState<Answer[]>([]);
  const [isResolvingImages, setIsResolvingImages] = useState(true);
  const reportContainerRef = useRef<HTMLDivElement>(null);

  const failedItems = log.answers.filter(a => !a.isOk);
  const passedItems = log.answers.filter(a => a.isOk);
  const uniqueAreaNames = Array.from(new Set(log.answers.map(a => a.areaName)));
  const areaStats = uniqueAreaNames.map(areaName => {
      const areaAnswers = log.answers.filter(a => a.areaName === areaName);
      return {
          name: areaName,
          total: areaAnswers.length,
          ok: areaAnswers.filter(a => a.isOk).length,
          nok: areaAnswers.filter(a => !a.isOk).length
      };
  });

  // Resolve Images Effect:
  // Iterate through answers. If photoUrl starts with 'local::', fetch blob from IDB.
  // If photoUrl is http, use it (CORS might need proxy or crossorigin attribute).
  useEffect(() => {
    const resolve = async () => {
        setIsResolvingImages(true);
        const resolved = await Promise.all(log.answers.map(async (ans) => {
            if (ans.photoUrl && ans.photoUrl.startsWith('local::')) {
                const id = ans.photoUrl.replace('local::', '');
                try {
                    const base64 = await db.getPhoto(id);
                    if (base64) return { ...ans, photoUrl: base64 };
                } catch(e) { console.error("Img Load Error", e); }
            }
            return ans;
        }));
        setResolvedAnswers(resolved);
        setIsResolvingImages(false);
    };
    resolve();
  }, [log]);

  const generatePdfBlob = async (): Promise<Blob | null> => {
    if (!reportContainerRef.current || !window.jspdf || !window.html2canvas) {
      toast.error('Librerías PDF no cargadas.');
      return null;
    }

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pages = reportContainerRef.current.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        if (i > 0) pdf.addPage();

        const canvas = await window.html2canvas(pageElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1000,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.85); // Slightly lower quality for speed with many pages
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      }
      return pdf.output('blob');
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  const handleFinishAndUpload = async () => {
    if (!checkSupabaseConfig()) {
      toast.error("No hay configuración de nube. Guardando solo local.");
      onConfirm();
      return;
    }

    setIsProcessing(true);
    const toastId = toast.loading('Sincronizando fotos pendientes y generando PDF...');

    try {
      // 1. Ensure any remaining LOCAL photos are uploaded to cloud
      // This function in storageService now handles IDB lookup and upload
      const blob = await generatePdfBlob();
      if (!blob) throw new Error("Fallo al generar PDF");

      await storageService.uploadInspectionWithPDF(log, blob);

      toast.success('¡Sincronización Completa!', { id: toastId });
      setTimeout(onConfirm, 1000);

    } catch (error: any) {
      console.error(error);
      toast.error(`Error: ${error.message || 'Fallo en subida'}`, { id: toastId });
      setIsProcessing(false);
    }
  };

  const handleDownloadOnly = async () => {
     setIsProcessing(true);
     const blob = await generatePdfBlob();
     if(blob) {
         const url = URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `Reporte_${log.siteName}.pdf`;
         a.click();
         toast.success("PDF Descargado");
     }
     setIsProcessing(false);
  };

  const ReportHeader = ({ title = "Informe de Inspección", showDetails = true }) => (
    <div className="border-b-4 border-safety-500 pb-4 mb-6 flex justify-between items-end">
        <div>
            <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
            <p className="text-slate-500 text-sm mt-1">Seguridad Preventiva Industrial</p>
        </div>
        {showDetails && (
            <div className="text-right text-xs text-slate-500">
                <p className="font-bold text-slate-800 text-sm">{log.siteName}</p>
                <p>{new Date(log.date).toLocaleString()}</p>
                <p>Insp: {log.inspectorName}</p>
            </div>
        )}
    </div>
  );

  if (isResolvingImages) {
      return (
          <div className="h-screen flex flex-col items-center justify-center bg-white">
              <div className="w-12 h-12 border-4 border-slate-200 border-t-safety-500 rounded-full animate-spin mb-4"></div>
              <p className="text-slate-500">Preparando imágenes...</p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      {/* --- Screen UI (Mobile View) --- */}
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Inspección Lista</h2>
          <p className="text-slate-500 text-sm px-4">
              {log.answers.filter(a => a.photoUrl?.startsWith('http')).length} fotos en nube. <br/>
              {log.answers.filter(a => a.photoUrl?.startsWith('local')).length} fotos locales (se subirán ahora).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <div className="text-3xl font-bold text-green-600">{passedItems.length}</div>
            <div className="text-xs text-slate-500 uppercase font-bold">OK</div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 text-center">
            <div className={`text-3xl font-bold ${failedItems.length > 0 ? 'text-red-500' : 'text-slate-400'}`}>{failedItems.length}</div>
            <div className="text-xs text-slate-500 uppercase font-bold">Incidencias</div>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 flex flex-col gap-3 pb-8 z-20">
          <button 
            onClick={handleFinishAndUpload}
            disabled={isProcessing}
            className="w-full py-4 px-4 rounded-xl bg-safety-600 text-white font-bold shadow-lg shadow-safety-200 hover:bg-safety-700 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isProcessing ? 'Procesando...' : (
               <>
                <Cloud className="w-5 h-5" /> Subir Pendientes y Finalizar
               </>
            )}
          </button>
          <div className="flex gap-2">
            <button onClick={handleDownloadOnly} disabled={isProcessing} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 flex items-center justify-center gap-2 text-sm">
                <FileDown className="w-4 h-4" /> PDF
            </button>
            <button onClick={onConfirm} className="py-3 px-4 rounded-xl border border-slate-200 text-slate-400 font-bold hover:bg-slate-50 hover:text-slate-600">
                <Home className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="h-32" />
      </div>

      {/* --- Hidden Report Template for PDF Generation --- */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -50 }}>
        <div ref={reportContainerRef}>
          {/* PAGE 1 */}
          <div className="pdf-page bg-white p-10 w-[210mm] min-h-[297mm] relative text-slate-900 font-sans border border-gray-200 pb-20 flex flex-col">
             <ReportHeader title="Informe de Inspección" showDetails={false} />
             <div className="bg-slate-50 p-6 rounded-lg mb-6 border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">Datos Generales</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    <div><span className="block text-slate-400 text-xs">Instalación</span><span className="font-bold text-lg text-slate-800">{log.siteName}</span></div>
                    <div><span className="block text-slate-400 text-xs">Fecha</span><span className="font-bold text-lg text-slate-800">{new Date(log.date).toLocaleString()}</span></div>
                    <div><span className="block text-slate-400 text-xs">Inspector</span><span className="font-bold">{log.inspectorName}</span></div>
                    <div><span className="block text-slate-400 text-xs">Estado</span><span className={`font-bold ${failedItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{failedItems.length > 0 ? 'CON INCIDENCIAS' : 'APTO'}</span></div>
                </div>
             </div>

             <div className="mb-8">
                <h3 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider flex items-center gap-2"><ListChecks className="w-4 h-4" /> Resumen por Áreas</h3>
                <table className="w-full text-sm border-collapse border border-slate-200">
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="p-2 border border-slate-200 text-left">Área</th>
                            <th className="p-2 border border-slate-200 text-center">Total</th>
                            <th className="p-2 border border-slate-200 text-center text-green-700">OK</th>
                            <th className="p-2 border border-slate-200 text-center text-red-700">NO OK</th>
                        </tr>
                    </thead>
                    <tbody>
                        {areaStats.map(stat => (
                            <tr key={stat.name}>
                                <td className="p-2 border border-slate-200 font-medium">{stat.name}</td>
                                <td className="p-2 border border-slate-200 text-center">{stat.total}</td>
                                <td className="p-2 border border-slate-200 text-center font-bold text-green-600">{stat.ok}</td>
                                <td className={`p-2 border border-slate-200 text-center font-bold ${stat.nok > 0 ? 'text-red-600 bg-red-50' : 'text-slate-300'}`}>{stat.nok}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>

             <div className="mt-auto pt-8">
                <div className="grid grid-cols-2 gap-12">
                    <div className="border-t-2 border-slate-300 pt-4 text-center">
                        <p className="font-bold text-slate-800 text-sm">{log.inspectorName}</p>
                        <p className="text-xs text-slate-500">Inspector</p>
                    </div>
                    <div className="border-t-2 border-slate-300 pt-4 text-center">
                        <p className="font-bold text-slate-800 text-sm">Recibí Conforme</p>
                        <p className="text-xs text-slate-500">Responsable</p>
                    </div>
                </div>
             </div>
          </div>

          {/* PAGE 2..N */}
          {uniqueAreaNames.map((areaName, index) => (
             <div key={areaName} className="pdf-page bg-white p-10 w-[210mm] min-h-[297mm] relative text-slate-900 font-sans border border-gray-200 mb-4">
                <ReportHeader title={`Detalle: ${areaName}`} />
                <div className="space-y-4">
                    {resolvedAnswers.filter(a => a.areaName === areaName).map(ans => (
                       <div key={ans.pointId} className="p-3 border-b border-slate-100 flex gap-4 break-inside-avoid">
                          <div className="flex-1">
                             <h4 className="font-bold text-slate-700 text-sm">{ans.pointName}</h4>
                             <p className="text-xs text-slate-500 mb-1">{ans.question}</p>
                             <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ans.isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {ans.isOk ? 'Conforme' : 'No Conforme'}
                                </span>
                             </div>
                             {ans.comments && <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded mt-1 border border-slate-100">"{ans.comments}"</p>}
                          </div>
                          {ans.photoUrl && (
                            // CORS attribute crucial for cloud images in html2canvas
                            <div className="w-40 h-40 flex-shrink-0 bg-slate-100 border border-slate-200 rounded overflow-hidden">
                               <img src={ans.photoUrl} className="w-full h-full object-cover" crossOrigin="anonymous" alt="Evidencia" />
                            </div>
                          )}
                       </div>
                    ))}
                </div>
                <div className="absolute bottom-4 left-0 w-full text-center text-xs text-slate-400">
                    Página {index + 2} de {uniqueAreaNames.length + 1}
                </div>
             </div>
          ))}
        </div>
      </div>
    </div>
  );
};
