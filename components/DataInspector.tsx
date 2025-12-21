import React, { useEffect, useState } from 'react';
import { getDbSchema, getDbPreview } from '../services/duckDb';
import { X, Table, FileText } from 'lucide-react';

interface DataInspectorProps {
  isOpen: boolean;
  onClose: () => void;
}

const DataInspector: React.FC<DataInspectorProps> = ({ isOpen, onClose }) => {
  const [schema, setSchema] = useState<any[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([getDbSchema(), getDbPreview()])
        .then(([schemaData, previewData]) => {
          setSchema(schemaData);
          setPreview(previewData);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Table className="text-indigo-500" /> Data Inspector
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-8 bg-slate-50/50">
          
          {loading ? (
             <div className="flex items-center justify-center py-12 text-slate-500">Loading data details...</div>
          ) : (
            <>
              {/* Columns */}
              <section>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Table Columns (Schema)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {schema.map((col) => (
                    <div key={col.column_name} className="bg-white border border-slate-200 p-2 rounded-lg flex flex-col">
                      <span className="font-mono text-xs font-bold text-indigo-700 truncate" title={col.column_name}>{col.column_name}</span>
                      <span className="text-[10px] text-slate-400">{col.column_type}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Data Preview */}
              <section>
                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <FileText size={12} /> First 5 Rows (Preview)
                 </h4>
                 <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                             {schema.map(col => (
                               <th key={col.column_name} className="p-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                                  {col.column_name}
                               </th>
                             ))}
                          </tr>
                       </thead>
                       <tbody>
                          {preview.map((row, i) => (
                             <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/30">
                                {schema.map(col => (
                                  <td key={col.column_name} className="p-2 text-xs font-mono text-slate-600 whitespace-nowrap max-w-[150px] overflow-hidden text-ellipsis">
                                     {String(row[col.column_name])}
                                  </td>
                                ))}
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DataInspector;