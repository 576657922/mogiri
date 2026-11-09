import { detectQuality, lowerTier, type QualityTier, type TicketSpec } from '@mogiri/renderer';
import type { LocalRecognition, NextStep } from '@mogiri/shared/recognize';
import { create } from 'zustand';
import type { RecognitionDraft } from '../domain';

export type ScanPendingSession = {
  draft: RecognitionDraft;
  decision: NextStep;
  matchedRules: string[];
  localOutput?: LocalRecognition;
  scanFrontDataUrl?: string;
  sizeMm?: { w: number; h: number };
};

export type ActiveStageConfig = {
  spec: TicketSpec;
  flipped: boolean;
  onTear?: () => void;
};

interface UiState {
  qualityPref: 'auto' | QualityTier;
  resolvedQuality: QualityTier;
  timelineView: 'stack' | 'grid';
  activeStage: ActiveStageConfig | null;
  scanSession: ScanPendingSession | null;
  setQualityPref: (pref: 'auto' | QualityTier) => void;
  downgradeQuality: () => void;
  initQualityDetection: () => Promise<void>;
  setTimelineView: (view: 'stack' | 'grid') => void;
  setActiveStage: (stage: ActiveStageConfig | null) => void;
  setScanSession: (session: ScanPendingSession | null) => void;
}

const savedQuality =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem('mogiri_quality') as 'auto' | QualityTier | null)
    : null;

export const useUiStore = create<UiState>((set, get) => ({
  qualityPref: savedQuality ?? 'auto',
  resolvedQuality: savedQuality && savedQuality !== 'auto' ? savedQuality : 'high',
  timelineView: 'stack',
  activeStage: null,
  scanSession: null,

  setQualityPref: (pref) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mogiri_quality', pref);
    }
    if (pref === 'auto') {
      set({ qualityPref: 'auto' });
      void get().initQualityDetection();
    } else {
      set({ qualityPref: pref, resolvedQuality: pref });
    }
  },

  downgradeQuality: () => {
    const { qualityPref, resolvedQuality } = get();
    if (qualityPref !== 'auto') return;
    set({ resolvedQuality: lowerTier(resolvedQuality) });
  },

  initQualityDetection: async () => {
    const { qualityPref } = get();
    if (qualityPref !== 'auto') {
      set({ resolvedQuality: qualityPref });
      return;
    }
    const detected = await detectQuality();
    set({ resolvedQuality: detected });
  },

  setTimelineView: (view) => set({ timelineView: view }),
  setActiveStage: (activeStage) => set({ activeStage }),
  setScanSession: (scanSession) => set({ scanSession }),
}));
