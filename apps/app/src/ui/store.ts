import { detectQuality, lowerTier, type QualityTier, type TicketSpec } from '@mogiri/renderer';
import type { LocalRecognition, NextStep } from '@mogiri/shared/recognize';
import { create } from 'zustand';
import type { RecognitionDraft } from '../domain';
import { isSfxEnabled, setSfxEnabled as persistSfxEnabled } from '../platform';

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

export type StageBackdrop = 'obsidian' | 'limestone' | 'velvet';

interface UiState {
  bootstrapped: boolean;
  qualityPref: 'auto' | QualityTier;
  resolvedQuality: QualityTier;
  timelineView: 'stack' | 'grid';
  stageBackdrop: StageBackdrop;
  sfxEnabled: boolean;
  activeStage: ActiveStageConfig | null;
  scanSession: ScanPendingSession | null;
  setBootstrapped: (ready: boolean) => void;
  setQualityPref: (pref: 'auto' | QualityTier) => void;
  downgradeQuality: () => void;
  initQualityDetection: () => Promise<void>;
  setTimelineView: (view: 'stack' | 'grid') => void;
  setStageBackdrop: (backdrop: StageBackdrop) => void;
  setSfxEnabled: (enabled: boolean) => void;
  setActiveStage: (stage: ActiveStageConfig | null) => void;
  setScanSession: (session: ScanPendingSession | null) => void;
}

const savedQuality =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem('mogiri_quality') as 'auto' | QualityTier | null)
    : null;

const savedBackdrop =
  typeof localStorage !== 'undefined'
    ? (localStorage.getItem('mogiri_backdrop') as StageBackdrop | null)
    : null;

export const useUiStore = create<UiState>((set, get) => ({
  bootstrapped: false,
  qualityPref: savedQuality ?? 'auto',
  resolvedQuality: savedQuality && savedQuality !== 'auto' ? savedQuality : 'high',
  timelineView: 'stack',
  stageBackdrop: savedBackdrop ?? 'obsidian',
  sfxEnabled: isSfxEnabled(),
  activeStage: null,
  scanSession: null,

  setBootstrapped: (bootstrapped) => set({ bootstrapped }),

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

  setStageBackdrop: (backdrop) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('mogiri_backdrop', backdrop);
    }
    set({ stageBackdrop: backdrop });
  },

  setSfxEnabled: (enabled) => {
    persistSfxEnabled(enabled);
    set({ sfxEnabled: enabled });
  },

  setActiveStage: (activeStage) => set({ activeStage }),
  setScanSession: (scanSession) => set({ scanSession }),
}));
