import type { RecognitionResult } from '@mogiri/shared';
import { mergeResults } from '@mogiri/shared/recognize';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { recognitionToTicketDraft } from '../../domain';
import { Btn, btnClass, Container, useUiStore } from '../../ui';
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
    <Container className="py-6 sm:py-8 space-y-6">
      {/* 顶部返回与识别状态条 */}
      <div className="rounded-[20px] bg-bg-raised border border-line p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link to="/scan" className={btnClass('pill')}>
              ← {t('scan.confirm.back')}
            </Link>
            <div>
              <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-fg">
                {isDone ? t('scan.confirm.titleDone') : t('scan.confirm.titleReview')}
              </h1>
              <p className="text-[12.5px] text-muted">{t(`scan.confirm.route.${decision}`)}</p>
            </div>
          </div>

          {!isDone && (
            <Btn variant="accent" arrow onClick={handleSimulateAiRefine}>
              {t('scan.confirm.refine')}
            </Btn>
          )}
        </div>

        {matchedRules.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-line">
            <span className="text-[11.5px] text-muted mr-1">{t('scan.confirm.rules')}</span>
            {matchedRules.map((rule) => (
              <span
                key={rule}
                className="rounded-full bg-bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-fg"
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
