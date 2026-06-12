import { z } from 'zod';

/** Round to 2 decimal places (bututs) — use after any money arithmetic. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/** True when the value has no more than 2 decimal places (allowing float noise). */
export function isValidMoneyAmount(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

const TWO_DECIMALS_MESSAGE = 'Amounts can have at most 2 decimal places (e.g. 150.75)';

/** Positive money amount, up to 2 decimal places. */
export const positiveMoneySchema = z
  .number()
  .finite()
  .positive()
  .refine(isValidMoneyAmount, { message: TWO_DECIMALS_MESSAGE });

/** Money amount within [min, max], up to 2 decimal places. */
export function boundedMoneySchema(min: number, max: number) {
  return z
    .number()
    .finite()
    .min(min)
    .max(max)
    .refine(isValidMoneyAmount, { message: TWO_DECIMALS_MESSAGE });
}
