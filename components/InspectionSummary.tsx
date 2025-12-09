import React, { useRef, useState } from 'react';
import { InspectionLog } from '../types';
import { CheckCircle, AlertTriangle, Upload, FileDown, Home, ListChecks } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { storageService } from '../services/storageService';
import { checkSupabaseConfig } from '../services/supabaseClient';

// Extend Window interface for external libraries loaded via script tags
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
  const reportContainerRef = useRef<HTMLDivElement>(null);

  const failedItems = log.answers.filter(a => !a.isOk);
  const passedItems = log.answers.filter(a => a.isOk);
  
  // Group answers by Area for the report
  const uniqueAreaNames = Array.from(new Set(log.answers.map(a => a.areaName)));

  // Calculate statistics per area for Executive Summary
  const areaStats = uniqueAreaNames.map(areaName => {
      const areaAnswers = log.answers.filter(a => a.areaName === areaName);
      return {
          name: areaName,
          total: areaAnswers.length,
          ok: areaAnswers.filter(a => a.isOk).length,
          nok: areaAnswers.filter(a => !a.isOk).length
      };
  });

  const generatePdfBlob = async (): Promise<Blob | null> => {
    if (!reportContainerRef.current || !window.jspdf || !window.html2canvas) {
      toast.error('Librerías PDF no cargadas.');
      return null;
    }

    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      // Get all page elements
      const pages = reportContainerRef.current.querySelectorAll('.pdf-page');
      
      for (let i = 0; i < pages.length; i++) {
        const pageElement = pages[i] as HTMLElement;
        
        // Skip first page add (jsPDF inits with one page)
        if (i > 0) {
            pdf.addPage();
        }

        const canvas = await window.html2canvas(pageElement, {
          scale: 2, // Higher scale for better quality
          useCORS: true,
          logging: false,
          windowWidth: 1000, // Force width to avoid responsiveness issues
          onclone: (clonedDoc: Document) => {
              // Optional: You can manipulate the DOM before snapshot here if needed
          }
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.90);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        
        // Calculate fit respecting aspect ratio
        const imgHeight = (canvas.height * pdfWidth) / canvas.width;

        // Add image to current page
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
    const toastId = toast.loading('Generando PDF y Subiendo a la Nube...');

    try {
      // 1. Generate PDF Blob
      const blob = await generatePdfBlob();
      if (!blob) throw new Error("Fallo al generar PDF");

      // 2. Upload to Supabase Storage & Update DB
      await storageService.uploadInspectionWithPDF(log, blob);

      toast.success('¡Inspección Completada y Subida!', { id: toastId });
      
      // 3. Exit
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

  // --- Header Component for Report Pages ---
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

  return (
    <div className="space-y-6">
      {/* --- Screen UI (Mobile View) --- */}
      <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
        <div className="text-center py-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Inspección Finalizada</h2>
          <p className="text-slate-500">Revisa los resultados antes de subir.</p>
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

        {failedItems.length > 0 && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <h3 className="text-red-700 font-bold flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5" /> Incidencias Detectadas
            </h3>
            <ul className="space-y-2">
               {failedItems.map(item => (
                 <li key={item.pointId} className="text-sm text-red-800 flex justify-between bg-white p-2 rounded shadow-sm">
                   <span>{item.areaName} - {item.pointName}</span>
                   <span className="font-bold">NO CONFORME</span>
                 </li>
               ))}
            </ul>
          </div>
        )}

        <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 flex flex-col gap-3 pb-8 z-20">
          <button 
            onClick={handleFinishAndUpload}
            disabled={isProcessing}
            className="w-full py-4 px-4 rounded-xl bg-safety-600 text-white font-bold shadow-lg shadow-safety-200 hover:bg-safety-700 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
          >
            {isProcessing ? 'Procesando...' : (
               <>
                <Upload className="w-5 h-5" /> Finalizar y Subir a Nube
               </>
            )}
          </button>

          <div className="flex gap-2">
            <button 
                onClick={handleDownloadOnly}
                disabled={isProcessing}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 flex items-center justify-center gap-2 text-sm"
            >
                <FileDown className="w-4 h-4" /> Solo Descargar PDF
            </button>
            <button 
                onClick={onConfirm}
                className="py-3 px-4 rounded-xl border border-slate-200 text-slate-400 font-bold hover:bg-slate-50 hover:text-slate-600"
            >
                <Home className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="h-32" />
      </div>

      {/* --- Hidden Report Template for PDF Generation --- */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -50 }}>
        <div ref={reportContainerRef}>
          
          {/* PAGE 1: Summary, Executive Report & Signatures */}
          {/* Added more bottom padding (pb-20) to ensure signatures aren't cut off */}
          <div className="pdf-page bg-white p-10 w-[210mm] min-h-[297mm] relative text-slate-900 font-sans border border-gray-200 pb-20 flex flex-col">
             <ReportHeader title="Informe de Inspección" showDetails={false} />
             
             {/* General Info Block */}
             <div className="bg-slate-50 p-6 rounded-lg mb-6 border border-slate-200">
                <h3 className="font-bold text-slate-700 mb-4 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">Datos Generales</h3>
                <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    <div>
                        <span className="block text-slate-400 text-xs">Instalación / Centro</span>
                        <span className="font-bold text-lg text-slate-800">{log.siteName}</span>
                    </div>
                    <div>
                        <span className="block text-slate-400 text-xs">Fecha y Hora</span>
                        <span className="font-bold text-lg text-slate-800">{new Date(log.date).toLocaleString()}</span>
                    </div>
                    <div>
                        <span className="block text-slate-400 text-xs">Inspector</span>
                        <span className="font-bold">{log.inspectorName}</span>
                        <span className="block text-xs text-slate-500">{log.inspectorDni}</span>
                    </div>
                     <div>
                        <span className="block text-slate-400 text-xs">Resultado Global</span>
                        <span className={`font-bold ${failedItems.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {failedItems.length > 0 ? 'CON INCIDENCIAS' : 'APTO / CORRECTO'}
                        </span>
                    </div>
                </div>
             </div>

             {/* NEW: Executive Summary by Area */}
             <div className="mb-8">
                <h3 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider flex items-center gap-2">
                    <ListChecks className="w-4 h-4" /> Resumen Ejecutivo por Áreas
                </h3>
                <table className="w-full text-sm border-collapse border border-slate-200">
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="p-2 border border-slate-200 text-left">Área Inspeccionada</th>
                            <th className="p-2 border border-slate-200 text-center w-24">Total Puntos</th>
                            <th className="p-2 border border-slate-200 text-center w-24 text-green-700">Conformes</th>
                            <th className="p-2 border border-slate-200 text-center w-24 text-red-700">No Conformes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {areaStats.map(stat => (
                            <tr key={stat.name}>
                                <td className="p-2 border border-slate-200 font-medium">{stat.name}</td>
                                <td className="p-2 border border-slate-200 text-center">{stat.total}</td>
                                <td className="p-2 border border-slate-200 text-center font-bold text-green-600">{stat.ok}</td>
                                <td className={`p-2 border border-slate-200 text-center font-bold ${stat.nok > 0 ? 'text-red-600 bg-red-50' : 'text-slate-300'}`}>
                                    {stat.nok}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>

             {/* Non-Conformities Table (Only if exists) */}
             {failedItems.length > 0 && (
                 <div className="mb-6">
                    <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2 uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4" /> 
                        Detalle de No Conformidades
                    </h3>
                    <table className="w-full text-xs text-left border-collapse border border-red-100">
                        <thead className="bg-red-50 text-red-900">
                            <tr>
                                <th className="p-2 border border-red-200">Área</th>
                                <th className="p-2 border border-red-200">Punto</th>
                                <th className="p-2 border border-red-200">Observación</th>
                            </tr>
                        </thead>
                        <tbody>
                            {failedItems.map((item, idx) => (
                                <tr key={idx} className="border-b border-slate-100">
                                    <td className="p-2 font-medium text-slate-700">{item.areaName}</td>
                                    <td className="p-2 text-slate-600">{item.pointName}</td>
                                    <td className="p-2 text-slate-500 italic">{item.comments || "Sin comentarios"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
             )}

             {/* Signatures - Fixed positioning with mt-auto */}
             <div className="mt-auto pt-8">
                <div className="grid grid-cols-2 gap-12">
                    <div className="border-t-2 border-slate-300 pt-4 text-center">
                        <div className="h-20 mb-2 bg-slate-50 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-300 italic text-xs">
                           Firma Digital Inspector
                        </div>
                        <p className="font-bold text-slate-800 text-sm">{log.inspectorName}</p>
                        <p className="text-xs text-slate-500">Inspector de Seguridad</p>
                    </div>
                    <div className="border-t-2 border-slate-300 pt-4 text-center">
                        <div className="h-20 mb-2 bg-slate-50 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-300 italic text-xs">
                           Sello / Firma Empresa
                        </div>
                        <p className="font-bold text-slate-800 text-sm">Recibí Conforme</p>
                        <p className="text-xs text-slate-500">Responsable de Centro</p>
                    </div>
                </div>
             </div>

             {/* Page Number Footer */}
             <div className="absolute bottom-4 left-0 w-full text-center text-xs text-slate-400 border-t border-slate-100 pt-2 mx-10 w-[calc(100%-80px)]">
                Página 1 de {uniqueAreaNames.length + 1} - Generado por SeguridadPro
             </div>
          </div>

          {/* PAGE 2..N: Detailed Areas */}
          {uniqueAreaNames.map((areaName, index) => (
             <div key={areaName} className="pdf-page bg-white p-10 w-[210mm] min-h-[297mm] relative text-slate-900 font-sans border border-gray-200 mb-4">
                <ReportHeader title={`Detalle: ${areaName}`} />
                
                <div className="space-y-4">
                    {log.answers.filter(a => a.areaName === areaName).map(ans => (
                       <div key={ans.pointId} className="p-3 border-b border-slate-100 flex gap-4 break-inside-avoid">
                          <div className="flex-1">
                             <h4 className="font-bold text-slate-700 text-sm">{ans.pointName}</h4>
                             <p className="text-xs text-slate-500 mb-1">{ans.question}</p>
                             
                             <div className="flex items-center gap-2 mb-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${ans.isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {ans.isOk ? 'Conforme' : 'No Conforme'}
                                </span>
                             </div>

                             {ans.comments && (
                                <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded mt-1 border border-slate-100">
                                   "{ans.comments}"
                                </p>
                             )}
                          </div>
                          {ans.photoUrl && (
                            // UPDATED PHOTO SIZE: w-24 (6rem/96px) -> w-40 (10rem/160px) ~1.6x larger
                            <div className="w-40 h-40 flex-shrink-0 bg-slate-100 border border-slate-200 rounded overflow-hidden">
                               <img src={ans.photoUrl} className="w-full h-full object-cover" alt="Evidencia" />
                            </div>
                          )}
                       </div>
                    ))}
                </div>

                {/* Page Number Footer */}
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
