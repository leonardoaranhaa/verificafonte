import { ArrowLeft, ArrowUpRight, CalendarDays, Check, ChevronRight, ExternalLink, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

const statusLabels = { em_apuracao: "Em apuração", confirmado: "Confirmado por fontes", divergente: "Divergente / contestável", insuficiente: "Sem evidência suficiente" } as const;
const statusTone = { em_apuracao: "status-research", confirmado: "status-confirmed", divergente: "status-divergent", insuficiente: "status-insufficient" } as const;
const relationLabels = { apoia: "apoia a alegação", contradiz: "contradiz a alegação", contextualiza: "contextualiza", neutra: "é neutra" } as const;

const momentRoleLabels = { original: "Prova original", viral_distorcido: "Versão que circulou", contextual: "Contexto" } as const;

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Instante da fala em formato legível (1h02m03s). */
function formatTimecode(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h > 0 ? `${h}h` : "", h > 0 || m > 0 ? `${String(m).padStart(h > 0 ? 2 : 1, "0")}m` : "", `${String(sec).padStart(2, "0")}s`].join("");
}

/** Abre o vídeo já no instante indexado, quando a plataforma suporta. */
function momentDeepLink(url: string, startSec?: number | null) {
  if (startSec == null || startSec < 0) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      parsed.searchParams.set("t", `${Math.floor(startSec)}s`);
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

export default function PublicCase() {
  const [, params] = useRoute("/caso/:slug");
  const { data, isLoading } = trpc.cases.publicBySlug.useQuery({ slug: params?.slug || "" }, { enabled: Boolean(params?.slug) });
  const caseRecord = data?.caseRecord;
  const moments = data?.momentRows ?? [];
  const originals = moments.filter(moment => moment.role === "original");
  const virals = moments.filter(moment => moment.role === "viral_distorcido");
  const hasComparison = originals.length > 0 || virals.length > 0;

  if (isLoading) return <div className="public-loading"><div className="loading-orbit"></div><span>Carregando caso…</span></div>;
  if (!caseRecord) return <div className="public-not-found"><Link href="/" className="brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>verifica<span>fonte</span></span></Link><div className="not-found-copy"><div className="eyebrow">Acervo público</div><h1>Este caso ainda não está publicado.</h1><p>Casos só aparecem aqui depois de uma revisão editorial registrada.</p><Link href="/" className="button button-dark">Voltar ao início <ArrowUpRight size={16} /></Link></div></div>;

  return <div className="public-case-page"><header className="public-case-header"><div className="public-case-header-inner"><Link href="/" className="brand"><span className="brand-mark"><Fingerprint size={18} /></span><span>verifica<span>fonte</span></span></Link><Link href="/" className="back-link light-back"><ArrowLeft size={14} /> Acervo público</Link></div></header><main><div className="case-hero"><div className="public-case-container"><div className="eyebrow light"><span className="eyebrow-dot"></span> Caso publicado</div><div className="case-hero-grid"><div><h1>{caseRecord.claimText}</h1><div className="case-meta"><span><CalendarDays size={14} /> Publicado em {formatDate(caseRecord.publishedAt)}</span>{caseRecord.claimUrl && <a href={caseRecord.claimUrl} target="_blank" rel="noreferrer"><Link2 size={14} /> Origem da alegação <ExternalLink size={12} /></a>}</div></div><div className={`case-result ${statusTone[caseRecord.status]}`}><span>Resultado da apuração</span><strong>{statusLabels[caseRecord.status]}</strong><p>Este rótulo é acompanhado pela justificativa e pelas fontes abaixo.</p></div></div></div></div><div className="public-case-container case-body"><div className="case-main-column"><section className="public-section"><div className="public-section-heading"><span className="section-index">01</span><div><span className="panel-kicker">JUSTIFICATIVA</span><h2>O que a apuração encontrou</h2></div></div><div className="editorial-note">{caseRecord.editorialNote || "A equipe editorial ainda não adicionou uma justificativa pública detalhada para este caso."}</div></section><section className="public-section"><div className="public-section-heading"><span className="section-index">02</span><div><span className="panel-kicker">TRILHA DE FONTES</span><h2>{data?.evidenceRows.length ?? 0} evidências registradas</h2></div></div><div className="public-evidence-list">{data?.evidenceRows.length ? data.evidenceRows.map((item, index) => <article className="public-evidence" key={item.id}><div className="public-evidence-index">{String(index + 1).padStart(2, "0")}</div><div className="public-evidence-body"><div className="public-evidence-top"><span className="source-type-label">{item.sourceType}</span><span>{relationLabels[item.relation]}</span></div><h3>{item.title}</h3><p className="public-source"><strong>{item.sourceName}</strong>{item.sourceDate && <> · publicado em {formatDate(item.sourceDate)}</>} · consultado em {formatDate(item.accessedAt)}</p><p>{item.context}</p>{item.excerpt && <blockquote>“{item.excerpt}”</blockquote>}<a href={item.url} target="_blank" rel="noreferrer">Abrir fonte <ArrowUpRight size={13} /></a></div></article>) : <div className="public-empty">Nenhuma evidência foi disponibilizada para este caso.</div>}</div></section>{hasComparison && <section className="public-section"><div className="public-section-heading"><span className="section-index">03</span><div><span className="panel-kicker">ORIGINAL × O QUE CIRCULOU</span><h2>Compare o instante original com a versão viral</h2></div></div><div className="moment-compare">{[{ list: originals, role: "original" as const }, { list: virals, role: "viral_distorcido" as const }].filter(column => column.list.length > 0).map(column => <div className={`moment-column moment-${column.role}`} key={column.role}><div className="moment-column-head"><span>{momentRoleLabels[column.role]}</span></div>{column.list.map(moment => <article className="moment-card" key={moment.id}><div className="moment-card-top"><span className="source-type-label">{moment.mediaKind}</span>{moment.timestampStartSec != null && <span className="moment-timecode">{formatTimecode(moment.timestampStartSec)}{moment.timestampEndSec != null && <>–{formatTimecode(moment.timestampEndSec)}</>}</span>}</div><h3>{moment.title}</h3><p className="public-source"><strong>{moment.sourceName}</strong>{moment.eventDate && <> · {formatDate(moment.eventDate)}</>}</p>{moment.quoteAtMoment && <blockquote>“{moment.quoteAtMoment}”</blockquote>}{moment.distortionDescription && <p className="moment-distortion"><strong>O que foi distorcido:</strong> {moment.distortionDescription}</p>}<a href={momentDeepLink(moment.url, moment.timestampStartSec)} target="_blank" rel="noreferrer">{moment.timestampStartSec != null ? "Abrir no instante" : "Abrir fonte"} <ArrowUpRight size={13} /></a></article>)}</div>)}</div><p className="moment-footnote">Os dois lados são publicados para que o leitor confira por conta própria. A comparação é registrada por decisão editorial humana.</p></section>}<section className="public-section"><div className="public-section-heading"><span className="section-index">{hasComparison ? "04" : "03"}</span><div><span className="panel-kicker">METODOLOGIA</span><h2>Como esta apuração foi feita</h2></div></div><div className="methodology-copy">{caseRecord.methodology || "A metodologia deste caso será publicada junto da justificativa editorial."}</div></section></div><aside className="public-aside"><div className="public-aside-card"><div className="aside-icon"><ShieldCheck size={18} /></div><h3>Publicação revisada</h3><p>Este caso passou por decisão editorial humana. Quando há momento indexado, você vê a prova original ao lado do que circulou na rede.</p><div className="aside-rule"></div><div className="aside-check"><Check size={14} /><span>Fontes identificadas</span></div><div className="aside-check"><Check size={14} /><span>Contexto registrado</span></div><div className="aside-check"><Check size={14} /><span>Justificativa pública</span></div></div><Link href="/" className="aside-back"><ArrowLeft size={14} /> Ver outros casos</Link></aside></div></main><footer className="public-case-footer"><div className="public-case-container"><span>verifica<span>fonte</span></span><span>Do post viral à prova original — com decisão editorial humana.</span></div></footer></div>;
}
