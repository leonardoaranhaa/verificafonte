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
