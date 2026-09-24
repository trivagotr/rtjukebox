import { z } from 'zod';

export const registerRequestSchema = z.strictObject({
  email: z.email().max(320),
  password: z.string().min(6).max(1024),
  display_name: z.string().trim().min(2).max(100),
});

export const loginRequestSchema = z.strictObject({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export const guestRequestSchema = z.strictObject({
  display_name: z.string().trim().min(2).max(100),
});

export const refreshRequestSchema = z.strictObject({
  refresh_token: z.string().trim().min(1).max(256),
});
