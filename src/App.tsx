import React, { useEffect, useMemo, useState } from 'react';
import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  FileCheck,
  FileText,
  Filter,
  Inbox,
  Loader2,
  Package,
  Search,
  Settings,
  Truck,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

import StatusBadge from './components/StatusBadge';
import WebhookSettings from './components/WebhookSettings';
import { sanitizeTextInput } from './shared/sanitizers';

export type ProcessStatus = 'open' | 'conflict' | 'completed';
export type StepStatus = 'pending' | 'analyzing' | 'verified' | 'conflict';

export interface DocumentStep {
  status: StepStatus;
  fileName?: string;
  uploadedAt?: Timestamp;
  conflictReason?: string | null;
  data?: Record<string, unknown> | null;
}

export interface ProcurementProcess {
  id: string;
  supplierName: string;
  status: ProcessStatus;
  createdAt: Timestamp | null;
  order: DocumentStep;
  confirmation: DocumentStep;
  delivery: DocumentStep;
}

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const DEFAULT_APP_ID = 'default-app-id';

const getFirebaseConfig = (): FirebaseOptions | null => {
  const rawConfig = import.meta.env.VITE_FIREBASE_CONFIG ?? window.__firebase_config;
  if (!rawConfig) return null;
  try {
    const parsed = JSON.parse(rawConfig) as FirebaseOptions;
    return parsed;
  } catch (error) {
    console.error('Firebase config parse error', error);
    return null;
  }
};

const getFirebaseServices = (): FirebaseServices | null => {
  const config = getFirebaseConfig();
  if (!config) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };
};

const getAppId = (): string => {
  const fromEnv = import.meta.env.VITE_APP_ID;
  if (fromEnv && typeof fromEnv === 'string') {
    return sanitizeTextInput(fromEnv);
  }
  if (window.__app_id) {
    return sanitizeTextInput(window.__app_id);
  }
  return DEFAULT_APP_ID;
};

const safeGetLocalStorage = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch (error) {
    console.error('LocalStorage read failed', error);
    return '';
  }
};

const safeSetLocalStorage = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.error('LocalStorage write failed', error);
  }
};

const formatDate = (timestamp: Timestamp | null): string => {
  if (!timestamp) return '-';
  return new Date(timestamp.seconds * 1000).toLocaleString('de-DE');
};

const defaultStep: DocumentStep = {
  status: 'pending',
  conflictReason: null,
  data: null,
};

const buildProcess = (data: DocumentData, fallbackId: string): ProcurementProcess => {
  const orderStep = (data.order as DocumentStep | undefined) ?? {};
  const confirmationStep = (data.confirmation as DocumentStep | undefined) ?? {};
  const deliveryStep = (data.delivery as DocumentStep | undefined) ?? {};

  return {
    id: sanitizeTextInput((data.id as string | undefined) ?? fallbackId),
    supplierName: sanitizeTextInput((data.supplierName as string | undefined) ?? 'Unbekannt'),
    status: (data.status as ProcessStatus | undefined) ?? 'open',
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    order: { ...defaultStep, ...orderStep },
    confirmation: { ...defaultStep, ...confirmationStep },
    delivery: { ...defaultStep, ...deliveryStep },
  };
};

const sanitizeStage = (stage: string): 'confirmation' | 'delivery' | null => {
  if (stage === 'confirmation' || stage === 'delivery') return stage;
  return null;
};

const useProcurementData = (
  services: FirebaseServices | null,
  appId: string,
  setConnectionStatus: React.Dispatch<React.SetStateAction<'connecting' | 'connected' | 'error'>>,
): ProcurementProcess[] => {
  const [items, setItems] = useState<ProcurementProcess[]>([]);

  useEffect(() => {
    if (!services) {
      setConnectionStatus('error');
      return () => {};
    }

    const colRef = collection(services.db, 'artifacts', appId, 'public', 'data', 'procurement_processes');
    const q = query(colRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setConnectionStatus('connected');
        const processes = snapshot.docs.map((d) => buildProcess(d.data(), d.id));
        processes.sort((a, b) => b.id.localeCompare(a.id));
        setItems(processes);
      },
      (error) => {
        console.error('Firestore listener error', error);
        setConnectionStatus('error');
      },
    );

    return unsubscribe;
  }, [services, appId, setConnectionStatus]);

  return items;
};

const initialWebhookUrls = {
  confirmation: safeGetLocalStorage('n8n_webhook_conf'),
  delivery: safeGetLocalStorage('n8n_webhook_del'),
};

const App: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ProcessStatus>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [uploadingStage, setUploadingStage] = useState<'confirmation' | 'delivery' | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [webhookUrls, setWebhookUrls] = useState(initialWebhookUrls);
  const [searchTerm, setSearchTerm] = useState('');

  const services = useMemo(() => getFirebaseServices(), []);
  const appId = useMemo(() => getAppId(), []);

  const processes = useProcurementData(services, appId, setConnectionStatus);

  useEffect(() => {
    if (!services) {
      setConnectionStatus('error');
      return undefined;
    }

    const authenticate = async (): Promise<void> => {
      try {
        const auth = services.auth;
        if (window.__initial_auth_token && window.__initial_auth_token.trim().length > 0) {
          await signInWithCustomToken(auth, window.__initial_auth_token.trim());
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error('Authentication error', error);
        setConnectionStatus('error');
      }
    };

    const unsubscribe = onAuthStateChanged(services.auth, (currentUser) => {
      setUser(currentUser);
    });

    void authenticate();
    return () => unsubscribe();
  }, [services]);

  const filteredProcesses = useMemo(() => {
    const sanitized = sanitizeTextInput(searchTerm).toLowerCase();
    const byStatus = filter === 'all' ? processes : processes.filter((p) => p.status === filter);
    if (!sanitized) return byStatus;
    return byStatus.filter((p) => p.id.toLowerCase().includes(sanitized));
  }, [filter, processes, searchTerm]);

  const stats = useMemo(
    () => ({
      total: processes.length,
      open: processes.filter((p) => p.status === 'open').length,
      conflict: processes.filter((p) => p.status === 'conflict').length,
      completed: processes.filter((p) => p.status === 'completed').length,
    }),
    [processes],
  );

  const selectedProcess = useMemo(
    () => processes.find((p) => p.id === selectedId) ?? null,
    [processes, selectedId],
  );

  const saveWebhooks = (urls: { confirmation: string; delivery: string }): void => {
    const sanitizedConfirmation = sanitizeTextInput(urls.confirmation);
    const sanitizedDelivery = sanitizeTextInput(urls.delivery);
    setWebhookUrls({ confirmation: sanitizedConfirmation, delivery: sanitizedDelivery });
    safeSetLocalStorage('n8n_webhook_conf', sanitizedConfirmation);
    safeSetLocalStorage('n8n_webhook_del', sanitizedDelivery);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    rawStage: string,
  ): Promise<void> => {
    const stage = sanitizeStage(rawStage);
    const file = event.target.files?.[0];

    if (!stage || !file) {
      return;
    }

    const sanitizedId = selectedId ? sanitizeTextInput(selectedId) : null;
    if (!sanitizedId || !services) {
      return;
    }

    const webhookUrl = stage === 'confirmation' ? webhookUrls.confirmation : webhookUrls.delivery;
    setUploadingStage(stage);

    try {
      const docRef = doc(services.db, 'artifacts', appId, 'public', 'data', 'procurement_processes', sanitizedId);
      await updateDoc(docRef, {
        [`${stage}.status`]: 'analyzing',
        [`${stage}.fileName`]: sanitizeTextInput(file.name),
        [`${stage}.uploadedAt`]: Timestamp.now(),
      });

      if (webhookUrl) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('orderId', sanitizedId);
        formData.append('stage', stage);

        const response = await fetch(webhookUrl, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`Webhook responded with status ${response.status}`);
        }
      } else {
        const isConflict = Math.random() > 0.7;
        await updateDoc(docRef, {
          [`${stage}.status`]: isConflict ? 'conflict' : 'verified',
          [`${stage}.conflictReason`]: isConflict ? 'Menge weicht ab (Simulierter Fehler)' : null,
          status: isConflict ? 'conflict' : stage === 'delivery' ? 'completed' : 'open',
        });
      }
    } catch (error) {
      console.error('Upload error', error);
      alert('Beim Upload ist ein Fehler aufgetreten. Bitte prüfe die Webhook-URL oder die Netzwerkverbindung.');
    } finally {
      setUploadingStage(null);
    }
  };

  if (!services) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white border border-red-200 rounded-xl p-6 shadow-md max-w-md w-full text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-red-600 font-semibold">
            <AlertCircle className="w-5 h-5" />
            <span>Firebase-Konfiguration fehlt</span>
          </div>
          <p className="text-sm text-slate-600">
            Bitte hinterlege die Firebase Konfiguration in <code>VITE_FIREBASE_CONFIG</code> oder als
            <code> window.__firebase_config</code> bevor du fortfährst.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      <aside className="w-full md:w-72 bg-white border-r border-slate-200 flex-shrink-0 md:h-screen sticky top-0 overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center gap-2">
            <Activity className="text-blue-600 w-6 h-6" />
            ProcureMatch
          </h1>
          <div className="mt-2 flex flex-col gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-semibold">App-ID:</span>
              <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{appId}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {connectionStatus === 'connected' ? (
                <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                  <Wifi className="w-3 h-3" /> Online
                </span>
              ) : connectionStatus === 'error' ? (
                <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  <WifiOff className="w-3 h-3" /> Fehler
                </span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Verbinde...
                </span>
              )}
            </div>
            <div className="text-slate-500">
              {user ? (
                <span className="font-mono">User: {user.uid.slice(0, 6)}...</span>
              ) : (
                <span className="italic text-slate-400">Noch nicht authentifiziert</span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`flex items-center justify-between w-full p-3 rounded-lg transition-colors ${
              filter === 'all' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Inbox className="w-4 h-4" />
              <span>Alle Vorgänge</span>
            </div>
            <span className="bg-white px-2 py-0.5 rounded-full text-xs border shadow-sm">{stats.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('open')}
            className={`flex items-center justify-between w-full p-3 rounded-lg transition-colors ${
              filter === 'open' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4" />
              <span>In Bearbeitung</span>
            </div>
            <span className="bg-white px-2 py-0.5 rounded-full text-xs border shadow-sm">{stats.open}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('conflict')}
            className={`flex items-center justify-between w-full p-3 rounded-lg transition-colors ${
              filter === 'conflict' ? 'bg-red-50 text-red-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-4 h-4" />
              <span>Konflikte</span>
            </div>
            {stats.conflict > 0 && (
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs font-bold">{stats.conflict}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter('completed')}
            className={`flex items-center justify-between w-full p-3 rounded-lg transition-colors ${
              filter === 'completed' ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4" />
              <span>Archiviert</span>
            </div>
            <span className="bg-white px-2 py-0.5 rounded-full text-xs border shadow-sm">{stats.completed}</span>
          </button>
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 w-full p-2 rounded-lg hover:bg-slate-50"
          >
            <Settings className="w-4 h-4" />Einstellungen
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {filter === 'all' && 'Gesamtübersicht'}
              {filter === 'open' && 'Offene Vorgänge'}
              {filter === 'conflict' && 'Vorgänge mit Konflikten'}
              {filter === 'completed' && 'Abgeschlossene Vorgänge'}
            </h2>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200 shadow-sm w-full md:w-auto">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              placeholder="Bestellnr. suchen..."
              className="bg-transparent outline-none text-sm w-full md:w-56"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              aria-label="Bestellnummer suchen"
            />
            <Filter className="w-4 h-4 text-slate-300" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <div className="col-span-3">Bestellung / Referenz</div>
            <div className="col-span-3">Lieferant</div>
            <div className="col-span-2">Fortschritt</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Aktion</div>
          </div>

          {filteredProcesses.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center">
              <Package className="w-12 h-12 mb-3 opacity-20" />
              <p>Keine Vorgänge in dieser Ansicht.</p>
              {filter === 'all' && (
                <p className="text-sm mt-2">Starte einen neuen Vorgang, indem du eine Bestellung über deinen N8n Workflow hochlädst.</p>
              )}
            </div>
          ) : (
            filteredProcesses.map((process) => (
              <button
                type="button"
                key={process.id}
                onClick={() => setSelectedId(process.id)}
                className={`grid grid-cols-12 gap-4 p-4 border-b border-slate-50 items-center text-left transition-colors hover:bg-slate-50 ${
                  process.status === 'conflict' ? 'bg-red-50/30' : ''
                }`}
              >
                <div className="col-span-3 font-mono font-medium text-slate-700 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  {process.id}
                </div>
                <div className="col-span-3 text-sm text-slate-600">{process.supplierName}</div>
                <div className="col-span-2 flex items-center gap-1" aria-label="Fortschritt">
                  <div
                    className={`h-2 w-2 rounded-full ${process.order?.status === 'verified' ? 'bg-emerald-500' : 'bg-slate-200'}`}
                    title="Bestellung"
                  />
                  <div className={`h-0.5 w-4 ${process.confirmation?.status === 'verified' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  <div
                    className={`h-2 w-2 rounded-full ${
                      process.confirmation?.status === 'verified'
                        ? 'bg-emerald-500'
                        : process.confirmation?.status === 'conflict'
                          ? 'bg-red-500'
                          : 'bg-slate-200'
                    }`}
                    title="AB"
                  />
                  <div className={`h-0.5 w-4 ${process.delivery?.status === 'verified' ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  <div
                    className={`h-2 w-2 rounded-full ${
                      process.delivery?.status === 'verified'
                        ? 'bg-emerald-500'
                        : process.delivery?.status === 'conflict'
                          ? 'bg-red-500'
                          : 'bg-slate-200'
                    }`}
                    title="Lieferschein"
                  />
                </div>
                <div className="col-span-2">
                  <StatusBadge status={process.status} />
                </div>
                <div className="col-span-2 text-right">
                  <ChevronRight className="w-5 h-5 text-slate-300 ml-auto" />
                </div>
              </button>
            ))
          )}
        </div>
      </main>

      {selectedProcess && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{selectedProcess.id}</h2>
                  <StatusBadge status={selectedProcess.status} />
                </div>
                <p className="text-slate-500 font-medium">{selectedProcess.supplierName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="p-2 hover:bg-white rounded-full transition-colors border border-transparent hover:border-slate-200 hover:shadow-sm"
                aria-label="Detailansicht schließen"
              >
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {selectedProcess.status === 'conflict' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 animate-in fade-in slide-in-from-top-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-red-100 p-2 rounded-full">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-red-900 text-lg">Konflikt erkannt</h3>
                      <p className="text-red-700 mt-1">Bitte prüfen:</p>
                      <ul className="list-disc list-inside mt-2 text-red-800 font-medium text-sm space-y-1">
                        {selectedProcess.confirmation?.status === 'conflict' && (
                          <li>Auftragsbestätigung: {selectedProcess.confirmation.conflictReason}</li>
                        )}
                        {selectedProcess.delivery?.status === 'conflict' && (
                          <li>Lieferschein: {selectedProcess.delivery.conflictReason}</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="relative pl-8 border-l-2 border-slate-200 pb-8 last:pb-0">
                <div className="absolute -left-[9px] top-0 bg-white border-2 border-blue-500 text-blue-500 rounded-full w-4 h-4" />
                <div className="mb-4">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    1. Bestellung {selectedProcess.order.status === 'verified' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  </h3>
                  <p className="text-sm text-slate-500">Automatisch importiert via Google Drive</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-blue-400" />
                    <div>
                      <div className="font-medium text-slate-700">Originalbestellung</div>
                      <div className="text-xs text-slate-400">{formatDate(selectedProcess.createdAt)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`relative pl-8 border-l-2 ${selectedProcess.delivery.status !== 'pending' ? 'border-slate-200' : 'border-transparent'} pb-8 last:pb-0`}>
                <div
                  className={`absolute -left-[9px] top-0 bg-white border-2 rounded-full w-4 h-4 ${
                    selectedProcess.confirmation.status === 'verified'
                      ? 'border-emerald-500 bg-emerald-500'
                      : selectedProcess.confirmation.status === 'conflict'
                        ? 'border-red-500'
                        : 'border-slate-300'
                  }`}
                />
                <div className="mb-4 flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                      2. Auftragsbestätigung (AB) <StatusBadge status={selectedProcess.confirmation.status} />
                    </h3>
                  </div>
                </div>
                {selectedProcess.confirmation.status === 'pending' || selectedProcess.confirmation.status === 'conflict' ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 hover:bg-white hover:border-blue-300 transition-all text-center group">
                    {uploadingStage === 'confirmation' ? (
                      <div className="py-4 text-blue-600 flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="font-medium">Sende an N8n...</span>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event) => handleFileUpload(event, 'confirmation')}
                          accept="application/pdf,image/*"
                        />
                        <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:text-blue-500" />
                        <span className="text-blue-600 font-medium">AB hochladen</span>
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <FileCheck className="w-8 h-8 text-emerald-500" />
                      <div>
                        <div className="font-medium text-emerald-900">{selectedProcess.confirmation.fileName}</div>
                        <div className="text-xs text-emerald-600">Erfolgreich abgeglichen</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative pl-8 pb-8">
                <div
                  className={`absolute -left-[9px] top-0 bg-white border-2 rounded-full w-4 h-4 ${
                    selectedProcess.delivery.status === 'verified'
                      ? 'border-emerald-500 bg-emerald-500'
                      : selectedProcess.delivery.status === 'conflict'
                        ? 'border-red-500'
                        : 'border-slate-300'
                  }`}
                />
                <div className="mb-4">
                  <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                    3. Lieferschein <StatusBadge status={selectedProcess.delivery.status} />
                  </h3>
                </div>
                {selectedProcess.confirmation.status !== 'verified' ? (
                  <div className="text-sm text-slate-400 italic p-4 bg-slate-50 rounded-lg border border-slate-100">
                    Bitte zuerst die Auftragsbestätigung abschließen.
                  </div>
                ) : selectedProcess.delivery.status === 'pending' || selectedProcess.delivery.status === 'conflict' ? (
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 bg-slate-50 hover:bg-white hover:border-blue-300 transition-all text-center group">
                    {uploadingStage === 'delivery' ? (
                      <div className="py-4 text-blue-600 flex flex-col items-center">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <span className="font-medium">Sende an N8n...</span>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(event) => handleFileUpload(event, 'delivery')}
                          accept="application/pdf,image/*"
                        />
                        <Truck className="w-8 h-8 text-slate-400 mx-auto mb-2 group-hover:text-blue-500" />
                        <span className="text-blue-600 font-medium">Lieferschein hochladen</span>
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Truck className="w-8 h-8 text-emerald-500" />
                      <div>
                        <div className="font-medium text-emerald-900">{selectedProcess.delivery.fileName}</div>
                        <div className="text-xs text-emerald-600">Wareneingang bestätigt</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              {selectedProcess.status === 'completed' && (
                <div className="flex items-center gap-2 text-emerald-600 font-bold bg-white px-4 py-2 rounded-lg border border-emerald-100 shadow-sm">
                  <CheckCircle2 className="w-5 h-5" />Vorgang archiviert
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <WebhookSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        urls={webhookUrls}
        onSave={saveWebhooks}
        appId={appId}
      />
    </div>
  );
};

export default App;
