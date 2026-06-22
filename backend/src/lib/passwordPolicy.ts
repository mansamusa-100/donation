import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_POLICY_MESSAGE = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;

/** For registration, password reset, and new admin accounts. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE);

/** Login accepts any existing password length (legacy accounts may be shorter). */
export const loginPasswordSchema = z.string().min(1, 'Password is required');
