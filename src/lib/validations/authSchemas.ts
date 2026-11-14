/**
 * Zod validation schemas for authentication routes.
 * Centralised validation = same rules in AuthPage and ResetPasswordPage.
 */
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'E-mail é obrigatório')
  .email('E-mail inválido')
  .max(255, 'E-mail muito longo');

export const loginPasswordSchema = z
  .string()
  .min(1, 'Senha é obrigatória')
  .min(6, 'Mínimo 6 caracteres')
  .max(128, 'Senha muito longa');

export const signUpPasswordSchema = loginPasswordSchema.refine((p) => p.length >= 8, {
  message: 'Mínimo 8 caracteres para nova conta',
});

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const signUpSchema = z.object({
  email: emailSchema,
  password: signUpPasswordSchema,
});

export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: signUpPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirme a nova senha'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetPasswordRequestInput = z.infer<typeof resetPasswordRequestSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
