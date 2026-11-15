import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { PublicConfig, TierId, TierInfo } from '../../lib/types';

function price(t: TierInfo): string {
  return t.priceUsd > 0 ? `$${t.priceUsd.toFixed(2)}` : '$0';
}

export function PlanCards({
  config,
  currentTier,
  renderAction,
}: {
  config: PublicConfig;
  currentTier?: TierId;
  renderAction: (tier: TierInfo, isCurrent: boolean) => ReactNode;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {config.tiers.map((t) => {
        const featured = t.id === 'pro';
        const isCurrent = currentTier === t.id;
        return (
          <div
            key={t.id}
            className={clsx(
              'relative flex flex-col rounded-2xl border p-7 transition',
              featured ? 'border-ink-300 bg-ink-800 shadow-glow' : 'border-ink-700 bg-ink-850',
              !t.enabled && 'opacity-70',
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-7 rounded-full bg-ink-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-950">Most popular</span>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-medium text-ink-50">{t.name}</h3>
              {isCurrent && <span className="rounded-full border border-ink-400 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-100">Current</span>}
              {!t.enabled && <span className="rounded-full border border-ink-500 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-300">Coming soon</span>}
            </div>
            <div className="mt-5 flex items-baseline gap-1.5">
              {t.enabled || t.priceUsd > 0 ? (
                <>
                  <span className="font-display text-5xl text-ink-50">{price(t)}</span>
                  {t.priceUsd > 0 && <span className="text-sm text-ink-300">/month</span>}
                </>
              ) : (
                <span className="font-display text-4xl text-ink-200">TBA</span>
              )}
            </div>
            <ul className="mt-6 flex-1 space-y-3">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm leading-6 text-ink-200">
                  <Check size={16} className="mt-1 shrink-0 text-ink-50" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-8">{renderAction(t, isCurrent)}</div>
          </div>
        );
      })}
    </div>
  );
}
