/**
 * Validadores de documentos brasileiros (CPF, CNPJ, telefone, CEP).
 *
 * Uso obrigatório em formulários de cadastro, billing e onboarding.
 * Cobre validação de dígito verificador + formatação padronizada.
 */
import { cpf, cnpj } from "cpf-cnpj-validator";
import { z } from "zod";

/**
 * Valida CPF (com ou sem máscara). Retorna true para CPFs válidos.
 */
export function isValidCPF(value: string): boolean {
  return cpf.isValid(value);
}

/**
 * Valida CNPJ (com ou sem máscara).
 */
export function isValidCNPJ(value: string): boolean {
  return cnpj.isValid(value);
}

/**
 * Formata CPF: 12345678900 -> 123.456.789-00
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return cpf.format(digits);
}

/**
 * Formata CNPJ: 12345678000190 -> 12.345.678/0001-90
 */
export function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return cnpj.format(digits);
}

/**
 * Formata telefone BR: 11987654321 -> (11) 98765-4321
 */
export function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, ddd, p1, p2) => {
      let out = "";
      if (ddd) out += `(${ddd}`;
      if (ddd && ddd.length === 2) out += ") ";
      if (p1) out += p1;
      if (p2) out += `-${p2}`;
      return out;
    });
  }
  return digits.replace(/^(\d{2})(\d{5})(\d{4}).*/, "($1) $2-$3");
}

/**
 * Formata CEP: 01310100 -> 01310-100
 */
export function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/^(\d{5})(\d{0,3}).*/, (_, a, b) => (b ? `${a}-${b}` : a));
}

// Schemas Zod prontos para uso em formulários
export const cpfSchema = z
  .string()
  .trim()
  .refine((val) => isValidCPF(val), { message: "CPF inválido" })
  .transform((val) => val.replace(/\D/g, ""));

export const cnpjSchema = z
  .string()
  .trim()
  .refine((val) => isValidCNPJ(val), { message: "CNPJ inválido" })
  .transform((val) => val.replace(/\D/g, ""));

export const phoneBRSchema = z
  .string()
  .trim()
  .refine((val) => /^\d{10,11}$/.test(val.replace(/\D/g, "")), {
    message: "Telefone inválido (use DDD + número)",
  })
  .transform((val) => val.replace(/\D/g, ""));

export const cepSchema = z
  .string()
  .trim()
  .refine((val) => /^\d{8}$/.test(val.replace(/\D/g, "")), {
    message: "CEP inválido",
  })
  .transform((val) => val.replace(/\D/g, ""));
