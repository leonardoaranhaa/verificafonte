import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertCircle, ArrowLeft, ArrowUpRight, Bot, Check, ChevronRight, Clock3, FileCheck2, FilePlus2, Fingerprint, GitCompareArrows, Layers3, Link2, LogIn, LogOut, Menu, Plus, Send, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const statusLabels = { em_apuracao: "Em apuração", confirmado: "Confirmado por fontes", divergente: "Divergente / contestável", insuficiente: "Sem evidência suficiente" } as const;
const workflowLabels = { rascunho: "Rascunho", em_revisao: "Em revisão", publicado: "Publicado", arquivado: "Arquivado" } as const;
const statusTone = { em_apuracao: "status-research", confirmado: "status-confirmed", divergente: "status-divergent", insuficiente: "status-insufficient" } as const;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Encerrar sessão era a única operação de autenticação sem nenhuma porta na
 * interface: existia no servidor e no hook, e não havia botão em lugar
 * nenhum. Quem entrasse com a conta errada ficava preso nela.
 */
async function signOut(logout: () => Promise<void>, setLocation: (path: string) => void) {
  try {
    await logout();
    toast.success("Sessão encerrada.");
  } catch {
    toast.error("Não foi possível encerrar a sessão. Tente de novo.");
    return;
  }
  setLocation("/");
}

/**
 * Cadastro aberto significa que a conta existe e mesmo assim não abre a
 * bancada. Sem dizer o que falta e sem oferecer troca de conta, esta tela era
 * um beco: o usuário lia "peça a um administrador" e não tinha o que fazer.
 */
function PendingAccessGate({ email, onSignOut }: { email: string; onSignOut: () => Promise<void> }) {
  const [, setLocation] = useLocation();
  return <div className="auth-gate">
    <Link href="/" className="brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>verifica<span>fonte</span></span></Link>
    <div className="auth-card">
      <div className="auth-icon"><ShieldCheck size={22} /></div>
      <div className="eyebrow">Login feito — acesso editorial pendente</div>
      <h1>Sua conta existe, mas ainda não é da redação.</h1>
      <p>Não é erro de senha: você está autenticado. A bancada guarda apurações em andamento, por isso o acesso é concedido conta a conta por um administrador.</p>
      <div className="access-identity">
        <span>Conta conectada</span>
        <strong>{email}</strong>
        <small>É este endereço que o administrador procura em Equipe e acessos para promover você a Editor.</small>
      </div>
      <Link href="/" className="button button-dark">Ver o acervo público <ArrowUpRight size={16} /></Link>
      <button type="button" className="text-action auth-switch" onClick={() => { void signOut(onSignOut, setLocation); }}>Sair e entrar com outra conta</button>
      <Link href="/" className="back-link"><ArrowLeft size={14} /> Voltar para a página pública</Link>
    </div>
  </div>;
}

function readCaseId() {
  if (typeof window === "undefined") return 0;
  return Number(new URLSearchParams(window.location.search).get("caseId")) || 0;
}

export default function Panel() {
  const { user, loading, logout } = useAuth();
  const [, setLocation] = useLocation();
  const caseId = readCaseId();
  const [activeTab, setActiveTab] = useState<"workspace" | "review" | "orchestration" | "equipe">("workspace");
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [showMomentForm, setShowMomentForm] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: cases, isLoading: casesLoading } = trpc.cases.all.useQuery(undefined, { enabled: Boolean(user) });
  const { data: bundle, isLoading: bundleLoading } = trpc.cases.workspace.useQuery({ caseId }, { enabled: Boolean(user && caseId) });
  const updateWorkflow = trpc.cases.updateWorkflow.useMutation({ onSuccess: async () => { await utils.cases.invalidate(); toast.success("Fluxo editorial atualizado"); }, onError: e => toast.error(e.message) });
  const addEvidence = trpc.evidences.add.useMutation({ onSuccess: async () => { await utils.cases.workspace.invalidate({ caseId }); await utils.cases.stats.invalidate(); setShowEvidenceForm(false); toast.success("Evidência registrada"); }, onError: e => toast.error(e.message) });
  const submitReview = trpc.reviews.submit.useMutation({ onSuccess: async () => { await utils.cases.workspace.invalidate({ caseId }); setShowReviewForm(false); toast.success("Revisão registrada no histórico"); }, onError: e => toast.error(e.message) });
  const generateAnalysis = trpc.analysis.generate.useMutation({ onSuccess: async () => { await utils.cases.workspace.invalidate({ caseId }); toast.success("Briefing de apoio gerado; o veredito continua humano"); }, onError: e => toast.error(e.message) });

  const selectedCase = bundle?.caseRecord;
  const evidenceCount = bundle?.evidenceRows.length ?? 0;
  const lastAnalysis = bundle?.analysisRows[0];
  const sourceMix = useMemo(() => {
    const values = bundle?.evidenceRows ?? [];
    return { official: values.filter(item => item.sourceType === "oficial").length, journalistic: values.filter(item => item.sourceType === "reportagem").length, other: values.filter(item => item.sourceType !== "oficial" && item.sourceType !== "reportagem").length };
  }, [bundle?.evidenceRows]);

  if (loading) return <div className="panel-loading"><div className="loading-orbit"></div><p>Carregando espaço editorial…</p></div>;
  if (!user) return <div className="auth-gate"><Link href="/" className="brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>verifica<span>fonte</span></span></Link><div className="auth-card"><div className="auth-icon"><LogIn size={22} /></div><div className="eyebrow">Área editorial</div><h1>Entre para abrir a bancada de checagem.</h1><p>O painel reúne rascunhos, evidências e revisões. O conteúdo só aparece no acervo depois de uma decisão editorial registrada.</p><Link href="/entrar" className="button button-dark">Entrar com minha conta <ArrowUpRight size={16} /></Link><Link href="/entrar" className="text-action auth-switch">Ainda não tem conta? Criar uma</Link><Link href="/" className="back-link"><ArrowLeft size={14} /> Voltar para a página pública</Link></div></div>;
  // O cadastro é aberto: estar logado não dá acesso à bancada.
  if (user.role !== "editor" && user.role !== "admin") return <PendingAccessGate email={user.email || user.openId} onSignOut={logout} />;

  return <div className="panel-shell">
    <aside id="panel-nav" className={`panel-sidebar ${navOpen ? "nav-open" : ""}`}>
      <div className="panel-brand"><Link href="/" className="brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>verifica<span>fonte</span></span></Link><span className="panel-version">EDITORIAL / 0.1</span><button type="button" className="mobile-panel-menu" aria-label={navOpen ? "Fechar navegação" : "Abrir navegação"} aria-expanded={navOpen} aria-controls="panel-nav" onClick={() => setNavOpen(open => !open)}>{navOpen ? <X size={18} /> : <Menu size={18} />}</button></div>
      <div className="sidebar-label">Bancada</div>
      <button className={`sidebar-item ${activeTab === "workspace" ? "active" : ""}`} onClick={() => { setActiveTab("workspace"); setNavOpen(false); }}><Layers3 size={17} /><span>Casos</span><span className="sidebar-count">{cases?.length ?? 0}</span></button>
      <button className={`sidebar-item ${activeTab === "review" ? "active" : ""}`} onClick={() => { setActiveTab("review"); setNavOpen(false); }}><FileCheck2 size={17} /><span>Revisão editorial</span></button>
      <button className={`sidebar-item ${activeTab === "orchestration" ? "active" : ""}`} onClick={() => { setActiveTab("orchestration"); setNavOpen(false); }}><Bot size={17} /><span>Orquestração</span><span className="live-dot"></span></button>
      {user.role === "admin" && <button className={`sidebar-item ${activeTab === "equipe" ? "active" : ""}`} onClick={() => { setActiveTab("equipe"); setNavOpen(false); }}><UserRound size={17} /><span>Equipe</span></button>}
      <div className="sidebar-bottom"><div className="sidebar-rule"></div><Link href="/" className="sidebar-item"><ArrowLeft size={17} /><span>Voltar ao público</span></Link><div className="user-chip"><span className="user-avatar"><UserRound size={15} /></span><span><strong>{user.name || "Editor"}</strong><small>{user.role === "admin" ? "Administrador" : user.role === "editor" ? "Editor" : "Sem acesso editorial"}</small></span><button type="button" className="user-chip-signout" onClick={() => { void signOut(logout, setLocation); }} aria-label="Sair da conta" title="Sair da conta"><LogOut size={15} /></button></div></div>
    </aside>
    <main className="panel-main">
      <div className="panel-topbar"><div><span className="panel-kicker">ESPAÇO DE TRABALHO</span><h1>{activeTab === "workspace" ? "Casos de verificação" : activeTab === "review" ? "Revisão editorial" : activeTab === "equipe" ? "Equipe e acessos" : "Orquestração"}</h1></div><button className="button button-accent button-small" onClick={() => setLocation("/?novo=1")}><Plus size={15} /> Nova alegação</button></div>
      <IntegrationsStrip />
      {activeTab === "equipe" ? <TeamAccess currentUserId={user.id} /> : activeTab === "orchestration" ? <Orchestration /> : activeTab === "review" ? <ReviewQueue cases={cases ?? []} onOpen={id => setLocation(`/painel?caseId=${id}`)} /> : <div className="workspace-layout">
        <section className="case-list-pane"><div className="pane-title"><div><span className="panel-kicker">SEUS CASOS</span><h2>Fila de verificação</h2></div><span className="case-total">{cases?.length ?? 0}</span></div><div className="case-list">{casesLoading ? <div className="list-placeholder">Buscando casos…</div> : cases?.length ? cases.map(item => <button className={`case-list-item ${item.id === caseId ? "selected" : ""}`} key={item.id} onClick={() => setLocation(`/painel?caseId=${item.id}`)}><div className="case-list-meta"><span className={`status-dot ${statusTone[item.status]}`}></span><span>{workflowLabels[item.workflowStatus]}</span><span>·</span><span>{formatDate(item.updatedAt)}</span></div><strong>{item.claimText}</strong><ChevronRight size={16} /></button>) : <div className="list-empty"><div className="empty-icon"><FilePlus2 size={17} /></div><p>Seus casos aparecem aqui.</p><button className="button button-dark button-small" onClick={() => setLocation("/")}>Criar primeiro caso</button></div>}</div></section>
        <section className="case-workspace">{!caseId ? <WorkspaceWelcome /> : bundleLoading ? <div className="workspace-empty"><div className="loading-orbit"></div><p>Carregando caso…</p></div> : selectedCase ? <><div className="workspace-heading"><div><div className="breadcrumb"><span>Casos</span><ChevronRight size={13} /><span>{selectedCase.workflowStatus === "publicado" ? "Público" : "Em trabalho"}</span></div><h2>{selectedCase.claimText}</h2>{selectedCase.claimUrl && <a href={selectedCase.claimUrl} target="_blank" rel="noreferrer" className="origin-link"><Link2 size={14} /> Ver publicação original <ArrowUpRight size={13} /></a>}</div><span className={`status-pill ${statusTone[selectedCase.status]}`}>{statusLabels[selectedCase.status]}</span></div><div className="case-subnav"><button className="subnav-active">Visão geral</button><span>Atualizado em {formatDate(selectedCase.updatedAt)}</span><span className="workflow-badge">{workflowLabels[selectedCase.workflowStatus]}</span></div><div className="workspace-grid"><div className="workspace-primary"><EvidencePanel evidence={bundle.evidenceRows} onAdd={() => setShowEvidenceForm(true)} sourceMix={sourceMix} /><VerificationPanel caseId={caseId} /><MomentsPanel caseId={caseId} moments={bundle.momentRows} onAdd={() => setShowMomentForm(true)} /><AnalysisPanel analysis={lastAnalysis} isPending={generateAnalysis.isPending} disabled={!evidenceCount} onGenerate={() => generateAnalysis.mutate({ caseId })} /></div><aside className="workspace-aside"><EditorialPanel selectedCase={selectedCase} reviews={bundle.reviewRows} onUpdate={(payload) => updateWorkflow.mutate({ caseId, ...payload })} onReview={() => setShowReviewForm(true)} /><AgentPanel caseId={caseId} /></aside></div></> : <div className="workspace-empty"><AlertCircle size={20} /><p>Não foi possível localizar este caso.</p></div>}</section>
      </div>}
    </main>
    {showEvidenceForm && <EvidenceForm onClose={() => setShowEvidenceForm(false)} isPending={addEvidence.isPending} onSubmit={values => addEvidence.mutate({ caseId, ...values })} />}
    {showReviewForm && <ReviewForm onClose={() => setShowReviewForm(false)} isPending={submitReview.isPending} onSubmit={values => submitReview.mutate({ caseId, ...values })} />}
    {showMomentForm && <MomentForm caseId={caseId} originals={(bundle?.momentRows ?? []).filter(moment => moment.role === "original")} onClose={() => setShowMomentForm(false)} />}
  </div>;
}

/**
 * Mostra o que está pronto antes de o editor começar. Sem isso, a falta de uma
 * chave só aparecia como erro no meio do fluxo — e podia passar por falha de rede.
 */
function IntegrationsStrip() {
  const { data } = trpc.system.integrations.useQuery();
  if (!data) return null;
  const missing = data.filter(item => !item.ready);
  if (!missing.length) return null;
  return <div className="integrations-strip">
    <AlertCircle size={14} />
    <div>
      <strong>{missing.length === 1 ? "Uma integração não está configurada" : `${missing.length} integrações não estão configuradas`}</strong>
      {missing.map(item => <span key={item.key}><b>{item.label}</b> — {item.enables} {item.requires && <code>{item.requires}</code>}</span>)}
    </div>
  </div>;
}

const roleLabels = { user: "Sem acesso editorial", editor: "Editor", admin: "Administrador" } as const;

/**
 * Gestão de acesso. O cadastro é aberto, então é aqui que uma conta vira parte
 * da redação — sem esta tela ninguém consegue liberar o primeiro editor.
 */
function TeamAccess({ currentUserId }: { currentUserId: number }) {
  const utils = trpc.useUtils();
  const { data: users, isLoading, error } = trpc.admin.users.useQuery();
  const setRole = trpc.admin.setRole.useMutation({
    onSuccess: async updated => {
      await utils.admin.users.invalidate();
      toast.success(`${updated.name || updated.email || "Conta"} agora é ${roleLabels[updated.role]}`);
    },
    onError: e => toast.error(e.message),
  });

  return <div className="review-queue">
    <div className="queue-intro">
      <div className="eyebrow">Quem pode apurar</div>
      <h2>O acesso à bancada é concedido pessoa a pessoa.</h2>
      <p>Qualquer um pode criar uma conta, mas uma conta nova não lê nem publica nada. Promova a <strong>Editor</strong> quem é da redação; <strong>Administrador</strong> também gerencia esta lista.</p>
    </div>
    <div className="review-queue-card">
      <div className="card-heading"><div><span className="panel-kicker">CONTAS</span><h3>{users?.length ?? 0} conta{users?.length === 1 ? "" : "s"} registrada{users?.length === 1 ? "" : "s"}</h3></div><UserRound size={20} /></div>
      {isLoading ? <div className="list-placeholder">Carregando contas…</div>
        : error ? <div className="queue-empty"><AlertCircle size={18} /><p>{error.message}</p></div>
        : users?.length ? <div className="registry-list">{users.map(item => <div className="registry-item" key={item.id}>
            <span className={`status-dot ${item.role === "user" ? "status-insufficient" : "status-confirmed"}`}></span>
            <span><strong>{item.name || item.email || item.openId}</strong><small>{item.email || item.openId} · {roleLabels[item.role]}</small></span>
            {item.id === currentUserId
              ? <em>você</em>
              : <select value={item.role} disabled={setRole.isPending} onChange={e => setRole.mutate({ userId: item.id, role: e.target.value as "user" | "editor" | "admin" })}>
                  <option value="user">Sem acesso</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Administrador</option>
                </select>}
          </div>)}</div>
        : <div className="queue-empty"><Check size={18} /><p>Nenhuma conta registrada ainda.</p></div>}
    </div>
  </div>;
}

function WorkspaceWelcome() { return <div className="workspace-empty welcome-empty"><div className="welcome-mark"><GitCompareArrows size={25} /></div><div className="eyebrow">Bancada de checagem</div><h2>Escolha um caso para começar.</h2><p>Registre fontes, compare relações e prepare um briefing para revisão. A publicação só acontece quando uma pessoa decide.</p><div className="welcome-steps"><span><b>01</b> Alegação</span><span><b>02</b> Evidências</span><span><b>03</b> Revisão</span></div></div>; }

function EvidencePanel({ evidence, onAdd, sourceMix }: { evidence: Array<{ id: number; title: string; url: string; sourceName: string; sourceType: string; sourceDate: Date | null; accessedAt: Date; context: string; excerpt: string | null; relation: string }>; onAdd: () => void; sourceMix: { official: number; journalistic: number; other: number } }) { return <div className="workspace-card evidence-panel"><div className="card-heading"><div><span className="panel-kicker">TRILHA DE EVIDÊNCIAS</span><h3>Fontes registradas <span>{evidence.length}</span></h3></div><button className="button button-outline button-small" onClick={onAdd}><Plus size={15} /> Adicionar</button></div>{evidence.length ? <><div className="source-mix"><span><i className="mix-official"></i> Oficiais <b>{sourceMix.official}</b></span><span><i className="mix-journalistic"></i> Reportagens <b>{sourceMix.journalistic}</b></span><span><i className="mix-other"></i> Outras <b>{sourceMix.other}</b></span></div><div className="evidence-list">{evidence.map(item => <div className="evidence-row" key={item.id}><div className="evidence-row-icon"><Link2 size={16} /></div><div className="evidence-row-content"><div className="evidence-row-top"><span className="source-type-label">{item.sourceType}</span><span>{item.relation}</span></div><h4>{item.title}</h4><p>{item.sourceName} · consultada em {new Date(item.accessedAt).toLocaleDateString("pt-BR")}</p><div className="evidence-context">{item.context}</div><a href={item.url} target="_blank" rel="noreferrer">Abrir fonte <ArrowUpRight size={13} /></a></div></div>)}</div></> : <div className="card-empty"><div className="empty-icon"><Link2 size={16} /></div><p>Adicione uma primeira fonte primária ou reportagem para abrir a comparação.</p><button className="text-action" onClick={onAdd}>Registrar evidência <ArrowUpRight size={14} /></button></div>}</div>; }


const outcomeLabels = { confere: "Confere", confere_arredondado: "Confere (aproximado)", diverge: "Diverge", nao_verificavel: "Não verificável", sem_afirmacoes: "Sem números a conferir" } as const;
const outcomeTone = { confere: "status-confirmed", confere_arredondado: "status-divergent", diverge: "status-insufficient", nao_verificavel: "status-research", sem_afirmacoes: "status-research" } as const;

type VerificationResult = {
  checks: Array<{ assertion: { indicator: string; value: number; unit?: string; period?: string; excerpt: string }; outcome: keyof typeof outcomeLabels; official?: { value: number; unit?: string; period: string; sourceName: string; sourceUrl: string }; explanation: string }>;
  corroborations: Array<{ indicator: string; sources: string[]; agree: boolean }>;
  summary: { overall: keyof typeof outcomeLabels; counts: Record<string, number>; total: number };
  evidence: unknown[];
  editorialNote: string;
};

/**
 * Confere os números da alegação contra a fonte oficial. É a única parte do
 * fluxo que chega a um veredito sozinha — porque é aritmética reproduzível,
 * não leitura editorial. O status do caso continua sendo decisão do editor.
 */
function VerificationPanel({ caseId }: { caseId: number }) {
  const utils = trpc.useUtils();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const check = trpc.verification.checkCase.useMutation({
    onSuccess: async data => {
      setResult(data as VerificationResult);
      await utils.cases.workspace.invalidate({ caseId });
      toast.success(data.summary.total ? `${data.summary.total} afirmação(ões) conferida(s)` : "Nenhum número desta alegação está no catálogo");
    },
    onError: e => toast.error(e.message),
  });

  return <div className="workspace-card verification-panel">
    <div className="card-heading">
      <div><span className="panel-kicker">MÓDULO · DADOS OFICIAIS</span><h3>Números contra a série oficial</h3></div>
      {result && <span className={`status-pill ${outcomeTone[result.summary.overall]}`}>{outcomeLabels[result.summary.overall]}</span>}
    </div>
    <div className="analysis-disclaimer"><ShieldCheck size={15} /><span>Só para alegações com indicador catalogado (IPCA, Selic, câmbio, desocupação, cota etc.). Comparação aritmética — não define o status do caso nem cobre fala/contexto de rede.</span></div>

    {result ? <div className="verification-results">
      {result.checks.map((item, index) => <div className={`verification-item outcome-${item.outcome}`} key={index}>
        <div className="verification-top"><span className="source-type-label">{item.assertion.indicator}</span><span className={`status-pill ${outcomeTone[item.outcome]}`}>{outcomeLabels[item.outcome]}</span></div>
        <blockquote>“{item.assertion.excerpt}”</blockquote>
        {item.official && <div className="verification-numbers">
          <span><small>Afirmado</small><strong>{item.assertion.value}{item.assertion.unit ? ` ${item.assertion.unit}` : ""}</strong></span>
          <span><small>Oficial</small><strong>{item.official.value}{item.official.unit ? ` ${item.official.unit}` : ""}</strong></span>
          <span><small>Período</small><strong>{item.official.period}</strong></span>
        </div>}
        <p>{item.explanation}</p>
        {item.official && <a href={item.official.sourceUrl} target="_blank" rel="noreferrer">Abrir a fonte <ArrowUpRight size={13} /></a>}
      </div>)}

      {result.corroborations.map(c => <p className={`corroboration ${c.agree ? "" : "conflict"}`} key={c.indicator}>
        {c.agree ? "✓" : "⚠"} {c.sources.length} fontes independentes {c.agree ? "concordam" : "DIVERGEM entre si"} sobre {c.indicator}: {c.sources.join(" · ")}
      </p>)}

      <p className="verification-note">{result.editorialNote}</p>
      <button className="button button-outline button-small" disabled={check.isPending} onClick={() => check.mutate({ caseId, registerEvidence: true })}>Registrar conferência como evidência <ArrowUpRight size={14} /></button>
    </div> : <div className="analysis-empty">
      <Sparkles size={19} />
      <p>Quando a postagem cita um número oficial, extrai o valor, consulta a série e diz se bate. Para print, corte ou boato sem número, use momentos e evidências.</p>
      <button className="button button-dark button-small" disabled={check.isPending} onClick={() => check.mutate({ caseId, registerEvidence: false })}>{check.isPending ? "Conferindo…" : "Conferir números"}<ArrowUpRight size={14} /></button>
    </div>}
  </div>;
}

function AnalysisPanel({ analysis, isPending, disabled, onGenerate }: { analysis: { extractedClaim: string; evidenceSummary: string; divergences: string; reviewBrief: string; modelLabel: string | null; createdAt: Date } | undefined; isPending: boolean; disabled: boolean; onGenerate: () => void }) { return <div className="workspace-card analysis-panel"><div className="card-heading"><div><span className="panel-kicker">ASSISTÊNCIA DE PESQUISA</span><h3>Briefing para revisão</h3></div><span className="ai-badge"><Sparkles size={13} /> IA + humano</span></div><div className="analysis-disclaimer"><ShieldCheck size={15} /><span>O modelo organiza o material, mas não escolhe o status nem publica o caso.</span></div>{analysis ? <div className="analysis-content"><div><span>Leitura da alegação</span><p>{analysis.extractedClaim}</p></div><div><span>O que as evidências indicam</span><p>{analysis.evidenceSummary}</p></div><div><span>Pontos de divergência</span><p>{analysis.divergences}</p></div><div className="brief-callout"><span>Nota para a revisão humana</span><p>{analysis.reviewBrief}</p></div><small>Gerado com {analysis.modelLabel || "modelo disponível"} · {new Date(analysis.createdAt).toLocaleString("pt-BR")}</small></div> : <div className="analysis-empty"><Bot size={19} /><p>{disabled ? "Adicione evidências antes de gerar um briefing." : "Gere um resumo estruturado para orientar a leitura editorial."}</p><button className="button button-dark button-small" disabled={disabled || isPending} onClick={onGenerate}>{isPending ? "Organizando…" : "Gerar briefing"}<ArrowUpRight size={14} /></button></div>}</div>; }

function EditorialPanel({ selectedCase, reviews, onUpdate, onReview }: { selectedCase: { workflowStatus: "rascunho" | "em_revisao" | "publicado" | "arquivado"; status: "em_apuracao" | "confirmado" | "divergente" | "insuficiente"; methodology: string | null; editorialNote: string | null }; reviews: Array<{ id: number; decision: string; note: string; createdAt: Date }>; onUpdate: (payload: { workflowStatus: "rascunho" | "em_revisao" | "publicado" | "arquivado"; status?: "em_apuracao" | "confirmado" | "divergente" | "insuficiente"; methodology?: string; editorialNote?: string }) => void; onReview: () => void }) { const [status, setStatus] = useState(selectedCase.status); const [methodology, setMethodology] = useState(selectedCase.methodology || ""); const [editorialNote, setEditorialNote] = useState(selectedCase.editorialNote || ""); const [workflowStatus, setWorkflowStatus] = useState(selectedCase.workflowStatus); const canSave = workflowStatus !== "publicado" || (methodology.trim().length > 0 && editorialNote.trim().length > 0); return <div className="workspace-card editorial-panel"><div className="card-heading"><div><span className="panel-kicker">DECISÃO HUMANA</span><h3>Controle editorial</h3></div><LockIcon /></div><label>Status de trabalho<select value={status} onChange={e => setStatus(e.target.value as typeof status)}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Etapa do fluxo<select value={workflowStatus} onChange={e => setWorkflowStatus(e.target.value as typeof workflowStatus)}>{Object.entries(workflowLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Metodologia<textarea rows={4} value={methodology} onChange={e => setMethodology(e.target.value)} placeholder="Como as fontes foram comparadas? O que ficou fora do escopo?" /></label><label>Nota editorial pública<textarea rows={4} value={editorialNote} onChange={e => setEditorialNote(e.target.value)} placeholder="Explique o resultado em linguagem clara." /></label><button className="button button-dark full-width" disabled={!canSave} onClick={() => onUpdate({ status, workflowStatus, methodology, editorialNote })}>Salvar decisão <Check size={15} /></button><button className="button button-outline full-width" onClick={onReview}><FileCheck2 size={15} /> Registrar revisão</button>{!canSave && <p className="publish-hint"><AlertCircle size={13} /> Preencha a metodologia e a justificativa pública para publicar.</p>}{workflowStatus !== "publicado" && canSave && <p className="publish-hint"><Clock3 size={13} /> Publicar só depois de registrar uma revisão aprovada.</p>}{reviews.length > 0 && <div className="review-history"><span className="panel-kicker">HISTÓRICO</span>{reviews.slice(0, 3).map(review => <div className="review-history-item" key={review.id}><span className={`review-decision ${review.decision === "aprovar" ? "approved" : ""}`}>{review.decision.replace("_", " ")}</span><span>{new Date(review.createdAt).toLocaleDateString("pt-BR")}</span></div>)}</div>}</div>; }

function LockIcon() { return <span className="lock-icon"><ShieldCheck size={15} /></span>; }

const momentRoleLabels = { original: "Prova original", viral_distorcido: "Versão viral", contextual: "Contexto" } as const;

type MomentRow = {
  id: number;
  role: "original" | "viral_distorcido" | "contextual";
  mediaKind: string;
  title: string;
  url: string;
  sourceName: string;
  timestampStartSec: number | null;
  timestampEndSec: number | null;
  quoteAtMoment: string | null;
  distortionDescription: string | null;
  linkedOriginalMomentId: number | null;
};

/** Instante da fala em formato legível (1h02m03s). */
function formatTimecode(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h > 0 ? `${h}h` : "", h > 0 || m > 0 ? `${String(m).padStart(h > 0 ? 2 : 1, "0")}m` : "", `${String(sec).padStart(2, "0")}s`].join("");
}

/** Aceita "1:05:30", "12:34" ou segundos puros; devolve segundos. */
function parseTimecodeInput(raw: string): number | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  const parts = value.split(":").map(part => Number(part.trim()));
  if (parts.some(part => !Number.isFinite(part) || part < 0)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

function MomentsPanel({ moments, onAdd }: { caseId: number; moments: MomentRow[]; onAdd: () => void }) {
  const originals = moments.filter(moment => moment.role === "original");
  const virals = moments.filter(moment => moment.role === "viral_distorcido");
  return <div className="workspace-card moments-panel">
    <div className="card-heading"><div><span className="panel-kicker">PROVA ORIGINAL × DISTORÇÃO</span><h3>Momentos indexados <span>{moments.length}</span></h3></div><button className="button button-outline button-small" onClick={onAdd}><Plus size={15} /> Indexar momento</button></div>
    <p className="field-hint">Use para print, corte de TikTok/Reels, post ou vídeo integral: ancore o instante original e descreva o que a versão viral alterou. É o núcleo da apuração em rede — não só de indicadores econômicos.</p>
    {moments.length ? <>
      <div className="moment-tally"><span><i className="mix-official"></i> Prova original <b>{originals.length}</b></span><span><i className="mix-other"></i> Versão viral <b>{virals.length}</b></span></div>
      <div className="evidence-list">{moments.map(moment => <div className="evidence-row" key={moment.id}>
        <div className="evidence-row-icon"><GitCompareArrows size={16} /></div>
        <div className="evidence-row-content">
          <div className="evidence-row-top"><span className="source-type-label">{momentRoleLabels[moment.role]}</span><span>{moment.mediaKind}</span>{moment.timestampStartSec != null && <span className="moment-timecode">{formatTimecode(moment.timestampStartSec)}{moment.timestampEndSec != null && <>–{formatTimecode(moment.timestampEndSec)}</>}</span>}</div>
          <h4>{moment.title}</h4>
          <p>{moment.sourceName}{moment.linkedOriginalMomentId != null && <> · vinculado ao momento #{moment.linkedOriginalMomentId}</>}</p>
          {moment.quoteAtMoment && <div className="evidence-context">“{moment.quoteAtMoment}”</div>}
          {moment.distortionDescription && <p className="moment-distortion"><strong>Distorção:</strong> {moment.distortionDescription}</p>}
          <a href={moment.url} target="_blank" rel="noreferrer">Abrir fonte <ArrowUpRight size={13} /></a>
        </div>
      </div>)}</div>
    </> : <div className="card-empty"><div className="empty-icon"><GitCompareArrows size={16} /></div><p>Indexe a prova original (com o instante da fala) e a versão que circulou. O leitor vê os dois lados na página pública.</p><button className="text-action" onClick={onAdd}>Indexar primeiro momento <ArrowUpRight size={14} /></button></div>}
  </div>;
}

function MomentForm({ caseId, originals, onClose }: { caseId: number; originals: MomentRow[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ role: "original" as MomentRow["role"], mediaKind: "video", title: "", url: "", sourceName: "", startAt: "", endAt: "", eventDate: "", quoteAtMoment: "", distortionDescription: "", linkedOriginalMomentId: "", mirrorAsEvidence: true });
  const update = (key: string, value: string | boolean) => setForm(current => ({ ...current, [key]: value }));
  const register = trpc.moments.register.useMutation({
    onSuccess: async result => {
      await utils.cases.workspace.invalidate({ caseId });
      onClose();
      toast.success(result.editorialNote);
    },
    onError: e => toast.error(e.message),
  });
  const isViral = form.role === "viral_distorcido";
  const canSave = form.title.trim().length >= 4 && form.url.trim().length > 0 && form.sourceName.trim().length >= 2 && (!isViral || form.distortionDescription.trim().length > 0);

  return <Modal title="Indexar momento" eyebrow="Prova original × distorção" onClose={onClose}>
    <p className="modal-lede">Ancore o instante em que a fala ou o ato aconteceu e, na versão viral, descreva o que foi cortado ou omitido.</p>
    <div className="form-grid">
      <label>Papel deste momento<select value={form.role} onChange={e => update("role", e.target.value)}><option value="original">Prova original</option><option value="viral_distorcido">Versão viral / distorcida</option><option value="contextual">Contexto</option></select></label>
      <label>Tipo de mídia<select value={form.mediaKind} onChange={e => update("mediaKind", e.target.value)}><option value="video">Vídeo</option><option value="audio">Áudio</option><option value="post">Post</option><option value="documento">Documento</option><option value="outro">Outro</option></select></label>
      <label className="full-span">Título<input value={form.title} onChange={e => update("title", e.target.value)} placeholder="Ex.: Entrevista completa na comissão, 12/03" /></label>
      <label>URL<input type="url" value={form.url} onChange={e => update("url", e.target.value)} placeholder="https://..." /></label>
      <label>Origem / veículo<input value={form.sourceName} onChange={e => update("sourceName", e.target.value)} placeholder="Canal, emissora ou plataforma" /></label>
      <label>Início do trecho <span className="optional">mm:ss</span><input value={form.startAt} onChange={e => update("startAt", e.target.value)} placeholder="12:34" /></label>
      <label>Fim do trecho <span className="optional">opcional</span><input value={form.endAt} onChange={e => update("endAt", e.target.value)} placeholder="13:02" /></label>
      <label>Data do evento <span className="optional">opcional</span><input type="date" value={form.eventDate} onChange={e => update("eventDate", e.target.value)} /></label>
      {isViral && originals.length > 0 && <label>Vincular à prova original<select value={form.linkedOriginalMomentId} onChange={e => update("linkedOriginalMomentId", e.target.value)}><option value="">Não vincular</option>{originals.map(moment => <option value={String(moment.id)} key={moment.id}>#{moment.id} — {moment.title.slice(0, 60)}</option>)}</select></label>}
      <label className="full-span">Trecho literal no momento <span className="optional">opcional</span><textarea rows={3} value={form.quoteAtMoment} onChange={e => update("quoteAtMoment", e.target.value)} placeholder="O que foi efetivamente dito nesse instante." /></label>
      {isViral && <label className="full-span">O que a versão viral distorceu<textarea rows={3} value={form.distortionDescription} onChange={e => update("distortionDescription", e.target.value)} placeholder="O corte omitiu a pergunta anterior, a manchete inverteu o sentido…" /></label>}
      <label className="full-span checkbox-label"><input type="checkbox" checked={form.mirrorAsEvidence} onChange={e => update("mirrorAsEvidence", e.target.checked)} /> Registrar também na trilha de evidências</label>
    </div>
    <div className="modal-actions">
      <button className="button button-ghost-dark" onClick={onClose}>Cancelar</button>
      <button className="button button-dark" disabled={!canSave || register.isPending} onClick={() => register.mutate({
        caseId,
        role: form.role,
        mediaKind: form.mediaKind as "video" | "audio" | "post" | "documento" | "outro",
        title: form.title,
        url: form.url,
        sourceName: form.sourceName,
        timestampStartSec: parseTimecodeInput(form.startAt),
        timestampEndSec: parseTimecodeInput(form.endAt),
        eventDate: form.eventDate || undefined,
        quoteAtMoment: form.quoteAtMoment || undefined,
        distortionDescription: form.distortionDescription || undefined,
        linkedOriginalMomentId: form.linkedOriginalMomentId ? Number(form.linkedOriginalMomentId) : undefined,
        mirrorAsEvidence: form.mirrorAsEvidence,
      })}>{register.isPending ? "Indexando…" : "Indexar momento"}<ArrowUpRight size={15} /></button>
    </div>
  </Modal>;
}
type PipelineStep = { step: string; status: "ok" | "pulado" | "erro"; detail: string };
type FactCheckHit = { claimText: string; publisherName: string; url: string; title: string; textualRating?: string; suggestedRelation: "apoia" | "contradiz" | "contextualiza" | "neutra" };

function AgentPanel({ caseId }: { caseId: number }) {
  const utils = trpc.useUtils();
  const [results, setResults] = useState<DiscoveryResult[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [factCheckHits, setFactCheckHits] = useState<FactCheckHit[]>([]);
  const pipeline = trpc.research.prepareCasePipeline.useMutation({
    onSuccess: async result => {
      setPipelineSteps(result.steps);
      setFactCheckHits((result.factChecks ?? []) as FactCheckHit[]);
      if (result.officialDiscovery) setResults(result.officialDiscovery.results as DiscoveryResult[]);
      await utils.cases.workspace.invalidate({ caseId });
      const ran = result.steps.filter(step => step.status === "ok").length;
      toast.success(ran ? `Fluxo completo: ${ran} etapa(s) trouxeram material` : "Fluxo completo executado, sem material novo");
    },
    onError: e => toast.error(e.message),
  });
  const crossCheck = trpc.research.crossCheckOfficial.useMutation({
    onSuccess: result => {
      setResults(result.results as DiscoveryResult[]);
      toast.success(result.results.length ? `${result.results.length} referência(s) oficial(is) encontrada(s)` : "Nenhuma referência oficial encontrada nos últimos 180 dias");
    },
    onError: e => toast.error(e.message),
  });
  const captureFinding = trpc.research.recordFinding.useMutation({
    onSuccess: async () => {
      await utils.cases.workspace.invalidate({ caseId });
      await utils.research.findings.invalidate({ caseId });
      toast.success("Referência registrada como evidência");
    },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="workspace-card agent-panel">
      <div className="agent-heading"><span className="agent-orbit"><Bot size={17} /></span><div><span className="panel-kicker">AGENTE DE APOIO</span><h3>Cruzamento com fontes oficiais</h3></div><span className="live-label"><i></i> pronto</span></div>
      <p>Busca automaticamente por páginas em domínios .gov.br, .jus.br e .leg.br relacionadas à alegação, nos últimos 180 dias. Cada resultado é uma pista — só vira evidência quando você registrar.</p>
      <button className="button button-dark button-small" disabled={crossCheck.isPending} onClick={() => crossCheck.mutate({ caseId })}>{crossCheck.isPending ? "Cruzando…" : "Buscar em domínios oficiais"}<Sparkles size={14} /></button>
      <button className="button button-outline button-small full-width" disabled={pipeline.isPending} onClick={() => pipeline.mutate({ caseId })}>{pipeline.isPending ? "Rodando fluxo…" : "Rodar fluxo de apuração"}<Layers3 size={14} /></button>
      {pipelineSteps.length > 0 && <div className="pipeline-steps">{pipelineSteps.map(step => <div className={`pipeline-step pipeline-${step.status}`} key={step.step}><strong>{step.step}</strong><span>{step.detail}</span></div>)}</div>}
      {factCheckHits.length > 0 && <div className="historical-results">{factCheckHits.map(hit => <div className="historical-result" key={hit.url}><div><span>{hit.publisherName}{hit.textualRating ? ` · ${hit.textualRating}` : ""}</span><strong>{hit.title}</strong><small>{hit.url}</small></div><div className="historical-result-actions"><a href={hit.url} target="_blank" rel="noreferrer" className="registry-probe">Abrir</a><button className="registry-probe" disabled={captureFinding.isPending} onClick={() => captureFinding.mutate({ caseId, title: hit.title.slice(0, 500), url: hit.url, sourceName: hit.publisherName, sourceType: "reportagem", context: `Checagem já publicada (ClaimReview) por ${hit.publisherName}${hit.textualRating ? `, classificada como "${hit.textualRating}"` : ""}. Alegação avaliada: "${hit.claimText}". Abra e confira antes de citar; a classificação do veículo não é o veredito deste caso.`, excerpt: "", relation: hit.suggestedRelation })}>Registrar</button></div></div>)}</div>}
      {results.length > 0 && <div className="historical-results">{results.map(result => <div className="historical-result" key={result.url}><div><span>{result.publisher} · {result.publishedAt || "data não informada"}</span><strong>{result.title}</strong><small>{result.url}</small></div><div className="historical-result-actions"><a href={result.url} target="_blank" rel="noreferrer" className="registry-probe">Abrir</a><button className="registry-probe" disabled={captureFinding.isPending} onClick={() => captureFinding.mutate({ caseId, findingId: result.findingId ?? undefined, title: result.title, url: result.url, sourceName: result.publisher, sourceType: "oficial", context: `Encontrado via cruzamento automático com fontes oficiais (${result.discoverySource}). A página deve ser aberta e conferida editorialmente antes de ser citada. URL de descoberta: ${result.discoveryUrl}`, excerpt: "", relation: "contextualiza" })}>Registrar</button></div></div>)}</div>}
    </div>
  );
}

function ReviewQueue({ cases, onOpen }: { cases: Array<{ id: number; claimText: string; workflowStatus: string; status: string; updatedAt: Date }>; onOpen: (id: number) => void }) { const reviewCases = cases.filter(item => item.workflowStatus === "em_revisao"); return <div className="review-queue"><div className="queue-intro"><div className="eyebrow">Antes de publicar</div><h2>A revisão é parte do produto.</h2><p>Nenhum modelo pode transformar um briefing em veredito. Nesta fila, a equipe confere as fontes, registra sua decisão e deixa uma justificativa legível para o público.</p></div><div className="review-queue-card"><div className="card-heading"><div><span className="panel-kicker">FILA DE REVISÃO</span><h3>{reviewCases.length} caso{reviewCases.length === 1 ? "" : "s"} aguardando leitura</h3></div><FileCheck2 size={20} /></div>{reviewCases.length ? reviewCases.map(item => <button className="review-item" key={item.id} onClick={() => onOpen(item.id)}><span className={`status-dot ${statusTone[item.status as keyof typeof statusTone]}`}></span><span><strong>{item.claimText}</strong><small>Atualizado em {formatDate(item.updatedAt)}</small></span><ArrowUpRight size={16} /></button>) : <div className="queue-empty"><Check size={18} /><p>Nenhum caso está aguardando revisão no momento.</p></div>}</div></div>; }

type DiscoveryResult = { url: string; discoveryUrl: string; findingId: number | null; title: string; publishedAt: string | null; publisher: string; language: string; sourceCountry: string | null; discoverySource: string; accessedAt: string; needsEditorialOpen: boolean };

function toInputDate(value: string | null) {
  if (!value) return undefined;
  const compact = value.replace(/[^0-9]/g, "").slice(0, 8);
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : undefined;
}

function Orchestration() {
  const caseId = readCaseId();
  const [, navigate] = useLocation();
  const { data: allCases } = trpc.cases.all.useQuery();
  const currentCase = allCases?.find(item => item.id === caseId);
  const { data: sources } = trpc.sources.list.useQuery();
  const { data: tasks } = trpc.research.list.useQuery();
  const sourceCaseInput = useMemo(() => ({ caseId: caseId || 0 }), [caseId]);
  const { data: caseSources } = trpc.sources.forCase.useQuery(sourceCaseInput, { enabled: Boolean(caseId) });
  const utils = trpc.useUtils();
  const [sourceName, setSourceName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [sourceType, setSourceType] = useState<"oficial" | "reportagem" | "documento" | "outra">("oficial");
  const [sourceAccessMode, setSourceAccessMode] = useState<"publico" | "credencial">("publico");
  const [sourcePriority, setSourcePriority] = useState("0");
  const [objective, setObjective] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStart, setSearchStart] = useState("2026-08-01");
  const [searchEnd, setSearchEnd] = useState("2026-08-29");
  const [searchResults, setSearchResults] = useState<DiscoveryResult[]>([]);
  const createSource = trpc.sources.create.useMutation({ onSuccess: async () => { await utils.sources.list.invalidate(); setSourceName(""); setEndpoint(""); toast.success("Fonte autorizada registrada"); }, onError: e => toast.error(e.message) });
  const probeSource = trpc.sources.probe.useMutation({ onSuccess: result => toast.success(`Endpoint respondeu ${result.status}`), onError: e => toast.error(e.message) });
  const linkSource = trpc.sources.linkToCase.useMutation({ onSuccess: async () => { await utils.sources.forCase.invalidate(sourceCaseInput); toast.success("Fonte vinculada ao caso"); }, onError: e => toast.error(e.message) });
  const setSourceStatus = trpc.sources.setStatus.useMutation({ onSuccess: async () => { await utils.sources.list.invalidate(); toast.success("Status da fonte atualizado"); }, onError: e => toast.error(e.message) });
  const createTask = trpc.research.create.useMutation({ onSuccess: async () => { await utils.research.list.invalidate(); setObjective(""); toast.success("Tarefa preparada para distribuição"); }, onError: e => toast.error(e.message) });
  const simulateReturn = trpc.research.simulateReturn.useMutation({ onSuccess: async () => { await utils.research.list.invalidate(); if (caseId) await utils.cases.workspace.invalidate({ caseId }); setObjective(""); toast.success("Retorno registrado como evidência"); }, onError: e => toast.error(e.message) });
  const discover = trpc.research.discover.useMutation({ onSuccess: result => { setSearchResults(result.results as DiscoveryResult[]); toast.success(`${result.results.length} achado(s) candidatos encontrados`); }, onError: e => toast.error(e.message) });
  const captureFinding = trpc.research.recordFinding.useMutation({ onSuccess: async () => { if (caseId) { await utils.cases.workspace.invalidate({ caseId }); await utils.research.findings.invalidate({ caseId }); } toast.success("Achado registrado como evidência para revisão"); }, onError: e => toast.error(e.message) });
  return <div className="orchestration-page">{caseId && currentCase
    ? <div className="orchestration-context"><span className="panel-kicker">CASO EM FOCO</span><strong>{currentCase.claimText}</strong><button className="text-action" onClick={() => navigate("/painel")}>Trocar de caso</button></div>
    : <div className="orchestration-context empty"><AlertCircle size={15} /><div><strong>Nenhum caso aberto.</strong><span>Pesquisa histórica, tarefas e vínculo de fontes agem sobre um caso — escolha um para habilitar essas ações. O catálogo de fontes abaixo funciona sem caso.</span></div><button className="button button-dark button-small" onClick={() => navigate("/painel")}>Escolher um caso</button></div>}
    <div className="queue-intro"><div className="eyebrow">Agente dedicado</div><h2>Coordene pesquisa sem terceirizar a responsabilidade.</h2><p>O desenho do VerificaFonte separa as funções: agentes podem navegar e encontrar material; o sistema registra a trilha; o editor decide o que merece publicação.</p></div><div className="orchestration-grid"><div className="orchestration-card primary"><span className="orchestration-number">01</span><Bot size={22} /><h3>Agente orquestrador</h3><p>Recebe o escopo, divide a pesquisa em tarefas e reúne os retornos para uma leitura única.</p><div className="orchestration-status"><span className="live-dot"></span> Papel definido · {tasks?.length ?? 0} tarefas no sistema</div></div><div className="orchestration-card"><span className="orchestration-number">02</span><SearchIcon /><h3>Agentes de navegação</h3><p>Consultam páginas públicas e fluxos permitidos, sempre devolvendo URL, data, origem e contexto.</p><div className="orchestration-status muted">Retorno previsto: evidência rastreável</div></div><div className="orchestration-card"><span className="orchestration-number">03</span><ShieldCheck size={22} /><h3>Barreira editorial</h3><p>O veredito e a publicação ficam fora do alcance do modelo. Uma pessoa precisa revisar e registrar a decisão.</p><div className="orchestration-status accent">Regra ativa no fluxo</div></div></div><div className="orchestration-tools"><div className="source-registry"><div className="card-heading"><div><span className="panel-kicker">CATÁLOGO DE FONTES</span><h3>Conexões autorizadas <span>{sources?.length ?? 0}</span></h3></div><Link2 size={18} /></div><div className="registry-form"><input value={sourceName} onChange={e => setSourceName(e.target.value)} placeholder="Nome da fonte" /><input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://endpoint-publico..." /><select value={sourceType} onChange={e => setSourceType(e.target.value as typeof sourceType)}><option value="oficial">Oficial</option><option value="reportagem">Reportagem</option><option value="documento">Documento</option><option value="outra">Outra</option></select><select value={sourceAccessMode} onChange={e => setSourceAccessMode(e.target.value as typeof sourceAccessMode)}><option value="publico">Acesso público</option><option value="credencial">Com credencial</option></select><input type="number" min="0" max="100" value={sourcePriority} onChange={e => setSourcePriority(e.target.value)} placeholder="Prioridade" /><button className="button button-dark button-small" disabled={!sourceName.trim() || !endpoint.trim() || createSource.isPending} onClick={() => createSource.mutate({ name: sourceName, endpoint, sourceType, accessMode: sourceAccessMode })}><Plus size={14} /> Registrar</button></div>{sources?.length ? <div className="registry-list">{sources.slice(0, 4).map(source => <div className="registry-item" key={source.id}><span className="status-dot status-confirmed"></span><span><strong>{source.name}</strong><small>{source.endpoint}</small></span><button className="registry-probe" disabled={probeSource.isPending} onClick={() => probeSource.mutate({ endpoint: source.endpoint })}>Testar</button>{caseId && (() => { const linked = caseSources?.some(item => item.source.id === source.id); return <button className="registry-probe" disabled={linked || linkSource.isPending} onClick={() => linkSource.mutate({ caseId, sourceConnectionId: source.id, priority: Number(sourcePriority) || 0, active: "sim" })}>{linked ? "Vinculada" : "Vincular"}</button>; })()}<button className="registry-probe" disabled={setSourceStatus.isPending} onClick={() => setSourceStatus.mutate({ id: source.id, status: source.status === "ativo" ? "pausado" : "ativo" })}>{source.status === "ativo" ? "Pausar" : "Ativar"}</button><em>{source.status}</em></div>)}</div> : <p className="registry-empty">Nenhuma conexão cadastrada. Registre apenas endpoints que a equipe está autorizada a consultar.</p>}</div><div className="historical-search"><div className="card-heading"><div><span className="panel-kicker">PESQUISA HISTÓRICA</span><h3>Descobrir cobertura na web</h3></div><SearchIcon /></div><p className="search-note">O agente consulta um índice público para localizar notícias antigas e atuais. Cada resultado precisa ser aberto e conferido por uma pessoa antes de virar evidência.</p><div className="historical-form"><input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Termo ou frase da alegação" /><label>De<input type="date" value={searchStart} onChange={e => setSearchStart(e.target.value)} /></label><label>Até<input type="date" value={searchEnd} onChange={e => setSearchEnd(e.target.value)} /></label><button className="button button-accent button-small" disabled={!caseId || searchQuery.trim().length < 3 || discover.isPending} onClick={() => discover.mutate({ caseId, query: searchQuery, startDate: searchStart, endDate: searchEnd, language: "por", domains: [], maxRecords: 10 })}>{discover.isPending ? "Buscando…" : "Buscar notícias"}<ArrowUpRight size={14} /></button></div>{searchResults.length > 0 && <div className="historical-results">{searchResults.map(result => <div className="historical-result" key={result.url}><div><span>{result.publisher} · {result.publishedAt || "data não informada"}</span><strong>{result.title}</strong><small>{result.url}</small></div><div className="historical-result-actions"><a href={result.url} target="_blank" rel="noreferrer" className="registry-probe">Abrir</a><button className="registry-probe" disabled={captureFinding.isPending} onClick={() => caseId && captureFinding.mutate({ caseId, findingId: result.findingId ?? undefined, title: result.title, url: result.url, sourceName: result.publisher, sourceType: "reportagem", sourceDate: toInputDate(result.publishedAt), context: `Achado descoberto pelo agente no ${result.discoverySource}, dentro da janela ${searchStart} a ${searchEnd}. A página deve ser aberta e conferida editorialmente; a descoberta não constitui confirmação. URL de descoberta: ${result.discoveryUrl}`, excerpt: "", relation: "contextualiza" })}>Registrar</button></div></div>)}</div>}</div><div className="task-queue"><div className="card-heading"><div><span className="panel-kicker">TAREFAS DE PESQUISA</span><h3>Distribuição <span>{tasks?.length ?? 0}</span></h3></div><Bot size={18} /></div><div className="task-form"><textarea value={objective} onChange={e => setObjective(e.target.value)} placeholder={caseId ? "Descreva o que o agente deve procurar neste caso…" : "Abra um caso no painel para criar uma tarefa."} disabled={!caseId} rows={3} /><button className="button button-accent button-small" disabled={!caseId || objective.trim().length < 12 || createTask.isPending} onClick={() => createTask.mutate({ caseId, objective, workerRole: "navegador" })}><Send size={14} /> Distribuir</button><button className="button button-ghost-dark button-small" disabled={!caseId || !caseSources?.[0] || objective.trim().length < 12 || simulateReturn.isPending} onClick={() => { const source = caseSources?.[0]?.source; if (source && caseId) simulateReturn.mutate({ caseId, endpoint: source.endpoint, objective, title: `Retorno da tarefa — ${source.name}`, sourceName: source.name, sourceType: source.sourceType, relation: "contextualiza" }); }}>Simular retorno</button></div>{tasks?.length ? <div className="registry-list">{tasks.slice(0, 4).map(task => <div className="registry-item" key={task.id}><span className="task-index">{String(task.id).padStart(2, "0")}</span><span><strong>{task.objective}</strong><small>{task.workerRole} · {task.status}</small></span></div>)}</div> : <p className="registry-empty">As tarefas ficam vinculadas a um caso selecionado e aguardam um retorno rastreável.</p>}</div></div><div className="integration-note"><div className="integration-note-icon"><Send size={17} /></div><div><strong>Fontes externas autorizadas</strong><p>O catálogo registra endpoints e modo de acesso. A execução real de navegação deve ser conectada por um serviço autorizado, sem conceder ao modelo poder de publicar.</p></div><span className="integration-state">REGISTRO ATIVO</span></div></div>;
}

function SearchIcon() { return <FileSearchIcon />; }
function FileSearchIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h3M8 17h4M16.5 16.5 20 20"/><circle cx="15" cy="15" r="2.5"/></svg>; }

function EvidenceForm({ onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (values: { title: string; url: string; sourceName: string; sourceType: "oficial" | "reportagem" | "documento" | "outra"; sourceDate?: string; context: string; excerpt?: string; relation: "apoia" | "contradiz" | "contextualiza" | "neutra" }) => void; isPending: boolean }) { const [form, setForm] = useState({ title: "", url: "", sourceName: "", sourceType: "oficial" as const, sourceDate: "", context: "", excerpt: "", relation: "contextualiza" as const }); const update = (key: string, value: string) => setForm(current => ({ ...current, [key]: value })); return <Modal title="Registrar evidência" eyebrow="Nova fonte" onClose={onClose}><p className="modal-lede">Inclua o mínimo necessário para outra pessoa conseguir encontrar e entender esta fonte.</p><div className="form-grid"><label className="full-span">Título da fonte<input value={form.title} onChange={e => update("title", e.target.value)} placeholder="Título do documento ou reportagem" /></label><label>URL<input type="url" value={form.url} onChange={e => update("url", e.target.value)} placeholder="https://..." /></label><label>Origem / veículo<input value={form.sourceName} onChange={e => update("sourceName", e.target.value)} placeholder="Instituição ou publicação" /></label><label>Tipo<select value={form.sourceType} onChange={e => update("sourceType", e.target.value)}><option value="oficial">Fonte oficial</option><option value="reportagem">Reportagem</option><option value="documento">Documento</option><option value="outra">Outra</option></select></label><label>Data da fonte<input type="date" value={form.sourceDate} onChange={e => update("sourceDate", e.target.value)} /></label><label>Relação com a alegação<select value={form.relation} onChange={e => update("relation", e.target.value)}><option value="apoia">Apoia</option><option value="contradiz">Contradiz</option><option value="contextualiza">Contextualiza</option><option value="neutra">Neutra</option></select></label><label className="full-span">Contexto da evidência<textarea rows={4} value={form.context} onChange={e => update("context", e.target.value)} placeholder="O que esta fonte demonstra, limita ou acrescenta?" /></label><label className="full-span">Trecho relevante <span className="optional">opcional</span><textarea rows={3} value={form.excerpt} onChange={e => update("excerpt", e.target.value)} placeholder="Cole o trecho que sustenta sua leitura, se houver." /></label></div><div className="modal-actions"><button className="button button-ghost-dark" onClick={onClose}>Cancelar</button><button className="button button-dark" disabled={isPending} onClick={() => onSubmit(form)}>{isPending ? "Salvando…" : "Salvar evidência"}<ArrowUpRight size={15} /></button></div></Modal>; }
function ReviewForm({ onClose, onSubmit, isPending }: { onClose: () => void; onSubmit: (values: { decision: "aprovar" | "solicitar_ajustes" | "rejeitar"; note: string }) => void; isPending: boolean }) { const [decision, setDecision] = useState<"aprovar" | "solicitar_ajustes" | "rejeitar">("aprovar"); const [note, setNote] = useState(""); return <Modal title="Registrar revisão" eyebrow="Histórico editorial" onClose={onClose}><p className="modal-lede">A decisão fica associada à sua conta e aparece na trilha interna do caso.</p><label>Decisão<select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}><option value="aprovar">Aprovar para publicação</option><option value="solicitar_ajustes">Solicitar ajustes</option><option value="rejeitar">Rejeitar conclusão atual</option></select></label><label>Nota da revisão<textarea rows={6} value={note} onChange={e => setNote(e.target.value)} placeholder="Quais fontes foram conferidas? O que precisa ser ajustado ou está pronto?" /></label><div className="modal-actions"><button className="button button-ghost-dark" onClick={onClose}>Cancelar</button><button className="button button-dark" disabled={isPending || note.trim().length < 10} onClick={() => onSubmit({ decision, note })}>{isPending ? "Registrando…" : "Registrar revisão"}<Check size={15} /></button></div></Modal>; }
function Modal({ title, eyebrow, children, onClose }: { title: string; eyebrow: string; children: React.ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="create-modal wide" role="dialog" aria-modal="true"><button className="modal-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button><div className="eyebrow">{eyebrow}</div><h2>{title}</h2>{children}</div></div>; }
