import { Link, useLocation } from "wouter";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export const roleLabels = { user: "Sem acesso editorial", editor: "Editor", admin: "Administrador" } as const;

/**
 * Estado da sessão no cabeçalho público.
 *
 * Antes o site não tinha nenhum sinal de autenticação: nem botão de entrar,
 * nem indicação de quem estava logado, nem saída. Quem chegava pela home só
 * descobria o caminho para /entrar clicando em "Nova alegação" e lendo um
 * toast que some em poucos segundos.
 */
export default function AuthActions({ onNavigate }: { onNavigate?: () => void }) {
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();

  async function signOut() {
    onNavigate?.();
    try {
      await logout();
      toast.success("Sessão encerrada.");
    } catch {
      toast.error("Não foi possível encerrar a sessão. Tente de novo.");
      return;
    }
    setLocation("/");
  }

  // Enquanto auth.me não respondeu, mostrar "Entrar" faria o botão piscar e
  // virar outra coisa para quem já está logado.
  if (loading) return <span className="auth-actions-placeholder" aria-hidden="true" />;

  if (!user) {
    return (
      <Link href="/entrar" className="button button-small button-ghost-light" onClick={onNavigate}>
        <LogIn size={15} /> Entrar
      </Link>
    );
  }

  return (
    <div className="auth-actions">
      <Link href="/painel" className="header-user" onClick={onNavigate}>
        <span className="header-user-avatar"><UserRound size={14} /></span>
        <span className="header-user-text">
          <strong>{user.name || user.email || "Sua conta"}</strong>
          <small>{roleLabels[user.role]}</small>
        </span>
      </Link>
      <button type="button" className="header-link" onClick={signOut}>
        <LogOut size={14} /> Sair
      </button>
    </div>
  );
}
