import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, FileSearch, Fingerprint, Image as ImageIcon, Layers3, Link2, LockKeyhole, Menu, Plus, Search, ShieldCheck, Sparkles, Type, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import AuthActions from "@/components/AuthActions";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type IntakeTab = "texto" | "link" | "print";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const statusLabels = {
  em_apuracao: "Em apuração",
  confirmado: "Confirmado por fontes",
  divergente: "Divergente / contestável",
  insuficiente: "Sem evidência suficiente",
};

const statusTone = {
  em_apuracao: "status-research",
  confirmado: "status-confirmed",
  divergente: "status-divergent",
  insuficiente: "status-insufficient",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(" de ", " ");
}

export default function Home() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: stats } = trpc.cases.stats.useQuery();
  const { data: publishedCases, isLoading } = trpc.cases.published.useQuery();
  const createCase = trpc.cases.create.useMutation({
    onSuccess: created => {
      toast.success("Caso criado como rascunho");
      resetIntake();
      setShowCreate(false);
      if (created?.id) setLocation(`/painel?caseId=${created.id}`);
    },
    onError: error => toast.error(error.message || "Não foi possível criar o caso"),
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showAccessNote, setShowAccessNote] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Cadastro é aberto: ter conta não é ter bancada. Sem esta distinção o
  // formulário abria, consumia extração de link/print e só falhava no envio.
  const canEdit = user?.role === "editor" || user?.role === "admin";
  const [claim, setClaim] = useState("");
  const [claimUrl, setClaimUrl] = useState("");
  const [intakeTab, setIntakeTab] = useState<IntakeTab>("texto");
  const [linkInput, setLinkInput] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");

  const extractFromUrl = trpc.intake.extractFromUrl.useMutation({
    onSuccess: result => {
      setClaim(result.claimText);
      toast.success(result.notes || "Alegação extraída do link. Revise antes de criar o caso.");
    },
    onError: error => toast.error(error.message),
  });
  const extractFromImage = trpc.intake.extractFromImage.useMutation({
    onSuccess: result => {
      setClaim(result.claimText);
      toast.success(result.notes || "Alegação extraída do print. Revise antes de criar o caso.");
    },
    onError: error => toast.error(error.message),
  });

  function resetIntake() {
    setClaim("");
    setClaimUrl("");
    setLinkInput("");
    setImageDataUrl(null);
    setImageName("");
    setIntakeTab("texto");
  }

  function handleExtractLink() {
    const url = linkInput.trim();
    if (!url) return;
    setClaimUrl(url);
    extractFromUrl.mutate({ url });
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("O print é grande demais (limite de 6MB).");
      return;
    }
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function handleExtractImage() {
    if (!imageDataUrl) return;
    extractFromImage.mutate({ imageDataUrl });
  }

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("novo") === "1" && canEdit) {
      setShowCreate(true);
    }
  }, [canEdit]);

  function openCreate() {
    // Leva para o login de verdade e volta para cá depois. O toast anterior
    // sumia em segundos e era a única pista de que existia login no produto.
    if (!user) {
      setLocation(`/entrar?next=${encodeURIComponent("/?novo=1")}`);
      return;
    }
    if (!canEdit) {
      setShowAccessNote(true);
      return;
    }
    setShowCreate(true);
  }

  return (
    <div className="min-h-screen bg-ink text-paper">
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="VerificaFonte — início">
            <span className="brand-mark"><Fingerprint size={19} strokeWidth={2.5} /></span>
            <span>verifica<span>fonte</span></span>
          </Link>
          <nav className="desktop-nav" aria-label="Navegação principal">
            <a href="#onde-nasce">Onde começa</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#acervo">Acervo público</a>
            <a href="#metodo">Método</a>
          </nav>
          <div className="header-actions">
            <AuthActions />
            <button className="button button-small button-accent" onClick={openCreate}><Plus size={15} /> Nova alegação</button>
            <button className="mobile-menu" aria-label={menuOpen ? "Fechar menu" : "Abrir menu"} aria-expanded={menuOpen} aria-controls="menu-mobile" onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        {menuOpen && <nav id="menu-mobile" className="mobile-nav" aria-label="Navegação">
          <a href="#onde-nasce" onClick={() => setMenuOpen(false)}>Onde começa</a>
          <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Como funciona</a>
          <a href="#acervo" onClick={() => setMenuOpen(false)}>Acervo público</a>
          <a href="#metodo" onClick={() => setMenuOpen(false)}>Método</a>
          {user && <Link href="/painel" onClick={() => setMenuOpen(false)}><Layers3 size={15} /> Painel editorial</Link>}
          <div className="mobile-nav-auth"><AuthActions onNavigate={() => setMenuOpen(false)} /></div>
          <button className="button button-small button-accent" onClick={() => { setMenuOpen(false); openCreate(); }}><Plus size={15} /> Nova alegação</button>
        </nav>}
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-grid"></div>
          <div className="hero-inner">
            <div className="hero-copy">
              <div className="eyebrow light"><span className="eyebrow-dot"></span> Do post viral ao caso auditável</div>
              <h1>O que circulou na rede <em>não precisa virar verdade.</em></h1>
              <p className="hero-lede">Print do Instagram, corte do TikTok, link do Facebook, áudio de WhatsApp ou notícia solta: transformamos o que viralizou em caso com prova original, fonte rastreável e decisão editorial humana — sem chatbot no lugar do veredito.</p>
              <div className="hero-actions">
                <button className="button button-accent" onClick={openCreate}>Apurar uma alegação <ArrowUpRight size={17} /></button>
                <a className="text-link-light" href="#acervo">Ver casos publicados <ChevronRight size={15} /></a>
              </div>
              <div className="hero-note"><ShieldCheck size={16} /> IA prepara o material. Quem assina a publicação é a redação.</div>
            </div>
            <div className="hero-annotation" aria-hidden="true">
              <div className="annotation-card annotation-card-top"><span>01</span><strong>viral</strong><small>print, post, corte, link</small></div>
              <div className="annotation-line"></div>
              <div className="annotation-card annotation-card-middle"><span>02</span><strong>prova</strong><small>original × distorção</small></div>
              <div className="annotation-line"></div>
              <div className="annotation-card annotation-card-bottom"><span>03</span><strong>laudo</strong><small>revisão humana publica</small></div>
            </div>
          </div>
          <div className="hero-footer"><span>BANCADA EDITORIAL</span><span className="hero-footer-rule"></span><span>REDES · FONTES OFICIAIS · CONTEXTO</span></div>
        </section>

        <section className="stats-strip" aria-label="Indicadores da plataforma">
          <div className="stats-inner">
            <div className="stat-item"><strong>{stats?.total ?? 0}</strong><span>casos registrados</span></div>
            <div className="stat-item"><strong>{stats?.published ?? 0}</strong><span>publicados</span></div>
            <div className="stat-item"><strong>{stats?.evidenceCount ?? 0}</strong><span>evidências catalogadas</span></div>
            <div className="stat-statement"><span className="accent-line"></span><p>Fake news começa no feed. A apuração termina com fonte e assinatura.</p></div>
          </div>
        </section>

        
        <section className="section-paper origins-section" id="onde-nasce" aria-label="Onde a desinformação começa">
          <div className="section-inner">
            <div className="section-intro split-intro">
              <div><div className="eyebrow">Abrangência</div><h2>Nascida no feed — <em>não só na planilha.</em></h2></div>
              <p>Indicadores econômicos oficiais entram quando a postagem cita número. O núcleo do produto é o que viraliza: fala cortada, print sem data, boato de saúde, eleição, crime ou celebridade.</p>
            </div>
            <div className="origins-grid">
              <article className="origin-card"><span className="origin-tag">Rede</span><h3>Print, post e corte</h3><p>Instagram, Facebook, TikTok, X e WhatsApp. Entrada por texto, link ou imagem — o que a pessoa colou, não vigilância de perfil.</p></article>
              <article className="origin-card"><span className="origin-tag">Contexto</span><h3>Original × distorção</h3><p>Indexe o vídeo ou post integral com o instante da fala e descreva o que a versão viral omitiu ou refraseou.</p></article>
              <article className="origin-card"><span className="origin-tag">Fontes</span><h3>Oficial, checagem, reportagem</h3><p>BCB, IBGE e outros órgãos quando houver dado estruturado; ClaimReview e releases para o restante. O editor decide o peso.</p></article>
              <article className="origin-card"><span className="origin-tag">Assinatura</span><h3>Humano no veredito</h3><p>Revisão independente obrigatória para publicar. A máquina acelera a mesa; a marca responde pelo laudo.</p></article>
            </div>
          </div>
        </section>
<section className="section-light workflow-section" id="como-funciona">
          <div className="section-inner">
            <div className="section-intro split-intro">
              <div><div className="eyebrow">O fluxo</div><h2>Do que viralizou ao caso <em>auditável.</em></h2></div>
              <p>Alegações nascem em feed, grupo e manchete. O VerificaFonte separa o que circulou, o que de fato foi dito ou publicado, e o que a redação decide assinar — com trilha que o leitor pode reabrir.</p>
            </div>
            <div className="workflow-grid">
              <article className="workflow-card"><span className="card-number">01</span><FileSearch size={24} /><h3>Capture o que circulou</h3><p>Cole o texto, o link do post ou o print do Instagram, Facebook, TikTok ou WhatsApp. Uma alegação por caso, com escopo claro.</p><span className="card-caption">ENTRADA MULTIMODAL</span></article>
              <article className="workflow-card"><span className="card-number">02</span><BookOpen size={24} /><h3>Ancore a prova e as fontes</h3><p>Indexe o momento original (vídeo, post, documento), descreva a distorção e cruze com fontes oficiais, reportagens e checagens já publicadas.</p><span className="card-caption">ORIGINAL × DISTORÇÃO</span></article>
              <article className="workflow-card"><span className="card-number">03</span><ShieldCheck size={24} /><h3>Revise antes de publicar</h3><p>Agentes e APIs organizam o material. A equipe humana confronta, contextualiza e aprova — ou pede ajustes. O modelo não escolhe o veredito.</p><span className="card-caption">CONTROLE EDITORIAL</span></article>
            </div>
          </div>
        </section>

        <section className="section-paper method-section" id="metodo">
          <div className="section-inner method-layout">
            <div className="method-copy"><div className="eyebrow">O que o status significa</div><h2>Um resultado não é uma <em>caixa-preta.</em></h2><p>Serve para fala fora de contexto, número oficial, saúde, eleição ou boato de rede. Os rótulos descrevem o estado da apuração; a página pública mostra justificativa, fontes e, quando houver, a prova original ao lado da versão viral.</p><button className="button button-dark" onClick={openCreate}>Começar um caso <ArrowUpRight size={16} /></button></div>
            <div className="status-list">
              <div className="status-row"><span className="status-pill status-confirmed"><Check size={13} /> Confirmado por fontes</span><p>Há fontes independentes ou primárias que sustentam o núcleo verificável da alegação.</p></div>
              <div className="status-row"><span className="status-pill status-divergent"><CircleHelp size={13} /> Divergente / contestável</span><p>As evidências entram em conflito, ou a afirmação depende de uma interpretação discutível.</p></div>
              <div className="status-row"><span className="status-pill status-insufficient"><Search size={13} /> Sem evidência suficiente</span><p>A busca registrada ainda não permite concluir com segurança em nenhum sentido.</p></div>
              <div className="status-row"><span className="status-pill status-research"><Sparkles size={13} /> Em apuração</span><p>O caso está aberto e pode receber novas fontes, contexto e revisão.</p></div>
            </div>
          </div>
        </section>

        <section className="section-light archive-section" id="acervo">
          <div className="section-inner">
            <div className="section-heading-row"><div><div className="eyebrow">Acervo público</div><h2>Casos com trilha, não só <em>rótulo.</em></h2></div><span className="archive-count">{publishedCases?.length ?? 0} publicados <ArrowUpRight size={15} /></span></div>
            {isLoading ? <div className="archive-empty"><div className="loading-bar"></div><div className="loading-bar short"></div></div> : publishedCases?.length ? <div className="case-grid">{publishedCases.map(item => <Link key={item.id} href={`/caso/${item.slug}`} className="case-card"><div className="case-card-top"><span className={`status-pill ${statusTone[item.status]}`}>{statusLabels[item.status]}</span><span>{formatDate(item.publishedAt)}</span></div><h3>{item.claimText}</h3><div className="case-card-bottom"><span>Ver trilha completa</span><ArrowUpRight size={15} /></div></Link>)}</div> : <div className="archive-empty"><div className="empty-icon"><LockKeyhole size={18} /></div><div><h3>O acervo começa com uma decisão revisada.</h3><p>Ainda não há casos publicados. Cadastre uma alegação para iniciar o primeiro fluxo editorial.</p></div><button className="button button-dark button-small" onClick={openCreate}>Nova alegação <Plus size={15} /></button></div>}
          </div>
        </section>

        <section className="cta-section"><div className="section-inner cta-inner"><div><div className="eyebrow light">Para redações e equipes de pesquisa</div><h2>Uma fonte só é o começo da conversa.</h2></div><button className="button button-accent" onClick={openCreate}>Abrir um caso <ArrowUpRight size={17} /></button></div></section>
      </main>

      <footer className="site-footer"><div className="section-inner footer-inner"><div className="brand footer-brand"><span className="brand-mark"><Fingerprint size={17} /></span><span>verifica<span>fonte</span></span></div><p>Uma infraestrutura editorial para checar com contexto.</p><span className="footer-meta">v. 0.1 · protótipo de trabalho</span></div></footer>

      {showCreate && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setShowCreate(false); resetIntake(); } }}>
          <div className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-title">
            <button className="modal-close" onClick={() => { setShowCreate(false); resetIntake(); }} aria-label="Fechar"><X size={18} /></button>
            <div className="eyebrow">Novo caso de verificação</div>
            <h2 id="create-title">Qual é a alegação?</h2>
            <p className="modal-lede">Cole o texto, um link ou um print. O modelo ajuda a extrair a alegação; você sempre revisa antes de criar o caso.</p>
            <div className="intake-tabs" role="tablist" aria-label="Como a alegação chegou até você">
              <button type="button" role="tab" aria-selected={intakeTab === "texto"} className={`intake-tab ${intakeTab === "texto" ? "active" : ""}`} onClick={() => setIntakeTab("texto")}><Type size={14} /> Texto</button>
              <button type="button" role="tab" aria-selected={intakeTab === "link"} className={`intake-tab ${intakeTab === "link" ? "active" : ""}`} onClick={() => setIntakeTab("link")}><Link2 size={14} /> Link</button>
              <button type="button" role="tab" aria-selected={intakeTab === "print"} className={`intake-tab ${intakeTab === "print" ? "active" : ""}`} onClick={() => setIntakeTab("print")}><ImageIcon size={14} /> Print</button>
            </div>
            {intakeTab === "link" && (
              <div className="intake-panel">
                <label>Link do post, notícia ou mensagem<input type="url" value={linkInput} onChange={event => setLinkInput(event.target.value)} placeholder="https://… Facebook, Instagram, site, YouTube…" /></label>
                <button type="button" className="button button-outline button-small" disabled={!linkInput.trim() || extractFromUrl.isPending} onClick={handleExtractLink}>{extractFromUrl.isPending ? "Extraindo…" : "Extrair alegação"} <Sparkles size={14} /></button>
              </div>
            )}
            {intakeTab === "print" && (
              <div className="intake-panel">
                <label>Print do feed, stories, comentário ou grupo<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageChange} /></label>
                {imageName && <span className="intake-file-name">{imageName}</span>}
                <button type="button" className="button button-outline button-small" disabled={!imageDataUrl || extractFromImage.isPending} onClick={handleExtractImage}>{extractFromImage.isPending ? "Extraindo…" : "Extrair alegação"} <Sparkles size={14} /></button>
              </div>
            )}
            <label>Texto da alegação<textarea value={claim} onChange={event => setClaim(event.target.value)} placeholder="Ex.: no TikTok circula que fulano disse X; no print do Instagram afirma-se que o IPCA foi Y…" rows={5} /></label>
            <label>URL de origem <span className="optional">opcional</span><input type="url" value={claimUrl} onChange={event => setClaimUrl(event.target.value)} placeholder="https://..." /></label>
            <div className="modal-actions">
              <button className="button button-ghost-dark" onClick={() => { setShowCreate(false); resetIntake(); }}>Cancelar</button>
              <button className="button button-dark" disabled={claim.trim().length < 12 || createCase.isPending} onClick={() => createCase.mutate({ claimText: claim, claimUrl })}>{createCase.isPending ? "Criando…" : "Criar rascunho"}<ArrowUpRight size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {showAccessNote && user && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAccessNote(false); }}>
          <div className="create-modal access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
            <button className="modal-close" onClick={() => setShowAccessNote(false)} aria-label="Fechar"><X size={18} /></button>
            <div className="access-modal-icon"><UserRound size={20} /></div>
            <div className="eyebrow">Conta criada, acesso editorial pendente</div>
            <h2 id="access-title">Você está logado — mas ainda não na redação.</h2>
            <p className="modal-lede">
              Qualquer pessoa pode criar uma conta aqui; abrir casos é outra coisa. A bancada guarda apurações em
              andamento, então o acesso é concedido conta a conta por um administrador.
            </p>
            <div className="access-identity">
              <span>Conta conectada</span>
              <strong>{user.email || user.openId}</strong>
              <small>É este endereço que o administrador procura para liberar seu acesso.</small>
            </div>
            <div className="modal-actions">
              <button className="button button-ghost-dark" onClick={() => setShowAccessNote(false)}>Entendi</button>
              <a className="button button-dark" href="#acervo" onClick={() => setShowAccessNote(false)}>Ver o acervo público <ArrowUpRight size={16} /></a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
