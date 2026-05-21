import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Check as CheckIcon,
  ChevronDown,
  Loader2,
  Trash2,
} from 'lucide-react';
import { ToolbarPreset } from '../types';
import {
  presetToolbarDiffersFromSnapshot,
  ToolbarPresetSnapshot,
} from '../utils/toolbarPresetUtils';
import { useConfirmAction } from '../hooks/useConfirmAction';

export type GalleryPresetSource = 'global' | 'folder';

interface GalleryPresetMenuProps {
  presets: ToolbarPreset[];
  presetSource: GalleryPresetSource;
  onPresetSourceChange: (source: GalleryPresetSource) => void;
  currentSnapshot: ToolbarPresetSnapshot;
  onApplyPreset: (preset: ToolbarPreset) => void;
  onSavePreset?: (name: string) => Promise<void>;
  onUpdatePreset?: (presetId: string) => Promise<void>;
  onDeletePreset?: (presetId: string) => Promise<void>;
  folderName?: string;
  disabled?: boolean;
}

export const GalleryPresetMenu: React.FC<GalleryPresetMenuProps> = ({
  presets,
  presetSource,
  onPresetSourceChange,
  currentSnapshot,
  onApplyPreset,
  onSavePreset,
  onUpdatePreset,
  onDeletePreset,
  folderName,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [presetNameDraft, setPresetNameDraft] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [updatingPresetId, setUpdatingPresetId] = useState<string | null>(null);
  const [justUpdatedPresetId, setJustUpdatedPresetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const presetNameInputRef = useRef<HTMLInputElement>(null);
  const confirmPresetDelete = useConfirmAction<string>({
    onConfirm: async (presetId) => {
      if (!onDeletePreset) return;
      try {
        await onDeletePreset(presetId);
      } catch (err) {
        console.warn('[GalleryPresetMenu] delete failed:', err);
      }
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsNamingPreset(false);
        setPresetError(null);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setIsNamingPreset(false);
        setPresetError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isNamingPreset) presetNameInputRef.current?.focus();
  }, [isNamingPreset]);

  const sortedPresets = useMemo(
    () =>
      [...presets].sort((a, b) => {
        const aApplied = !presetToolbarDiffersFromSnapshot(a, currentSnapshot);
        const bApplied = !presetToolbarDiffersFromSnapshot(b, currentSnapshot);
        if (aApplied && !bApplied) return -1;
        if (!aApplied && bApplied) return 1;
        return a.name.localeCompare(b.name);
      }),
    [presets, currentSnapshot]
  );

  const handleDeletePreset = (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    if (!onDeletePreset) return;
    confirmPresetDelete.trigger(presetId);
  };

  const handleUpdatePreset = async (e: React.MouseEvent, presetId: string) => {
    e.stopPropagation();
    if (!onUpdatePreset) return;
    setUpdatingPresetId(presetId);
    try {
      await onUpdatePreset(presetId);
      setJustUpdatedPresetId(presetId);
      window.setTimeout(() => setJustUpdatedPresetId(null), 2000);
    } catch (err) {
      console.warn('[GalleryPresetMenu] update failed:', err);
    } finally {
      setUpdatingPresetId(null);
    }
  };

  const handleConfirmSavePreset = async () => {
    if (!onSavePreset) return;
    setIsSavingPreset(true);
    setPresetError(null);
    try {
      await onSavePreset(presetNameDraft);
      setIsNamingPreset(false);
      setPresetNameDraft('');
    } catch (err: unknown) {
      setPresetError(err instanceof Error ? err.message : 'Failed to save preset.');
    } finally {
      setIsSavingPreset(false);
    }
  };

  const sourceLabel =
    presetSource === 'folder'
      ? folderName
        ? `${folderName} presets`
        : 'Folder presets'
      : 'Global presets';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={`Presets: ${presets.length} saved (${sourceLabel})`}
        className={`group/tip-presets relative inline-flex items-center justify-center gap-1 px-3 py-2 min-h-11 rounded-lg border transition shrink-0 disabled:opacity-50 disabled:pointer-events-none ${
          isOpen
            ? 'border-brand-teal bg-brand-teal/10 text-brand-teal'
            : 'border-gray-300 dark:border-[#30363d] bg-white dark:bg-[#161b22] text-slate-700 dark:text-slate-200 hover:border-brand-teal hover:text-brand-teal'
        }`}
      >
        <Bookmark size={16} aria-hidden />
        <ChevronDown size={14} className="opacity-70" aria-hidden />
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium px-2 py-1 rounded-md bg-black/90 text-white shadow-lg opacity-0 group-hover/tip-presets:opacity-100 group-focus-visible/tip-presets:opacity-100 transition-opacity z-20"
        >
          {presets.length === 0 ? 'Presets' : `${presets.length} preset${presets.length === 1 ? '' : 's'}`}
        </span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-2 w-72 sm:w-80 bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-xl shadow-xl z-[45] overflow-hidden flex flex-col"
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-[#30363d] bg-gray-50 dark:bg-[#0d1117] space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Preset source
            </p>
            <div className="flex rounded-lg border border-gray-200 dark:border-[#30363d] overflow-hidden">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={presetSource === 'global'}
                onClick={() => onPresetSourceChange('global')}
                className={`flex-1 px-2 py-2 text-[11px] font-semibold transition min-h-[44px] sm:min-h-0 ${
                  presetSource === 'global'
                    ? 'bg-brand-teal text-white'
                    : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#21262d]'
                }`}
              >
                Global
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={presetSource === 'folder'}
                onClick={() => onPresetSourceChange('folder')}
                className={`flex-1 px-2 py-2 text-[11px] font-semibold transition min-h-[44px] sm:min-h-0 ${
                  presetSource === 'folder'
                    ? 'bg-brand-teal text-white'
                    : 'bg-white dark:bg-[#161b22] text-slate-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#21262d]'
                }`}
              >
                This folder
              </button>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              {presetSource === 'folder'
                ? 'Saves and lists presets for this folder only. Switch to Global to use account-wide presets.'
                : 'Uses your account presets. Switch to This folder to override with folder-specific presets.'}
            </p>
          </div>

          <div className="max-h-52 overflow-y-auto custom-scrollbar p-1">
            {sortedPresets.length === 0 ? (
              <div className="px-3 py-5 text-center text-xs text-slate-500">
                No saved presets in this source yet.
              </div>
            ) : (
              sortedPresets.map((preset) => {
                const isDirty = presetToolbarDiffersFromSnapshot(preset, currentSnapshot);
                const isApplied = !isDirty;
                const isUpdatingThis = updatingPresetId === preset.id;
                const showOverwriteRow =
                  onUpdatePreset &&
                  (isDirty || isUpdatingThis || justUpdatedPresetId === preset.id);
                return (
                  <div
                    key={preset.id}
                    className={`rounded-md border transition-colors ${
                      isApplied
                        ? 'bg-brand-teal/10 ring-1 ring-brand-teal/30 border-transparent'
                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-[#21262d]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 p-2">
                      <button
                        type="button"
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                        onClick={() => {
                          onApplyPreset(preset);
                          setIsOpen(false);
                        }}
                      >
                        <Bookmark size={14} className="shrink-0 text-brand-teal mt-0.5" />
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`text-xs truncate font-semibold ${
                              isApplied ? 'text-brand-teal' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {preset.name}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate">
                            {[preset.selectedModel, preset.aspectRatio]
                              .filter(Boolean)
                              .join(' · ') || 'Toolbar snapshot'}
                          </span>
                        </div>
                      </button>
                      {onDeletePreset && (
                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(e, preset.id)}
                          className={`p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 shrink-0 flex items-center justify-center rounded-md transition-colors ${
                            confirmPresetDelete.isArmed(preset.id)
                              ? 'bg-amber-500 text-white'
                              : 'hover:bg-gray-100 dark:hover:bg-[#30363d] text-slate-500 hover:text-red-500'
                          }`}
                          aria-label={
                            confirmPresetDelete.isArmed(preset.id)
                              ? `Confirm delete ${preset.name}`
                              : `Delete ${preset.name}`
                          }
                        >
                          {confirmPresetDelete.isArmed(preset.id) ? (
                            <CheckIcon size={12} />
                          ) : (
                            <Trash2 size={12} />
                          )}
                        </button>
                      )}
                    </div>
                    {showOverwriteRow && (
                      <div className="px-2 pb-2">
                        <button
                          type="button"
                          onClick={(e) => handleUpdatePreset(e, preset.id)}
                          disabled={isUpdatingThis}
                          className="w-full text-left rounded-md px-2 py-2 text-[11px] font-semibold text-brand-teal hover:bg-brand-teal/10 disabled:opacity-60 min-h-[44px] sm:min-h-0"
                        >
                          {isUpdatingThis ? (
                            <span className="inline-flex items-center gap-2">
                              <Loader2 size={14} className="animate-spin" />
                              Saving…
                            </span>
                          ) : justUpdatedPresetId === preset.id ? (
                            'Preset updated'
                          ) : (
                            'Overwrite with current toolbar'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {onSavePreset && (
            <div className="border-t border-gray-200 dark:border-[#30363d] p-2 bg-gray-50 dark:bg-[#0d1117]">
              {isNamingPreset ? (
                <div className="space-y-2">
                  <input
                    ref={presetNameInputRef}
                    type="text"
                    value={presetNameDraft}
                    onChange={(e) => {
                      setPresetNameDraft(e.target.value);
                      if (presetError) setPresetError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleConfirmSavePreset();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsNamingPreset(false);
                        setPresetNameDraft('');
                        setPresetError(null);
                      }
                    }}
                    placeholder="Preset name"
                    maxLength={60}
                    className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] text-sm rounded-md px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-brand-teal"
                  />
                  {presetError && (
                    <p className="text-[11px] text-red-500">{presetError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleConfirmSavePreset()}
                      disabled={isSavingPreset || !presetNameDraft.trim()}
                      className="flex-1 rounded-md bg-brand-teal text-white text-xs font-semibold py-2 min-h-[44px] sm:min-h-0 disabled:opacity-50"
                    >
                      {isSavingPreset ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNamingPreset(false);
                        setPresetNameDraft('');
                        setPresetError(null);
                      }}
                      className="rounded-md border border-gray-200 dark:border-[#30363d] text-xs font-semibold px-3 py-2 min-h-[44px] sm:min-h-0"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsNamingPreset(true);
                    setPresetNameDraft('');
                    setPresetError(null);
                  }}
                  className="w-full rounded-md border border-dashed border-brand-teal/50 text-brand-teal text-xs font-semibold py-2 min-h-[44px] sm:min-h-0 hover:bg-brand-teal/10"
                >
                  Save current toolbar as preset
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
