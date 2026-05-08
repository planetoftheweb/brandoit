import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Generation } from '../types';
import { CachedImage } from './CachedImage';
import { buildImageCacheKey } from '../services/imageCache';

interface SearchModalProps {
  history: Generation[];
  onSelect: (gen: Generation) => void;
  onClose: () => void;
}

function getLatestVersion(gen: Generation) {
  const idx = Math.max(0, Math.min(gen.currentVersionIndex ?? gen.versions.length - 1, gen.versions.length - 1));
  return gen.versions[idx] ?? null;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-400/30 text-yellow-200 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export const SearchModal: React.FC<SearchModalProps> = ({ history, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const filtered = query.trim()
    ? history.filter((gen) =>
        gen.config.prompt.toLowerCase().includes(query.toLowerCase())
      )
    : history.slice(0, 30);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        const gen = filtered[activeIndex];
        if (gen) { onSelect(gen); onClose(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, filtered, activeIndex, onSelect]);

  // Scroll active item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[8vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl mx-4 bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#30363d]">
          <Search size={17} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search artwork by prompt…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-slate-500 bg-[#0d1117] border border-[#30363d] rounded font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <ul ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-10 text-center text-slate-500 text-sm">
              No artwork found for &ldquo;{query}&rdquo;
            </li>
          ) : (
            filtered.map((gen, i) => {
              const version = getLatestVersion(gen);
              const cacheKey = version ? buildImageCacheKey(gen.id, version.id) : '';
              const date = new Date(gen.createdAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <li key={gen.id}>
                  <button
                    type="button"
                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${
                      i === activeIndex ? 'bg-[#21262d]' : 'hover:bg-[#1c2128]'
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => { onSelect(gen); onClose(); }}
                  >
                    {/* Thumbnail */}
                    <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[#0d1117] border border-[#30363d]">
                      {version?.imageUrl ? (
                        <CachedImage
                          src={version.imageUrl}
                          cacheKey={cacheKey}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Search size={14} className="text-slate-600" />
                        </div>
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate leading-snug">
                        {highlightMatch(gen.config.prompt, query)}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{date}</p>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {/* Footer hint */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-[#30363d] text-[11px] text-slate-600">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span className="ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    </div>
  );
};
