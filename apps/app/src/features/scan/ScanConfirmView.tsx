import type { RecognitionResult } from '@mogiri/shared';
import { mergeResults } from '@mogiri/shared/recognize';
import { Link, useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { recognitionToTicketDraft } from '../../domain';
import { playDetentClick } from '../../platform';
import { Btn, btnClass, Container, Label, Reveal, useUiStore } from '../../ui';
import { TicketFormView } from '../ticket/TicketFormView';

export const ScanConfirmView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scanSession = useUiStore((s) => s.scanSession);
  const setScanSession = useUiStore((s) => s.setScanSession);

  if (!scanSession) {
    return (
      <Container className="py-24 text-center space-y-5">
        <p className="font-editorial text-3xl text-fg">{t('scan.confirm.empty')}</p>
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
    playDetentClick();
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
      {/* 顶部识别核验档案卡 */}
      <Reveal className="archival-card rounded-[22px] p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <Link to="/scan" className={btnClass('pill')}>
                ← {t('scan.confirm.back')}
              </Link>
              <Label index={isDone ? 'PASS' : 'HOLD'}>{t('scan.confirm.eyebrow')}</Label>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-medium ${
                  isDone ? 'bg-emerald-600/10 text-emerald-700' : 'bg-accent/10 text-accent'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isDone ? 'bg-emerald-600' : 'bg-accent'}`}
                />
                {decision.toUpperCase()}
              </span>
            </div>

            <div>
              <h1 className="font-editorial text-[24px] sm:text-[28px] leading-tight tracking-[-0.02em] text-fg">
                {isDone ? t('scan.confirm.titleDone') : t('scan.confirm.titleReview')}
              </h1>
              <p className="text-[13px] text-muted mt-0.5">{t(`scan.confirm.route.${decision}`)}</p>
            </div>
          </div>

          {!isDone && (
            <Btn variant="accent" arrow onClick={handleSimulateAiRefine}>
              {t('scan.confirm.refine')}
            </Btn>
          )}
        </div>

        {matchedRules.length > 0 && (
          <div className="recessed-plinth rounded-xl px-3.5 py-2.5 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-muted mr-1.5">
              {t('scan.confirm.rules')}:
            </span>
            {matchedRules.map((rule) => (
              <span
                key={rule}
                className="rounded-full bg-bg-raised border border-line px-2.5 py-0.5 font-mono text-[11px] text-fg shadow-2xs"
              >
                {rule}
              </span>
            ))}
          </div>
        )}
      </Reveal>

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
