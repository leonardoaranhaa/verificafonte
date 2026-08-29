import { useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ArrowUpRight, Fingerprint, LogIn } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const utils = trpc.useUtils();

  async function onSuccess() {
    await utils.auth.me.invalidate();
    setLocation("/painel");
  }

  const login = trpc.auth.login.useMutation({ onSuccess, onError: error => toast.error(error.message) });
  const register = trpc.auth.register.useMutation({ onSuccess, onError: error => toast.error(error.message) });

  const pending = login.isPending || register.isPending;

  function submit() {
    if (mode === "login") {
      login.mutate({ email, password });
    } else {
      register.mutate({ email, password, name: name.trim() || undefined });
    }
  }

  return (
    <div className="auth-gate">
      <Link href="/" className="brand" aria-label="VerificaFonte — início">
        <span className="brand-mark">
          <Fingerprint size={19} strokeWidth={2.5} />
        </span>
        <span>
          verifica<span>fonte</span>
        </span>
      </Link>
      <div className="auth-card">
        <div className="auth-icon">
          <LogIn size={22} />
        </div>
        <div className="eyebrow">{mode === "login" ? "Área editorial" : "Nova conta"}</div>
        <h1>{mode === "login" ? "Entre para abrir a bancada." : "Crie seu acesso editorial."}</h1>
        <p>{mode === "login" ? "Use o e-mail e a senha da sua conta editorial." : "Casos, evidências e revisões ficam vinculados à sua conta."}</p>
        <form
          className="auth-form"
          onSubmit={event => {
            event.preventDefault();
            submit();
          }}
        >
          {mode === "register" && (
            <label>
              Nome
              <input value={name} onChange={event => setName(event.target.value)} placeholder="Seu nome" />
            </label>
          )}
          <label>
            E-mail
            <input type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@redacao.com" />
          </label>
          <label>
            Senha
            <input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" />
          </label>
          <button className="button button-dark" type="submit" disabled={pending}>
            {pending ? "Enviando…" : mode === "login" ? "Entrar" : "Criar conta"}
            <ArrowUpRight size={16} />
          </button>
        </form>
        <div className="auth-divider"><span>ou</span></div>
        <a className="button button-outline auth-google" href="/api/oauth/google/start">
          <GoogleIcon /> Continuar com Google
        </a>
        <button className="text-action auth-switch" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Não tem conta? Criar uma" : "Já tem conta? Entrar"}
        </button>
        <Link href="/" className="back-link">
          <ArrowLeft size={14} /> Voltar para a página pública
        </Link>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}
