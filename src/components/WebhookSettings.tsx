import React, { useEffect, useState } from 'react';
import { Database, Loader2, Settings, X } from 'lucide-react';
import { sanitizeTextInput } from '../shared/sanitizers';

interface WebhookSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (urls: { confirmation: string; delivery: string }) => void;
  urls: { confirmation: string; delivery: string };
  appId: string;
}

const WebhookSettings: React.FC<WebhookSettingsProps> = ({ isOpen, onClose, urls, onSave, appId }) => {
  const [localUrls, setLocalUrls] = useState(urls);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalUrls(urls);
  }, [urls]);

  if (!isOpen) return null;

  const save = (): void => {
    setIsSaving(true);
    const sanitized = {
      confirmation: sanitizeTextInput(localUrls.confirmation),
      delivery: sanitizeTextInput(localUrls.delivery),
    };
    onSave(sanitized);
    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 150);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6 border-b pb-4">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            Konfiguration
          </h2>
          <button type="button" onClick={onClose} aria-label="Einstellungen schließen">
            <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
          </button>
        </div>

        <div className="space-y-6 mb-6">
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              N8n Firestore Pfad
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Kopiere diesen Pfad exakt in deinen N8n <strong>Firestore Node</strong> unter <strong>Collection</strong>:
            </p>
            <div className="bg-white p-3 rounded border border-slate-300 font-mono text-xs text-slate-600 break-all select-all hover:border-blue-400 focus:border-blue-400 cursor-text">
              artifacts/{appId}/public/data/procurement_processes
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-700">Webhook URLs</h3>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="webhook-confirmation">
                Webhook für Auftragsbestätigung (AB)
              </label>
              <input
                id="webhook-confirmation"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="https://n8n.../webhook/..."
                value={localUrls.confirmation}
                onChange={(event) => setLocalUrls({ ...localUrls, confirmation: event.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="webhook-delivery">
                Webhook für Lieferschein
              </label>
              <input
                id="webhook-delivery"
                className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="https://n8n.../webhook/..."
                value={localUrls.delivery}
                onChange={(event) => setLocalUrls({ ...localUrls, delivery: event.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={save}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
};

export default WebhookSettings;
