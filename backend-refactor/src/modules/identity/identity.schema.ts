import { z } from 'zod';

export const registerRequestSchema = z.strictObject({
  email: z.email(),
  password: z.string(),
});

export const loginRequestSchema = z.strictObject({
  email: z.email(),
  password: z.string(),
});
