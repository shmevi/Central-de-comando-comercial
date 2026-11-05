import { sha256 } from './utils';

/** O PIN nunca é salvo em texto: guardamos `sha256:<hex>`. É uma barreira de interface, não criptografia forte. */
export const hashPin = async (pin: string) => `sha256:${await sha256(`ccc-pin:${pin}`)}`;

export async function checkPin(input: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith('sha256:')) return (await hashPin(input)) === stored;
  return input === stored; // valor legado (salvo antes do hash)
}
