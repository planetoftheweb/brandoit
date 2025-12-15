import React from 'react';
import { GenerationHistoryItem, GenerationConfig, BrandColor, VisualStyle, GraphicType, AspectRatioOption } from '../types';
import { Clock, Copy, ArrowUpRight, Trash2 } from 'lucide-react';

interface RecentGenerationsProps {
  history: GenerationHistoryItem[];
  onSelect: (item: GenerationHistoryItem) => void;
  options: {
    brandColors: BrandColor[];
    visualStyles: VisualStyle[];
    graphicTypes: GraphicType[];
    aspectRatios: AspectRatioOption[];
  };
}

export const RecentGenerations: React.FC<RecentGenerationsProps> = ({ 
  history, 
  onSelect,
  options
}) => {
  if (history.length === 0) return null;

  const getLabel = (id: string, list: any[]) => {
    const item = list.find(i => i.id === id || i.value === id);
    return item?.name || item?.label || id;
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150">
      <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400">
        <Clock size={18} />
        <h3 className="text-sm font-bold uppercase tracking-wider">Recent Captures</h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {history.map((item) => (
          <div 
            key={item.id} 
            className="group relative bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:border-brand-teal dark:hover:border-brand-teal transition-all cursor-pointer"
            onClick={() => onSelect(item)}
          >
            {/* Thumbnail */}
            <div className="aspect-square w-full relative bg-gray-100 dark:bg-[#0d1117] overflow-hidden">
              <img 
                src={item.imageUrl} 
                alt={item.config.prompt} 
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="text-white font-medium flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md text-xs">
                  <ArrowUpRight size={14} /> Restore
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <p className="text-xs font-medium text-slate-900 dark:text-white line-clamp-2 mb-2 h-8 leading-relaxed">
                {item.config.prompt}
              </p>
              
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-[#30363d] text-slate-600 dark:text-slate-300">
                  {getLabel(item.config.graphicTypeId, options.graphicTypes)}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 dark:bg-[#30363d] text-slate-600 dark:text-slate-300">
                  {getLabel(item.config.visualStyleId, options.visualStyles)}
                </span>
              </div>
              
              <div className="mt-2 text-[10px] text-slate-400">
                {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
