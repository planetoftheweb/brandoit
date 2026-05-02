import { ToolbarPreset, User, UserPreferences } from "../types";
import { authService } from "./authService";

/**
 * Manages user-saved toolbar presets. Each preset is a named snapshot of
 * commonly toggled toolbar fields (type/style/colors/size/model/quality/svgMode)
 * so users can recall a frequently-used combination with one click.
 *
 * Presets are persisted on the user document under `preferences.presets` so
 * they survive sign-outs and device switches. Guest users are not supported
 * (the UI hides the "save preset" affordance until signed in).
 */

const generatePresetId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildNextPreferences = (user: User, nextPresets: ToolbarPreset[]): UserPreferences => ({
  ...user.preferences,
  presets: nextPresets
});

export const presetService = {
  /**
   * Persist a new preset to the user's preferences. Returns the saved preset
   * (with generated id + createdAt) and the resulting preset list so callers
   * can update local state in one shot.
   */
  savePreset: async (
    user: User,
    name: string,
    snapshot: Omit<ToolbarPreset, "id" | "name" | "createdAt">
  ): Promise<{ preset: ToolbarPreset; presets: ToolbarPreset[] }> => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Preset name is required.");

    const preset: ToolbarPreset = {
      id: generatePresetId(),
      name: trimmedName,
      createdAt: Date.now(),
      ...snapshot
    };

    const existing = user.preferences.presets || [];
    const presets = [...existing, preset];
    await authService.updateUserPreferences(user.id, buildNextPreferences(user, presets));
    return { preset, presets };
  },

  /**
   * Overwrite an existing preset by id. Used by "Update from current toolbar"
   * affordances so users don't accumulate near-duplicate snapshots.
   */
  updatePreset: async (
    user: User,
    presetId: string,
    updates: Partial<Omit<ToolbarPreset, "id" | "createdAt">>
  ): Promise<ToolbarPreset[]> => {
    const existing = user.preferences.presets || [];
    if (!existing.some(p => p.id === presetId)) {
      throw new Error("Preset not found.");
    }
    const presets = existing.map(p =>
      p.id === presetId
        ? {
            ...p,
            ...updates,
            // Preserve immutable fields.
            id: p.id,
            createdAt: p.createdAt,
            name: (updates.name ?? p.name).trim() || p.name
          }
        : p
    );
    await authService.updateUserPreferences(user.id, buildNextPreferences(user, presets));
    return presets;
  },

  /**
   * Remove a preset by id. Returns the resulting preset list.
   */
  deletePreset: async (user: User, presetId: string): Promise<ToolbarPreset[]> => {
    const existing = user.preferences.presets || [];
    const presets = existing.filter(p => p.id !== presetId);
    await authService.updateUserPreferences(user.id, buildNextPreferences(user, presets));
    return presets;
  }
};
