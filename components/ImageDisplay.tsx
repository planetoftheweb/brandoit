import React, { useState } from 'react';
import { GeneratedImage } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon, Copy, Trash2 } from 'lucide-react';

interface ImageDisplayProps {
  image: GeneratedImage | null;
  onRefine: (refinementText: string) => void;
  isRefining: boolean;
  onCopy?: () => void;
  onDelete?: () => void;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  image, 
  onRefine,
  isRefining,
  onCopy,
  onDelete
}) => {
  const [refinementInput, setRefinementInput] = useState('');

  const handleDownload = () => {
    if (!image) return;
    const link = document.createElement('a');
    link.href = image.imageUrl;
    link.download = `brandoit-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (refinementInput.trim()) {
      onRefine(refinementInput);
      setRefinementInput('');
    }
  };

  if (!image) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full min-h-[60vh] text-slate-900 dark:text-white">
        <div className="w-24 h-24 rounded-3xl bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] flex items-center justify-center mb-6 shadow-xl shadow-slate-200 dark:shadow-black/50 rotate-3 transition-transform hover:rotate-0">
          <ImageIcon size={40} className="text-slate-400 dark:text-slate-600" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Ready to Create</h2>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mt-3 text-sm leading-relaxed">
          Configure your brand settings in the toolbar above and enter a prompt to generate professional, consistent graphics instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Main Image Viewport */}
      <div className="flex-1 overflow-auto p-4 md:p-8 flex items-center justify-center">
        <div className="relative group max-w-full max-h-full">
          <div className="absolute inset-0 bg-brand-red/20 blur-3xl rounded-full opacity-20 pointer-events-none"></div>
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-visible border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">
            <img 
              src={image.imageUrl} 
              alt="Generated Output" 
              className="max-w-full max-h-[70vh] object-contain block rounded-lg"
            />
            
            <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {onCopy && (
                <button 
                  onClick={onCopy}
                  className="group/copy bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                  title="Copy prompt"
                >
                  <Copy size={18} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/copy:opacity-100 transition-opacity">
                    Copy prompt
                  </span>
                </button>
              )}
              <button 
                onClick={handleDownload}
                className="group/download bg-white/90 dark:bg-[#1f252d]/90 border border-gray-300/80 dark:border-white/15 text-slate-800 dark:text-slate-200 p-3 rounded-xl shadow-lg hover:bg-brand-teal hover:border-brand-teal hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-teal/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                title="Download Image"
              >
                <Download size={20} />
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/download:opacity-100 transition-opacity">
                  Download
                </span>
              </button>
              {onDelete && (
                <button 
                  onClick={onDelete}
                  className="group/delete bg-white/85 dark:bg-[#2b1c1c]/85 border border-red-200/80 dark:border-red-900/40 text-red-600 dark:text-red-200 p-3 rounded-xl shadow-lg hover:bg-red-600 hover:border-red-600 hover:text-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-red-400/70 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-[#161b22] transition relative"
                  title="Delete"
                >
                  <Trash2 size={18} />
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/delete:opacity-100 transition-opacity">
                    Delete
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Refinement Bar */}
      <div className="w-full flex justify-center pb-8 px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-gray-200 dark:border-[#30363d] p-2 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50">
          <form onSubmit={handleRefineSubmit} className="flex gap-2">
            <input
              type="text"
              value={refinementInput}
              onChange={(e) => setRefinementInput(e.target.value)}
              placeholder="Refine this image (e.g. 'Make the background darker')..."
              className="flex-1 p-3 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
              disabled={isRefining}
            />
            <button
              type="submit"
              disabled={!refinementInput || isRefining}
              className={`px-4 rounded-xl font-medium text-white flex items-center gap-2 transition-all ${
                !refinementInput || isRefining
                  ? 'bg-gray-200 dark:bg-[#30363d] text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-red-700 text-white shadow-lg shadow-brand-red/20'
              }`}
            >
               {isRefining ? (
                 <RefreshCw size={16} className="animate-spin" />
               ) : (
                 <Send size={16} />
               )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};