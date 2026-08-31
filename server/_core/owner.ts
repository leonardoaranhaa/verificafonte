import { ENV } from "./env";
import { normalizeEmail } from "./password";

const EMAIL_PREFIX = "email:";

/**
 * OWNER_OPEN_ID é o único bootstrap de administrador: sem uma conta admin
 * ninguém consegue conceder acesso editorial a ninguém, e o produto fica
 * inutilizável em silêncio.
 *
 * O valor é escrito como "email:voce@dominio.com", que é exatamente o openId
 * de quem entra por senha. Mas o mesmo dono entrando pelo Google recebe o
 * openId "google:<sub>", que nunca casaria com aquele valor — o login
 * funcionava, o acesso não vinha, e nada na tela explicava por quê.
 *
 * Por isso o dono também é reconhecido pelo e-mail. Só quando o provedor
 * confirma que o e-mail é verificado: e-mail não verificado é texto livre, e
 * aceitá-lo deixaria qualquer conta se declarar dona da instalação.
 */
export function isOwnerAccount(account: { openId: string; email?: string | null; emailVerified?: boolean }): boolean {
  const owner = ENV.ownerOpenId.trim();
  if (!owner) return false;
  if (account.openId === owner) return true;
  if (!owner.toLowerCase().startsWith(EMAIL_PREFIX)) return false;
  if (!account.emailVerified || !account.email) return false;
  return normalizeEmail(account.email) === normalizeEmail(owner.slice(EMAIL_PREFIX.length));
}
