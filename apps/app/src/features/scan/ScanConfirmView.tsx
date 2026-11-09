import type { RecognitionResult } from '@mogiri/shared';
import { mergeResults } from '@mogiri/shared/recognize';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, Cpu, Sparkles } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { recognitionToTicketDraft } from '../../domain';
import { useUiStore } from '../../ui';
import { TicketFormView } from '../ticket/TicketFormView';

export const ScanConfirmView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scanSession = useUiStore((s) => s.scanSession);
  const setScanSession = useUiStore((s) => s.setScanSession);

  if (!scanSession) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-stone-400">{t('scan.confirmTitle')}</p>
        <Link
          to="/scan"
          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-stone-950"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('nav.scan')}
        </Link>
      </div>
    );
  }

  const { draft, decision, matchedRules, localOutput, scanFrontDataUrl, sizeMm } = scanSession;

  const handleSimulateAiRefine = () => {
    // 模拟云端文字整理与本地高置信度字段通过 mergeResults 合并（见 02-architecture §6.3）
    const cloudResult: RecognitionResult = {
      type: draft.input.type,
      title: {
        value:
          draft.input.title === 'Untitled Ticket' || draft.input.title === 'STARLIGHT PARADE'
            ? 'HOSHINO LUMI — STARLIGHT PARADE 2026'
            : draft.input.title,
        confidence: 0.95,
      },
      subtitle: {
        value: draft.input.subtitle ?? 'LIVE TOUR 2026 IN TOKYO DOME',
        confidence: 0.92,
      },
      eventAt: {
        value: draft.input.eventAt,
        confidence: 0.94,
      },
      details: {},
      language: 'ja',
      sensitive: [],
    };

    const merged = localOutput ? mergeResults(localOutput, cloudResult) : cloudResult;
    const refinedDraft = recognitionToTicketDraft(merged, 'cloud-text');
    refinedDraft.input.details = {
      ...draft.input.details,
      ...refinedDraft.input.details,
    };

    setScanSession({
      ...scanSession,
      draft: refinedDraft,
      decision: 'done',
      matchedRules: [...new Set([...matchedRules, 'cloud:ai-text-merge'])],
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/scan"
          className="inline-flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('nav.scan')}
        </Link>
        <h1 className="text-base font-bold text-stone-100">{t('scan.confirmTitle')}</h1>
      </div>

      {/* 识别路由决策状态卡片 */}
      <div
        className={`rounded-2xl border p-4 space-y-3 ${
          decision === 'done'
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/10'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-100">
            <CheckCircle2
              className={`h-4 w-4 ${decision === 'done' ? 'text-emerald-400' : 'text-amber-400'}`}
            />
            <span>{t(`scan.routeBadge.${decision}`)}</span>
          </div>

          {decision !== 'done' && (
            <button
              type="button"
              onClick={handleSimulateAiRefine}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-stone-950 hover:bg-amber-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('scan.retryAiBtn')}
            </button>
          )}
        </div>

        {matchedRules.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-stone-300">
            <span className="inline-flex items-center gap-1 text-stone-400">
              <Cpu className="h-3 w-3" />
              {t('scan.matchedRulesLabel')}:
            </span>
            {matchedRules.map((rule) => (
              <span
                key={rule}
                className="rounded-md bg-stone-900/80 border border-stone-700/80 px-2 py-0.5 font-mono text-[10px] text-amber-300"
              >
                {rule}
              </span>
            ))}
          </div>
        )}
      </div>

      <TicketFormView
        initialDraft={draft}
        initialScanDataUrl={scanFrontDataUrl}
        initialSizeMm={sizeMm}
        onSaved={(saved) => {
          setScanSession(null);
          void navigate({ to: '/t/$id', params: { id: saved.id } });
        }}
      />
    </div>
  );
};
