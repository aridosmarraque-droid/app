import React, { useRef, useState } from 'react';
import { InspectionLog } from '../types';
import { CheckCircle, AlertTriangle, Upload, FileDown, Home } from 'lucide-react';
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
  const reportRef = useRef<HTMLDivElement>(null);

  const failedItems = log.answers.filter(a => !a.isOk);
  const passedItems = log.answers.filter(a => a.isOk);

  const generatePdfBlob = async (): Promise<Blob | null> => {
    if (!reportRef.current || !window.jspdf || !window.html2canvas) {
      toast.error('Librerías PDF no cargadas.');
      return null;
    }

    try {
      const { jsPDF } = window.jspdf;
      
      const canvas = await window.html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1000
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.90);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
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

  return (
    <div className="space-y-6">
      {/* --- Screen UI --- */}
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
      {/* Position fixed far off screen ensures visibility for html2canvas without messing up layout */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', width: '210mm', zIndex: -50 }}>
        <div ref={reportRef} className="bg-white p-8 w-[210mm] min-h-[297mm] text-slate-900 font-sans">
          
          {/* Header */}
          <div className="border-b-4 border-safety-500 pb-4 mb-8 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">Informe de Inspección</h1>
              <p className="text-slate-500 text-sm mt-1">Seguridad Preventiva Industrial</p>
            </div>
            <div className="text-right text-sm">
              <p className="font-bold">{log.siteName}</p>
              <p>{new Date(log.date).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-1">ID: {log.id}</p>
            </div>
          </div>

          {/* Inspector Info */}
          <div className="bg-slate-50 p-4 rounded-lg mb-8 border border-slate-200">
            <h3 className="font-bold text-slate-700 mb-2 uppercase text-xs tracking-wider">Datos del Inspector</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
               <div>
                 <span className="block text-slate-400 text-xs">Nombre</span>
                 <span className="font-semibold">{log.inspectorName}</span>
               </div>
               <div>
                 <span className="block text-slate-400 text-xs">DNI</span>
                 <span className="font-semibold">{log.inspectorDni}</span>
               </div>
               <div>
                 <span className="block text-slate-400 text-xs">Email</span>
                 <span className="font-semibold">{log.inspectorEmail}</span>
               </div>
            </div>
          </div>

          {/* Details - Grouped by Area */}
          <div className="space-y-8 mb-10">
             {/* We manually group answers by Area Name for display */}
             {Array.from(new Set(log.answers.map(a => a.areaName))).map(areaName => (
               <div key={areaName} className="break-inside-avoid">
                 <h3 className="text-lg font-bold bg-slate-800 text-white px-4 py-2 rounded-t-lg">{areaName}</h3>
                 <div className="border border-t-0 border-slate-200 rounded-b-lg divide-y divide-slate-100">
                    {log.answers.filter(a => a.areaName === areaName).map(ans => (
                       <div key={ans.pointId} className="p-4 flex gap-4 break-inside-avoid">
                          <div className="flex-1">
                             <h4 className="font-bold text-slate-700">{ans.pointName}</h4>
                             <p className="text-sm text-slate-500 mb-1">{ans.question}</p>
                             
                             <div className="flex items-center gap-2 mb-1">
                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold ${ans.isOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {ans.isOk ? <CheckCircle className="w-3 h-3"/> : <AlertTriangle className="w-3 h-3"/>}
                                    {ans.isOk ? 'CONFORME' : 'NO CONFORME'}
                                </div>
                             </div>

                             {ans.comments && (
                                <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded mt-2 border border-slate-100">
                                   " {ans.comments} "
                                </p>
                             )}
                          </div>
                          {ans.photoUrl && (
                            <div className="w-32 h-24 flex-shrink-0 bg-slate-100 border border-slate-200 rounded overflow-hidden">
                               <img src={ans.photoUrl} className="w-full h-full object-cover" alt="Evidencia" />
                            </div>
                          )}
                       </div>
                    ))}
                 </div>
               </div>
             ))}
          </div>

          {/* Non-conformance Summary */}
          {failedItems.length > 0 && (
             <div className="mb-10 break-inside-avoid">
                <h3 className="text-xl font-bold text-red-600 mb-4 border-b border-red-200 pb-2">Resumen de No Conformidades</h3>
                <table className="w-full text-sm text-left">
                   <thead className="bg-red-50 text-red-800">
                     <tr>
                       <th className="p-2">Área</th>
                       <th className="p-2">Punto</th>
                       <th className="p-2">Estado</th>
                       <th className="p-2">Notas</th>
                     </tr>
                   </thead>
                   <tbody>
                     {failedItems.map(item => (
                       <tr key={item.pointId} className="border-b border-slate-100">
                         <td className="p-2">{item.areaName}</td>
                         <td className="p-2 font-medium">{item.pointName}</td>
                         <td className="p-2 text-red-600 font-bold">NO OK</td>
                         <td className="p-2 text-xs italic text-slate-500">{item.comments || '-'}</td>
                       </tr>
                     ))}
                   </tbody>
                </table>
             </div>
          )}

          {/* Signatures */}
          <div className="mt-16 break-inside-avoid">
             <h3 className="text-lg font-bold text-slate-800 mb-6">Firmas de Conformidad</h3>
             <div className="grid grid-cols-2 gap-10">
                <div className="border-t-2 border-slate-400 pt-4 text-center">
                   <div className="h-20 mb-2 bg-slate-50 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-300">
                      Espacio para firma digital
                   </div>
                   <p className="font-bold text-slate-700">{log.inspectorName}</p>
                   <p className="text-xs text-slate-500 uppercase">Inspector</p>
                </div>
                <div className="border-t-2 border-slate-400 pt-4 text-center">
                   <div className="h-20 mb-2 bg-slate-50 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-300">
                      Espacio para firma digital
                   </div>
                   <p className="font-bold text-slate-700">Gerencia / Responsable</p>
                   <p className="text-xs text-slate-500 uppercase">Áridos Marraque</p>
                </div>
             </div>
          </div>
          
          <div className="mt-12 text-center text-xs text-slate-400 border-t border-slate-100 pt-4">
             Generado por SeguridadPro App - {new Date().getFullYear()}
          </div>
        </div>
      </div>
    </div>
  );
};
