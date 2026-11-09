import type { RecognitionResult } from '@mogiri/shared';
import { mergeResults } from '@mogiri/shared/recognize';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { recognitionToTicketDraft } from '../../domain';
import { Btn, btnClass, Container, Label, useUiStore } from '../../ui';
import { TicketFormView } from '../ticket/TicketFormView';

export const ScanConfirmView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scanSession = useUiStore((s) => s.scanSession);
  const setScanSession = useUiStore((s) => s.setScanSession);

  if (!scanSession) {
    return (
      <Container className="py-24 text-center space-y-5">
        <p className="display text-3xl text-fg">{t('scan.confirm.empty')}</p>
        <div>
          <Link to="/scan" className={btnClass('outline')}>
            ← {t('scan.confirm.back')}
          </Link>
        </div>
      </Container>
    );
  }

  const { draft, decision, matchedRules, localOutput, scanFrontDataUrl, sizeMm } = scanSession;

  const handleSimulateAiRefine = () => {
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

  const isDone = decision === 'done';

  return (
    <Container className="py-10 sm:py-14 space-y-10">
      {/* 顶部返回与识别结论刊头 */}
      <div className="space-y-6 border-b border-line pb-8">
        <Link
          to="/scan"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted hover:text-fg transition-colors"
        >
          <span>←</span>
          <span>{t('scan.confirm.back')}</span>
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7 space-y-2">
            <Label index={isDone ? 'OK' : 'REVIEW'}>{t('scan.confirm.eyebrow')}</Label>
            <h1 className="display text-4xl sm:text-5xl text-fg">
              {isDone ? t('scan.confirm.titleDone') : t('scan.confirm.titleReview')}
            </h1>
            <p className="text-sm text-muted max-w-xl">{t(`scan.confirm.route.${decision}`)}</p>
          </div>

          <div className="lg:col-span-5 flex flex-wrap lg:justify-end gap-3">
            {!isDone && (
              <Btn variant="accent" arrow onClick={handleSimulateAiRefine}>
                {t('scan.confirm.refine')}
              </Btn>
            )}
          </div>
        </div>

        {matchedRules.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="label mr-1">{t('scan.confirm.rules')}:</span>
            {matchedRules.map((rule) => (
              <span
                key={rule}
                className="border border-line bg-bg-raised px-2 py-0.5 font-mono text-[10.5px] text-fg"
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
    </Container>
  );
};
