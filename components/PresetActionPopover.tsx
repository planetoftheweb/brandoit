import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check as CheckIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { ToolbarPreset } from '../types';
import { useConfirmAction } from '../hooks/useConfirmAction';

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface PresetActionPopoverProps {
  preset: ToolbarPreset;
  anchor: AnchorRect;
  isApplied: boolean;
  onClose: () => void;
  onUpdate?: (presetId: string) => Promise<void>;
  onDelete?: (presetId: string) => Promise<void>;
  onRename?: (presetId: string, name: string) => Promise<void>;
}

const POPOVER_WIDTH = 224;
const GAP = 8;
const MARGIN = 8;

function computePopoverStyle(
  anchor: AnchorRect,
  estimatedHeight: number
): React.CSSProperties {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const openLeft = anchor.right + GAP + POPOVER_WIDTH > vw - MARGIN;
  const top = Math.max(
    MARGIN,
    Math.min(anchor.top, vh - MARGIN - estimatedHeight)
  );
  const style: React.CSSProperties = {
    position: 'fixed',
    top,
    width: POPOVER_WIDTH,
    zIndex: 70,
  };
  if (openLeft) {
    style.right = vw - anchor.left + GAP;
  } else {
    style.left = anchor.right + GAP;
  }
  return style;
}

export const PresetActionPopover: React.FC<PresetActionPopoverProps> = ({
  preset,
  anchor,
  isApplied,
  onClose,
  onUpdate,
  onDelete,
  onRename,
}) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(preset.name);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isSubmittingRename, setIsSubmittingRename] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const confirmDelete = useConfirmAction<string>({
    onConfirm: async (id) => {
      if (!onDelete) return;
      try {
        await onDelete(id);
        onClose();
      } catch (err) {
        console.warn('[PresetActionPopover] delete failed:', err);
      }
    },
  });

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleStartRename = () => {
    setRenameDraft(preset.name);
    setRenameError(null);
    setIsRenaming(true);
  };

  const handleCancelRename = () => {
    setIsRenaming(false);
    setRenameDraft(preset.name);
    setRenameError(null);
  };

  const handleConfirmRename = async () => {
    if (!onRename) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenameError('Name is required.');
      return;
    }
    setIsSubmittingRename(true);
    setRenameError(null);
    try {
      await onRename(preset.id, trimmed);
      onClose();
    } catch (err: unknown) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename preset.');
    } finally {
      setIsSubmittingRename(false);
    }
  };

  const handleUpdate = async () => {
    if (!onUpdate) return;
    setIsUpdating(true);
    try {
      await onUpdate(preset.id);
      setJustUpdated(true);
      window.setTimeout(() => setJustUpdated(false), 1500);
    } catch (err) {
      console.warn('[PresetActionPopover] overwrite failed:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const style = computePopoverStyle(anchor, isRenaming ? 180 : 170);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="menu"
      data-preset-popover="action"
      style={style}
      className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-lg shadow-xl p-1 space-y-1"
    >
      {isRenaming ? (
        <div className="p-1 space-y-2">
          <input
            ref={renameInputRef}
            type="text"
            value={renameDraft}
            onChange={(e) => {
              setRenameDraft(e.target.value);
              if (renameError) setRenameError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleConfirmRename();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelRename();
              }
            }}
            placeholder="Preset name"
            maxLength={60}
            className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] text-xs rounded-md px-2 py-2 focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
          {renameError && (
            <p className="text-[11px] text-red-500">{renameError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleConfirmRename()}
              disabled={isSubmittingRename || !renameDraft.trim()}
              className="flex-1 rounded-md bg-brand-teal text-white text-[11px] font-semibold py-2 min-h-[44px] sm:min-h-0 disabled:opacity-50"
            >
              {isSubmittingRename ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleCancelRename}
              className="rounded-md border border-gray-200 dark:border-[#30363d] text-[11px] font-semibold px-3 py-2 min-h-[44px] sm:min-h-0"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {onRename && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStartRename();
              }}
              className="w-full text-left rounded-md px-2 py-2 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#21262d] min-h-[44px] sm:min-h-0 inline-flex items-center gap-2"
            >
              <Pencil size={12} className="text-slate-500" />
              Rename
            </button>
          )}
          {onUpdate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleUpdate();
              }}
              disabled={isUpdating || isApplied}
              className="w-full text-left rounded-md px-2 py-2 text-[11px] font-medium text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50 disabled:hover:bg-transparent min-h-[44px] sm:min-h-0 inline-flex items-center gap-2"
            >
              {isUpdating ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Saving…
                </>
              ) : justUpdated ? (
                <>
                  <CheckIcon size={12} />
                  Preset updated
                </>
              ) : (
                <>
                  <RefreshCw size={12} />
                  {isApplied
                    ? 'Already matches toolbar'
                    : 'Overwrite with current toolbar'}
                </>
              )}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                confirmDelete.trigger(preset.id);
              }}
              className={`w-full text-left rounded-md px-2 py-2 text-[11px] font-medium min-h-[44px] sm:min-h-0 inline-flex items-center gap-2 transition-colors ${
                confirmDelete.isArmed(preset.id)
                  ? 'bg-amber-500 text-white hover:bg-amber-500'
                  : 'text-red-500 hover:bg-red-500/10'
              }`}
            >
              {confirmDelete.isArmed(preset.id) ? (
                <>
                  <CheckIcon size={12} />
                  Click again to confirm
                </>
              ) : (
                <>
                  <Trash2 size={12} />
                  Delete preset
                </>
              )}
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  );
};
