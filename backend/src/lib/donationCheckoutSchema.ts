import { z } from 'zod';
import { Currency } from '@prisma/client';
import { MAX_PLATFORM_TIP_PER_CHECKOUT } from '../config/platformTip.js';

/** Shared donation checkout body (Wave direct + Easypay partner). */
export const donationCheckoutBodySchema = z.object({
  campaignSlug: z.string().min(1),
  amount: z.number().int().positive(),
  platformTipAmount: z
    .number()
    .int()
    .min(0)
    .max(MAX_PLATFORM_TIP_PER_CHECKOUT)
    .optional()
    .default(0),
  currency: z.nativeEnum(Currency).default('GMD'),
  donorName: z.string().max(80).optional(),
  message: z.string().max(280).optional(),
  isAnonymous: z.boolean().default(false),
  avatarUrl: z.string().url().optional()
});
