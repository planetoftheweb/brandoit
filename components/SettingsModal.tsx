import React, { useState } from 'react';
import { UserSettings, AspectRatioOption, GraphicType, User } from '../types';
import { X, Settings as SettingsIcon, Save, User as UserIcon } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSave: (newSettings: UserSettings, profileData?: { name: string; username: string }) => void;
  graphicTypes: GraphicType[];
  aspectRatios: AspectRatioOption[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSave,
  graphicTypes,
  aspectRatios
}) => {
  const [localSettings, setLocalSettings] = useState<UserSettings>(user.preferences.settings || { contributeByDefault: false });
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username || '');

  React.useEffect(() => {
    setLocalSettings(user.preferences.settings || { contributeByDefault: false });
    setName(user.name);
    setUsername(user.username || '');
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(localSettings, { name, username });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <SettingsIcon size={20} className="text-brand-teal" />
            <h3 className="text-lg font-bold">Preferences & Profile</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 rounded-md hover:bg-gray-100 dark:hover:bg-[#30363d] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          
          {/* Profile Section */}
          <div className="p-4 bg-gray-50 dark:bg-[#0d1117] rounded-lg border border-gray-200 dark:border-[#30363d] space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
              <UserIcon size={14} /> Profile
            </h4>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-brand-teal focus:outline-none"
                placeholder="Your Name"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Username (for Community)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-[#30363d] rounded-lg py-2.5 pl-7 pr-3 text-sm focus:ring-1 focus:ring-brand-teal focus:outline-none"
                  placeholder="username"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Shown as "by @{username || 'Anonymous'}" on your shared styles.
              </p>
            </div>
          </div>

          {/* Preferences Section */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Defaults</h4>
            
            {/* Contribution Setting */}
            <div className="flex items-start gap-3">
              <input 
                type="checkbox" 
                id="contributeDefault"
                checked={localSettings.contributeByDefault}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, contributeByDefault: e.target.checked }))}
                className="mt-1 w-4 h-4 text-brand-red rounded border-gray-300 focus:ring-brand-red cursor-pointer"
              />
              <div>
                <label htmlFor="contributeDefault" className="block text-sm font-medium cursor-pointer">
                  Contribute to Community Catalog by Default
                </label>
                <p className="text-xs text-slate-500 mt-1">
                  When adding new custom styles or palettes, automatically check the "Contribute" option to share them with others.
                </p>
              </div>
            </div>

            {/* Default Graphic Type */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Default Graphic Type
              </label>
              <select
                value={localSettings.defaultGraphicTypeId || ''}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, defaultGraphicTypeId: e.target.value }))}
                className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-brand-teal focus:outline-none"
              >
                <option value="">Use App Default (Infographic)</option>
                {graphicTypes.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Default Aspect Ratio */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Default Aspect Ratio
              </label>
              <select
                value={localSettings.defaultAspectRatio || ''}
                onChange={(e) => setLocalSettings(prev => ({ ...prev, defaultAspectRatio: e.target.value }))}
                className="w-full bg-white dark:bg-[#0d1117] border border-gray-200 dark:border-[#30363d] rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-brand-teal focus:outline-none"
              >
                <option value="">Use App Default (1:1)</option>
                {aspectRatios.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-[#30363d]">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#21262d] rounded-lg font-medium text-sm transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-brand-teal hover:bg-teal-600 text-white rounded-lg font-medium transition-colors text-sm shadow-lg shadow-brand-teal/20"
          >
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
