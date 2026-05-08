import type { ItemHandlingRecord } from './master-schema';
import type { DisplayRiskLevel, ItemMetric } from './view-schema';

export type { DisplayRiskLevel } from './view-schema';

export const DISPLAY_RISK_VARIANTS: Record<DisplayRiskLevel, string> = {
  red: 'bg-destructive text-destructive-foreground',
  yellow: 'bg-warning text-warning-foreground',
  green: 'bg-success text-success-foreground',
  surplus: 'bg-surplus text-surplus-foreground',
  dormant: 'bg-dormant text-dormant-foreground',
  deferred: 'bg-muted text-muted-foreground',
};

export const DISPLAY_RISK_LABELS: Record<DisplayRiskLevel, string> = {
  red: '危険',
  yellow: '警告',
  green: '安全',
  surplus: '余剰',
  dormant: '休眠',
  deferred: '見送り',
};

export function getDisplayRiskLabel(level: DisplayRiskLevel): string {
  return DISPLAY_RISK_LABELS[level];
}

export function getDisplayRiskTextClass(level: DisplayRiskLevel): string | undefined {
  if (level === 'red') return 'text-destructive';
  if (level === 'yellow') return 'text-warning';
  if (level === 'green') return 'text-success';
  if (level === 'surplus') return 'text-surplus';
  if (level === 'dormant') return 'text-dormant';
  if (level === 'deferred') return 'text-muted-foreground';
  return undefined;
}

function toLocalDateOnlyString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isDeferredHandlingActive(params: {
  handlingStatus?: 'normal' | 'deferred';
  suppressUntil?: string;
  handlingActive?: boolean;
}): boolean {
  if (params.handlingActive !== undefined) return params.handlingActive;
  if (params.handlingStatus !== 'deferred') return false;
  if (!params.suppressUntil) return true;
  return params.suppressUntil >= toLocalDateOnlyString();
}

export function getEffectiveDisplayRisk(
  item: Pick<ItemMetric, 'risk_level' | 'display_risk_level' | 'handling_status' | 'handling_until' | 'handling_active'>,
  handling?: Pick<ItemHandlingRecord, 'handling_status' | 'suppress_until'>
): DisplayRiskLevel {
  if (handling) {
    const active = isDeferredHandlingActive({
      handlingStatus: handling.handling_status,
      suppressUntil: handling.suppress_until,
    });
    if (active && (item.risk_level === 'red' || item.risk_level === 'yellow')) {
      return 'deferred';
    }
    return item.risk_level;
  }

  const active = isDeferredHandlingActive({
    handlingStatus: item.handling_status,
    suppressUntil: item.handling_until,
    handlingActive: item.handling_active,
  });
  if (active && (item.risk_level === 'red' || item.risk_level === 'yellow')) {
    return 'deferred';
  }
  return item.display_risk_level ?? item.risk_level;
}
