import type { EarningsCalculationResult, GrossPayMode } from '../../domain/earnings.ts';

export function shouldShowGrossEstimate(mode: GrossPayMode | null): boolean {
  return mode === 'MONTHLY_GROSS' || mode === 'HOURLY_GROSS';
}

export function canApproveEarnings(result: EarningsCalculationResult | null): boolean {
  return result?.status === 'COMPLETE' && result.totalAmountMinor !== null && result.snapshot !== null;
}
