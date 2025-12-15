import React, { useState } from 'react';
import { GeneratedImage } from '../types';
import { Download, RefreshCw, Send, Image as ImageIcon } from 'lucide-react';

interface ImageDisplayProps {
  image: GeneratedImage | null;
  onRefine: (refinementText: string) => void;
  isRefining: boolean;
}

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ 
  image, 
  onRefine,
  isRefining 
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
          <div className="relative shadow-2xl shadow-slate-300 dark:shadow-black rounded-lg overflow-hidden border border-gray-200 dark:border-[#30363d] bg-white dark:bg-[#0d1117]">
            <img 
              src={image.imageUrl} 
              alt="Generated Output" 
              className="max-w-full max-h-[70vh] object-contain block"
            />
            
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={handleDownload}
                className="bg-black/30 dark:bg-white/10 backdrop-blur-md border border-white/20 text-white p-3 rounded-xl shadow-lg hover:bg-black/50 dark:hover:bg-white/20 transition-all"
                title="Download Image"
              >
                <Download size={20} />
              </button>
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