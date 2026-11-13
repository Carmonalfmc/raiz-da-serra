'use strict';
/* Raiz da Serra — app da família (fase 1: pedidos, entrega parcial, lista para separar, fotos e vídeos) */

const CFG = window.RAIZ_CONFIG || {};
const DEMO = !CFG.supabaseUrl || /SEU-PROJETO/.test(CFG.supabaseUrl);
const VEIO_DE_LINK = /type=(invite|recovery|signup|magiclink)/.test(location.hash);
const sb = DEMO ? null : window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);

const app = document.querySelector('#app');
const dlg = document.querySelector('#dlg');
const S = { produtos: [], pedidos: [], midias: [], pix: '', carrinho: {}, busca: '', soFav: false, verEntregues: false };

const PASTAS = ['Queijos', 'Torresmo', 'Doces', 'Ovos e banha', 'Pão de queijo e quitandas', 'Gonçalves e a serra', 'Família e bastidores'];
const VENDIDO = ['pago', 'entrega', 'finalizado'];
const NOME_ETAPA = { novo: 'Novo pedido', pagamento: 'Aguardando pagamento', pago: 'Pago', entrega: 'Entrega parcial', finalizado: 'Entregue', cancelado: 'Cancelado' };
const LIMITE_MB = 50;

/* ---------- utilidades ---------- */
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
const agora = () => new Date().toISOString();
const dataCurta = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const slug = t => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clone = o => JSON.parse(JSON.stringify(o));
const falta = o => o.itens.reduce((s, i) => s + Math.max(0, i.qtd - (i.entregue || 0)), 0);
const entregue = o => o.itens.reduce((s, i) => s + (i.entregue || 0), 0);
const pago = o => VENDIDO.includes(o.status);
const achar = id => S.pedidos.find(p => String(p.id) === String(id));

let toastT;
function toast(msg) {
  const t = document.querySelector('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
async function copiar(texto, aviso) {
  try { await navigator.clipboard.writeText(texto); }
  catch {
    const ta = document.createElement('textarea'); ta.value = texto; document.body.append(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
  toast(aviso || 'Copiado');
}
function confirmar(titulo, texto, rotulo, perigo) {
  return new Promise(res => {
    dlg.innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <button class="btn ${perigo ? 'perigo' : 'p'}" data-r="1">${esc(rotulo)}</button>
      <button class="btn s" data-r="0">Voltar, não fazer nada</button>`;
    dlg.onclick = e => { const b = e.target.closest('[data-r]'); if (b) { dlg.close(); res(b.dataset.r === '1'); } };
    dlg.oncancel = () => res(false);
    dlg.showModal();
  });
}

/* ---------- dados: Supabase ou demonstração ---------- */
const DEMO_PRODUTOS = [
  ['RS01', 'Queijo Araucária (aprox. 400 g)', 28], ['RS02', 'Combo 2 Queijos Araucária', 50], ['RS03', 'Torresmo da Cachoeira 150 g', 18],
  ['RS04', 'Banha de Porco Caseira 300 g', 20], ['RS05', 'Ovos Caipira da Serra (dúzia)', 25], ['RS06', 'Sal Marinho 500 g', 10],
  ['RS10', 'Pão de Queijo Caseiro 600 g', 25], ['RS11', 'Biscoito de Polvilho (palitinho) 70 g', 5],
  ['RS12', 'Doce de Leite Sem Adição de Açúcar 400 g', 30], ['RS13', 'Cocada Cremosa com Maracujá Sem Adição de Açúcar 400 g', 30],
  ['RS14', 'Goiabada Cascão Sem Adição de Açúcar 400 g', 25], ['RS15', 'Doce de Abóbora com Coco Sem Adição de Açúcar 400 g', 25],
  ['RS16', 'Doce de Leite com Açúcar 600 g', 28], ['RS17', 'Cocada Cremosa com Maracujá com Açúcar 600 g', 28],
  ['RS18', 'Queijo Meia Cura Meia Banda (aprox. 450 g)', 28], ['RS19', 'Queijo Meia Cura Peça Inteira (aprox. 900 g)', 50],
  ['RS20', 'Requeijão do Norte 300 g', 28], ['RS21', 'Queijo Mussarela Nozinho (aprox. 280 g)', 25]
].map(([codigo, nome, preco]) => ({ codigo, nome, preco, estoque: null, ativo: true }));

function demoInicial() {
  const it = (c, q, e) => { const p = DEMO_PRODUTOS.find(x => x.codigo === c); return { codigo: c, nome: p.nome, preco: p.preco, qtd: q, entregue: e || 0 }; };
  const ped = (numero, cliente, status, itens, obs) => ({
    id: 'demo-' + numero, numero, cliente, telefone: '', status, itens, obs: obs || '', entregas: [], baixado: pago({ status }),
    total: itens.reduce((s, i) => s + i.preco * i.qtd, 0), historico: [{ em: agora(), status }], vendido_em: null, criado_em: agora(), atualizado_em: agora()
  });
  return {
    pix: '000.000.000-00', produtos: DEMO_PRODUTOS,
    pedidos: [
      ped(1, 'Maria (exemplo)', 'novo', [it('RS03', 2), it('RS12', 1)]),
      ped(2, 'João (exemplo)', 'pagamento', [it('RS18', 1), it('RS10', 1)]),
      ped(3, 'Ana (exemplo)', 'entrega', [it('RS16', 2, 2), it('RS05', 1, 0)], 'Ovos na semana que vem')
    ]
  };
}

const apiDemo = {
  _d: null,
  _salvar() { localStorage.setItem('raiz-demo', JSON.stringify(this._d)); },
  async carregar() {
    try { this._d = JSON.parse(localStorage.getItem('raiz-demo')); } catch { this._d = null; }
    if (!this._d) { this._d = demoInicial(); this._salvar(); }
    S.produtos = this._d.produtos; S.pedidos = this._d.pedidos; S.pix = this._d.pix;
  },
  async salvarPedido(o) {
    o.atualizado_em = agora();
    if (!o.id) { o.numero = Math.max(0, ...this._d.pedidos.map(p => p.numero)) + 1; o.id = 'demo-' + o.numero; this._d.pedidos.push(o); }
    else this._d.pedidos[this._d.pedidos.findIndex(p => p.id === o.id)] = o;
    this._salvar(); return o;
  },
  async ajustarEstoque() { },
  async salvarPix(v) { this._d.pix = v; this._salvar(); },
  async enviarMidia(file, pasta, tipo, duracao) {
    const m = { id: 'm' + Date.now() + Math.random(), pasta, nome: file.name.replace(/\.[^.]+$/, ''), tipo, duracao, favorito: false, criado_em: agora(), url: URL.createObjectURL(file) };
    S.midias.unshift(m);
  },
  async atualizarMidia(m, patch) { Object.assign(m, patch); },
  async apagarMidia(m) { S.midias = S.midias.filter(x => x !== m); },
  async urls() { },
  async sair() { localStorage.removeItem('raiz-demo'); location.reload(); }
};

function checar({ data, error }) { if (error) throw new Error(error.message); return data; }
const urlCache = new Map();
const apiSb = {
  async carregar() {
    const [prod, ped, aj, mid] = await Promise.all([
      sb.from('produtos').select('*').eq('ativo', true).order('codigo'),
      sb.from('pedidos').select('*').order('numero', { ascending: false }),
      sb.from('ajustes').select('*'),
      sb.from('midias').select('*').order('criado_em', { ascending: false })
    ]);
    S.produtos = checar(prod); S.pedidos = checar(ped); S.midias = checar(mid);
    S.pix = (checar(aj).find(a => a.chave === 'pix') || {}).valor || '';
  },
  async salvarPedido(o) {
    const antes = o.atualizado_em;
    const linha = { ...o, atualizado_em: agora() };
    if (!o.id) {
      delete linha.id; delete linha.numero; // o banco dá o próximo número, sem repetir
      return checar(await sb.from('pedidos').insert(linha).select().single());
    }
    const data = checar(await sb.from('pedidos').update(linha).eq('id', o.id).eq('atualizado_em', antes).select());
    if (!data.length) throw new Error('Esse pedido foi alterado em outro celular. Atualizei a tela, confira e tente de novo.');
    return data[0];
  },
  async ajustarEstoque(itens, sinal) {
    for (const i of itens) checar(await sb.rpc('ajustar_estoque', { p_codigo: i.codigo, p_delta: sinal * i.qtd }));
  },
  async salvarPix(v) { checar(await sb.from('ajustes').upsert({ chave: 'pix', valor: v })); },
  async enviarMidia(file, pasta, tipo, duracao) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [, tipo === 'video' ? 'mp4' : 'jpg'])[1].toLowerCase();
    const caminho = `${slug(pasta)}/${crypto.randomUUID()}.${ext}`;
    checar(await sb.storage.from('midias').upload(caminho, file, { contentType: file.type || undefined }));
    const m = checar(await sb.from('midias').insert({ pasta, nome: file.name.replace(/\.[^.]+$/, ''), caminho, tipo, duracao }).select().single());
    S.midias.unshift(m);
  },
  async atualizarMidia(m, patch) { checar(await sb.from('midias').update(patch).eq('id', m.id)); Object.assign(m, patch); },
  async apagarMidia(m) {
    checar(await sb.storage.from('midias').remove([m.caminho]));
    checar(await sb.from('midias').delete().eq('id', m.id));
    S.midias = S.midias.filter(x => x !== m);
  },
  async urls(lista) { // links temporários (1 hora) para arquivos privados
    const t = Date.now();
    const pedir = lista.filter(m => !(urlCache.get(m.caminho)?.ate > t));
    if (pedir.length) {
      const data = checar(await sb.storage.from('midias').createSignedUrls(pedir.map(m => m.caminho), 3600));
      data.forEach(d => { if (d.signedUrl) urlCache.set(d.path, { url: d.signedUrl, ate: t + 50 * 60000 }); });
    }
    lista.forEach(m => { m.url = urlCache.get(m.caminho)?.url || ''; });
  },
  async sair() { await sb.auth.signOut(); location.reload(); }
};
const api = DEMO ? apiDemo : apiSb;

async function recarregar() { await api.carregar(); }
async function gravar(o) {
  try {
    const salvo = await api.salvarPedido(o);
    const i = S.pedidos.findIndex(p => p.id === salvo.id);
    if (i >= 0) S.pedidos[i] = salvo; else S.pedidos.unshift(salvo);
    return salvo;
  } catch (e) {
    toast(e.message || 'Não consegui salvar. Confira a internet.');
    try { await recarregar(); } catch { }
    rota(); return null;
  }
}

/* ---------- textos prontos ---------- */
const linhaItem = (i, comPreco) => `${i.qtd}x ${i.nome}` + (comPreco ? ` (${brl(i.preco * i.qtd)})` : '');
function msgCobranca(o) {
  return `Oi, ${o.cliente.split(' ')[0]}! Obrigado pelo pedido 🧡\n\n${o.itens.map(i => linhaItem(i)).join('\n')}\n\nTotal: ${brl(o.total)}\n\n` +
    'Pra pagar é só fazer o Pix na chave que vou mandar logo abaixo, sozinha, pra facilitar copiar.\n\n' +
    'Quando fizer, me manda o comprovante por aqui que eu já separo tudo e combino a entrega com você';
}
function msgGrupo(o) {
  return `*NOVO PEDIDO #${o.numero}*\n\nCliente: ${o.cliente}\n\nItens:\n${o.itens.map(i => linhaItem(i, true)).join('\n')}\n\n` +
    `Total: ${brl(o.total)}\n\nEntrega: Em mãos (pedido de ${dataCurta(o.criado_em)})\n\nEtapa: ${NOME_ETAPA[o.status]}`;
}
function separar() {
  const m = new Map();
  S.pedidos.filter(o => !['cancelado', 'finalizado'].includes(o.status)).forEach(o => o.itens.forEach(i => {
    const f = i.qtd - (i.entregue || 0); if (f <= 0) return;
    const r = m.get(i.codigo) || { nome: i.nome, pagos: 0, aguardando: 0 };
    r[pago(o) ? 'pagos' : 'aguardando'] += f; m.set(i.codigo, r);
  }));
  return [...m.values()].sort((a, b) => (b.pagos + b.aguardando) - (a.pagos + a.aguardando));
}

/* ---------- telas ---------- */
function tela(titulo, corpo, voltar) {
  app.innerHTML = (DEMO ? '<div class="demo">Modo demonstração: os dados ficam só neste aparelho</div>' : '') +
    `<header class="topo ${voltar ? '' : 'inicio'}">${voltar ? `<button class="voltar" data-ir="${voltar}">‹ Voltar</button>` : ''}<h1>${esc(titulo)}</h1></header><main>${corpo}</main>`;
  window.scrollTo(0, 0);
}

function telaInicio() {
  const n = e => S.pedidos.filter(o => o.status === e).length;
  const paraEntregar = n('pago') + n('entrega');
  const acao = n('novo') + n('pagamento') + paraEntregar;
  const av = [];
  const pl = (q, um, varios) => `${q} ${q === 1 ? um : varios}`;
  if (n('novo')) av.push(pl(n('novo'), 'pedido novo para cobrar', 'pedidos novos para cobrar'));
  if (n('pagamento')) av.push(pl(n('pagamento'), 'pedido esperando pagamento', 'pedidos esperando pagamento'));
  if (paraEntregar) av.push(pl(paraEntregar, 'pedido para entregar', 'pedidos para entregar'));
  tela('Raiz da Serra', `
    <img class="logo" src="icons/logo.png" alt="Raiz da Serra, Empório Caipira">
    <p class="lema">De Gonçalves, para você</p>
    <button class="btn p grande" data-ir="#/pedidos">Pedidos<small>${acao ? acao + ' para cuidar' : 'Tudo em dia'}</small></button>
    <button class="btn v grande" data-ir="#/fotos">Fotos e vídeos<small>${S.midias.length} guardados</small></button>
    <button class="btn s grande" disabled>Criar post<small>Chega na próxima versão</small></button>
    <div class="aviso"><ul>${av.length ? av.map(a => `<li>${a}</li>`).join('') : '<li>Nenhum pedido esperando por você.</li>'}</ul></div>
    <button class="btn s" data-ir="#/ajustes">Ajustes</button>`);
}

function botaoPasso(o) {
  if (o.status === 'novo') return `<button class="btn p" data-act="cobrei" data-id="${o.id}">Já mandei a cobrança</button>`;
  if (o.status === 'pagamento') return `<button class="btn p" data-act="pagou" data-id="${o.id}">Já pagou</button>`;
  if (o.status === 'pago' || o.status === 'entrega') return `<button class="btn p" data-act="entrega" data-id="${o.id}">Registrar entrega</button>`;
  return '';
}
function pills(o) {
  const t = o.itens.reduce((s, i) => s + i.qtd, 0), e = entregue(o); let h = '';
  if (o.status === 'cancelado') return '<span class="pill">Cancelado</span>';
  h += pago(o) ? '<span class="pill ok">Pago</span>' : '<span class="pill al">Falta pagamento</span>';
  if (e && e < t) h += `<span class="pill al">Entrega parcial ${e}/${t}</span>`;
  if (e && e === t) h += '<span class="pill ok">Tudo entregue</span>';
  return h;
}
function cardPedido(o) {
  return `<div class="card"><div role="link" tabindex="0" data-ir="#/pedido/${o.id}">
    <div class="linha1"><span>#${o.numero} ${esc(o.cliente)}</span><span>${brl(o.total)}</span></div>
    <div class="itens">${o.itens.map(i => esc(linhaItem(i))).join('<br>')}</div>${pills(o)}</div>
    ${botaoPasso(o)}<button class="btn s" data-ir="#/pedido/${o.id}">Abrir pedido</button></div>`;
}
function telaPedidos() {
  const g = (titulo, etapas, vazio) => {
    const l = S.pedidos.filter(o => etapas.includes(o.status)).sort((a, b) => a.numero - b.numero);
    return `<h2 class="grupo">${titulo} (${l.length})</h2>` + (l.length ? l.map(cardPedido).join('') : `<p class="vazio">${vazio}</p>`);
  };
  const fim = S.pedidos.filter(o => ['finalizado', 'cancelado'].includes(o.status));
  tela('Pedidos', `
    <button class="btn v" data-ir="#/novo">+ Novo pedido</button>
    <button class="btn s" data-ir="#/separar">Lista para separar</button>
    ${g('Novos', ['novo'], 'Nenhum pedido novo.')}
    ${g('Aguardando pagamento', ['pagamento'], 'Ninguém devendo.')}
    ${g('Pagos, falta entregar', ['pago'], 'Nada aqui.')}
    ${g('Para entregar o restante', ['entrega'], 'Nada aqui.')}
    <h2 class="grupo">Entregues e cancelados (${fim.length})</h2>
    ${S.verEntregues ? fim.map(cardPedido).join('') || '<p class="vazio">Nada aqui.</p>' : `<button class="btn s" data-act="verEntregues">Mostrar entregues e cancelados</button>`}`, '#/');
}

function telaPedido(id) {
  const o = achar(id);
  if (!o) return tela('Pedido', '<p class="vazio">Não encontrei esse pedido.</p>', '#/pedidos');
  const aberto = !['finalizado', 'cancelado'].includes(o.status);
  const podeEntregar = aberto && falta(o) > 0 && !['pago', 'entrega'].includes(o.status);
  tela(`Pedido #${o.numero}`, `
    <h2 class="grupo" style="margin-top:4px">${esc(o.cliente)}</h2>
    <p class="hist">${NOME_ETAPA[o.status]}${o.telefone ? ' · ' + esc(o.telefone) : ''} · feito em ${dataCurta(o.criado_em)}</p>${pills(o)}
    <table><tr><th>Produto</th><th class="n">Entregue</th><th class="n">Valor</th></tr>
    ${o.itens.map(i => `<tr><td>${esc(i.nome)}</td><td class="n">${i.entregue || 0} de ${i.qtd}</td><td class="n">${brl(i.preco * i.qtd)}</td></tr>`).join('')}</table>
    <div class="total"><span>Total</span><span>${brl(o.total)}</span></div>
    ${botaoPasso(o)}
    ${o.status === 'novo' ? `<button class="btn s" data-act="pagou" data-id="${o.id}">Já pagou</button>` : ''}
    ${podeEntregar ? `<button class="btn s" data-act="entrega" data-id="${o.id}">Registrar entrega (antes de pagar)</button>` : ''}
    <h2 class="grupo">Mensagens prontas</h2>
    <button class="btn s" data-act="copCobranca" data-id="${o.id}">Copiar mensagem de cobrança</button>
    <button class="btn s" data-act="copPix">Copiar só a chave Pix</button>
    <button class="btn s" data-act="copGrupo" data-id="${o.id}">Copiar aviso para o grupo</button>
    <label class="campo">Observações<textarea id="obs">${esc(o.obs)}</textarea></label>
    <button class="btn s" data-act="salvarObs" data-id="${o.id}">Salvar observações</button>
    <h2 class="grupo">Histórico</h2>
    ${(o.historico || []).map(h => `<p class="hist">${dataCurta(h.em)} · ${NOME_ETAPA[h.status] || esc(h.status)}</p>`).join('')}
    ${(o.entregas || []).map(e => `<p class="hist">${dataCurta(e.em)} · Entrega: ${e.itens.map(i => `${i.qtd}x ${esc(i.nome)}`).join(', ')}</p>`).join('')}
    ${(o.entregas || []).length && o.status !== 'cancelado' ? `<button class="btn s" data-act="desfazer" data-id="${o.id}">Desfazer a última entrega</button>` : ''}
    ${aberto ? `<button class="btn perigo" data-act="cancelar" data-id="${o.id}">Cancelar este pedido</button>` : ''}`, '#/pedidos');
}

function passo(chave, valor, max) {
  return `<div class="passo" data-chave="${esc(chave)}" data-max="${max ?? 99}">
    <button type="button" data-act="menos" aria-label="Diminuir">−</button><output>${valor}</output>
    <button type="button" data-act="mais" aria-label="Aumentar">+</button></div>`;
}
function telaNovo() {
  tela('Novo pedido', `
    <label class="campo">Nome do cliente<input type="text" id="cliente" autocomplete="off" enterkeyhint="done"></label>
    <label class="campo">Telefone (se quiser)<input type="tel" id="telefone" autocomplete="off"></label>
    <h2 class="grupo">Toque no + para escolher os produtos</h2>
    ${S.produtos.map(p => `<div class="prod"><div class="nome">${esc(p.nome)}<small>${brl(p.preco)}</small></div>${passo(p.codigo, S.carrinho[p.codigo] || 0)}</div>`).join('')}
    <label class="campo">Observações (se quiser)<textarea id="obs"></textarea></label>
    <div class="total"><span>Total</span><span id="totalNovo">${brl(totalCarrinho())}</span></div>
    <button class="btn p" data-act="salvarNovo">Salvar pedido</button>`, '#/pedidos');
}
const totalCarrinho = () => S.produtos.reduce((s, p) => s + p.preco * (S.carrinho[p.codigo] || 0), 0);

function telaSeparar() {
  const l = separar();
  const texto = '*LISTA PARA SEPARAR*\n\n' + l.map(r => `${r.nome}: ${r.pagos + r.aguardando}` + (r.aguardando ? ` (${r.aguardando} aguardando pagamento)` : '')).join('\n');
  tela('Lista para separar', l.length ? `
    <p>Soma do que ainda falta entregar em todos os pedidos abertos.</p>
    <table><tr><th>Produto</th><th class="n">Total</th><th class="n">Pagos</th><th class="n">Aguard.</th></tr>
    ${l.map(r => `<tr><td>${esc(r.nome)}</td><td class="n">${r.pagos + r.aguardando}</td><td class="n">${r.pagos}</td><td class="n">${r.aguardando}</td></tr>`).join('')}</table>
    <button class="btn p" id="copSeparar">Copiar a lista</button>` : '<p class="vazio">Não há nada para separar agora.</p>', '#/pedidos');
  const b = document.querySelector('#copSeparar'); if (b) b.onclick = () => copiar(texto, 'Lista copiada');
}

/* ---------- fotos e vídeos ---------- */
const dur = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
function cardMidia(m) {
  const corpo = !m.url ? '<img alt="">' : m.tipo === 'video'
    ? `<video src="${esc(m.url)}#t=0.5" preload="metadata" muted playsinline></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`;
  return `<button class="midia" data-act="abrirMidia" data-id="${esc(m.id)}">${corpo}
    ${m.tipo === 'video' ? `<span class="tag">Vídeo ${dur(m.duracao)}</span>` : ''}${m.favorito ? '<span class="fav">Favorita</span>' : ''}
    <div class="leg">${esc(m.nome)}</div></button>`;
}
function filtrar(pasta) {
  const q = slug(S.busca);
  return S.midias.filter(m => (!pasta || m.pasta === pasta) && (!S.soFav || m.favorito) && (!q || slug(m.nome).includes(q)));
}
async function pintarGrade(pasta) {
  const g = document.querySelector('#grade'); if (!g) return;
  const filtrando = S.busca.trim() || S.soFav;
  const pastas = document.querySelector('#pastas'); if (pastas) pastas.hidden = !!filtrando;
  const sem = document.querySelector('#semMidia');
  if (!pasta && !filtrando) { g.innerHTML = ''; sem.hidden = true; return; } // na tela das pastas, a grade só aparece na busca
  const l = filtrar(pasta);
  try { await api.urls(l); } catch (e) { toast('Não consegui carregar as imagens.'); }
  if (!document.body.contains(g)) return;
  g.innerHTML = l.map(cardMidia).join('');
  sem.hidden = l.length > 0;
}
function telaFotos(pasta) {
  const busca = `<label class="campo">Buscar pelo nome<input type="search" id="busca" value="${esc(S.busca)}" autocomplete="off"></label>
    <button class="btn s" data-act="soFav">${S.soFav ? 'Mostrando só as favoritas (toque para ver todas)' : 'Ver só as favoritas'}</button>`;
  if (!pasta) {
    tela('Fotos e vídeos', `${busca}
      <div id="pastas"><h2 class="grupo">Pastas</h2>${PASTAS.map(p => `<button class="btn s" style="justify-content:space-between" data-ir="#/fotos/${encodeURIComponent(p)}"><span>${esc(p)}</span><span>${S.midias.filter(m => m.pasta === p).length}</span></button>`).join('')}</div>
      <div class="grade" id="grade"></div><p class="vazio" id="semMidia" hidden>Nada encontrado.</p>`, '#/');
  } else {
    tela(pasta, `<label class="btn v">Enviar fotos ou vídeos<input type="file" id="arquivos" accept="image/*,video/*" multiple hidden></label>
      <p class="hist" id="progresso"></p>${busca}
      <div class="grade" id="grade"></div><p class="vazio" id="semMidia" hidden>Nenhuma foto ou vídeo aqui ainda.</p>`, '#/fotos');
    document.querySelector('#arquivos').onchange = e => enviar([...e.target.files], pasta);
  }
  pintarGrade(pasta);
  document.querySelector('#busca').oninput = e => { S.busca = e.target.value; pintarGrade(pasta); };
}

function duracaoVideo(file) {
  return new Promise(res => {
    const v = document.createElement('video'); v.preload = 'metadata';
    const fim = d => { URL.revokeObjectURL(v.src); res(d); };
    v.onloadedmetadata = () => fim(isFinite(v.duration) ? Math.round(v.duration) : null);
    v.onerror = () => fim(null); setTimeout(() => fim(null), 8000);
    v.src = URL.createObjectURL(file);
  });
}
async function enviar(files, pasta) {
  const prog = document.querySelector('#progresso'); let ok = 0; const erros = [];
  for (const [n, f] of files.entries()) {
    if (prog) prog.textContent = `Enviando ${n + 1} de ${files.length}...`;
    const tipo = f.type.startsWith('video') ? 'video' : 'foto';
    if (f.size > LIMITE_MB * 1048576) { erros.push(`${f.name} (maior que ${LIMITE_MB} MB)`); continue; }
    try { await api.enviarMidia(f, pasta, tipo, tipo === 'video' ? await duracaoVideo(f) : null); ok++; }
    catch (e) { erros.push(`${f.name} (${e.message})`); }
  }
  if (prog) prog.textContent = erros.length ? 'Não foi: ' + erros.join('; ') : '';
  toast(`${ok} arquivo(s) guardado(s)` + (erros.length ? `, ${erros.length} com erro` : ''));
  pintarGrade(pasta);
}
function abrirMidia(m) {
  dlg.onclick = null; dlg.oncancel = null;
  dlg.innerHTML = `${m.tipo === 'video' ? `<video class="ver" src="${esc(m.url)}" controls playsinline></video>` : `<img class="ver" src="${esc(m.url)}" alt="">`}
    <label class="campo">Nome<input type="text" id="nomeMidia" value="${esc(m.nome)}"></label>
    <button class="btn s" data-m="nome">Salvar nome</button>
    <button class="btn s" data-m="fav">${m.favorito ? 'Tirar das favoritas' : 'Marcar como favorita'}</button>
    <a class="btn s" href="${esc(m.url)}" download="${esc(m.nome)}" target="_blank" rel="noopener">Baixar para o celular</a>
    <button class="btn perigo" data-m="apagar">Apagar</button>
    <button class="btn p" data-m="fechar">Fechar</button>`;
  dlg.onclick = async e => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    const pasta = decodeURIComponent((location.hash.match(/^#\/fotos\/(.+)/) || [])[1] || '') || null;
    try {
      if (b.dataset.m === 'nome') { await api.atualizarMidia(m, { nome: document.querySelector('#nomeMidia').value.trim() || m.nome }); toast('Nome salvo'); }
      if (b.dataset.m === 'fav') { await api.atualizarMidia(m, { favorito: !m.favorito }); toast(m.favorito ? 'Marcada como favorita' : 'Tirada das favoritas'); }
      if (b.dataset.m === 'apagar') {
        dlg.close();
        if (!await confirmar('Apagar este arquivo?', `"${m.nome}" será apagado de vez e não dá para recuperar.`, 'Sim, apagar', true)) return abrirMidia(m);
        await api.apagarMidia(m); toast('Apagado');
      }
    } catch (err) { toast('Não consegui: ' + err.message); }
    if (dlg.open) dlg.close();
    pintarGrade(pasta);
  };
  dlg.showModal();
}

/* ---------- ajustes e entrada ---------- */
function telaAjustes() {
  tela('Ajustes', `
    <label class="campo">Chave Pix (vai sozinha na mensagem para o cliente copiar)<input type="text" id="pix" value="${esc(S.pix)}" autocomplete="off"></label>
    <button class="btn p" data-act="salvarPix">Salvar chave Pix</button>
    <button class="btn s" data-act="atualizar">Atualizar os dados agora</button>
    <button class="btn s" data-act="sair">${DEMO ? 'Apagar os dados de demonstração' : 'Sair da conta'}</button>
    <p class="hist" style="margin-top:20px">Raiz da Serra, versão 1.0${DEMO ? ' (demonstração)' : ''}</p>`, '#/');
}
function telaLogin(msg) {
  tela('Raiz da Serra', `<img class="logo" src="icons/logo.png" alt="Raiz da Serra">
    <p class="lema">Entre uma vez e o app lembra de você</p>
    ${msg ? `<div class="aviso">${esc(msg)}</div>` : ''}
    <form id="login"><label class="campo">E-mail<input type="email" id="email" autocomplete="username" required></label>
    <label class="campo">Senha<input type="password" id="senha" autocomplete="current-password" required></label>
    <button class="btn p">Entrar</button></form>
    <button class="btn s" id="esqueci" type="button">Primeiro acesso ou esqueci a senha</button>`);
  document.querySelector('#esqueci').onclick = async () => {
    const email = document.querySelector('#email').value.trim();
    if (!email) return telaLogin('Digite seu e-mail e toque de novo em "Primeiro acesso ou esqueci a senha".');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    telaLogin(error ? 'Não consegui enviar o e-mail agora. Tente daqui a pouco.' : 'Pronto! Enviei um e-mail para ' + email + '. Abra e toque no link para criar sua senha.');
  };
  document.querySelector('#login').onsubmit = async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: document.querySelector('#email').value.trim(), password: document.querySelector('#senha').value });
    if (error) return telaLogin('E-mail ou senha não conferem. Tente de novo.');
    iniciar();
  };
}

function telaNovaSenha(msg) {
  tela('Crie sua senha', `<img class="logo" src="icons/logo.png" alt="Raiz da Serra">
    <p class="lema">Escolha uma senha para entrar no app. Use pelo menos 8 letras ou números.</p>
    ${msg ? `<div class="aviso">${esc(msg)}</div>` : ''}
    <form id="nova"><label class="campo">Nova senha<input type="password" id="n1" autocomplete="new-password" minlength="8" required></label>
    <label class="campo">Repita a senha<input type="password" id="n2" autocomplete="new-password" minlength="8" required></label>
    <button class="btn p">Salvar senha</button></form>`);
  document.querySelector('#nova').onsubmit = async e => {
    e.preventDefault();
    const a = document.querySelector('#n1').value, b = document.querySelector('#n2').value;
    if (a !== b) return telaNovaSenha('As duas senhas não são iguais. Digite de novo.');
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return telaNovaSenha('Não consegui salvar: ' + error.message);
    sessionStorage.setItem('senha-ok', '1'); history.replaceState(null, '', location.pathname); iniciar();
  };
}

/* ---------- ações ---------- */
function mudar(o, status) {
  o.status = status; o.historico = [...(o.historico || []), { em: agora(), status }];
  if (VENDIDO.includes(status) && !o.vendido_em) o.vendido_em = agora();
}
const ACOES = {
  async cobrei(d) { const o = clone(achar(d.id)); mudar(o, 'pagamento'); if (await gravar(o)) { toast('Marcado: aguardando pagamento'); rota(); } },
  async pagou(d) {
    const a = achar(d.id);
    if (!await confirmar(`${a.cliente} já pagou?`, `Pedido #${a.numero}, ${brl(a.total)}.`, 'Sim, já pagou')) return;
    const o = clone(a);
    mudar(o, falta(o) === 0 ? 'finalizado' : entregue(o) ? 'entrega' : 'pago');
    const baixar = !o.baixado; o.baixado = true;
    if (await gravar(o)) {
      if (baixar) try { await api.ajustarEstoque(o.itens, -1); } catch (e) { toast('Pago, mas não consegui dar baixa no estoque.'); }
      toast('Pagamento registrado'); rota();
    }
  },
  entrega(d) {
    const o = achar(d.id);
    dlg.onclick = null; dlg.oncancel = null;
    dlg.innerHTML = `<h2>O que foi entregue agora?</h2><p>Pedido #${o.numero}, ${esc(o.cliente)}. Deixe em 0 o que ainda não saiu.</p>
      ${o.itens.map((i, n) => { const f = i.qtd - (i.entregue || 0); return f > 0 ? `<div class="prod"><div class="nome">${esc(i.nome)}<small>faltam ${f}</small></div>${passo('e' + n, f, f)}</div>` : ''; }).join('')}
      <button class="btn p" data-e="ok">Salvar entrega</button><button class="btn s" data-e="x">Voltar, não fazer nada</button>`;
    dlg.onclick = async e => {
      const b = e.target.closest('[data-e]'); if (!b) return;
      if (b.dataset.e === 'x') return dlg.close();
      const c = clone(o), saiu = [];
      dlg.querySelectorAll('.passo').forEach(p => {
        const n = +p.dataset.chave.slice(1), q = +p.querySelector('output').textContent, i = c.itens[n];
        if (q > 0) { i.entregue = (i.entregue || 0) + q; saiu.push({ idx: n, codigo: i.codigo, nome: i.nome, qtd: q }); }
      });
      if (!saiu.length) return toast('Marque pelo menos 1 item entregue');
      c.entregas = [...(c.entregas || []), { em: agora(), itens: saiu }];
      if (falta(c) === 0) { if (pago(c)) mudar(c, 'finalizado'); }
      else if (c.status === 'pago') mudar(c, 'entrega');
      dlg.close();
      if (await gravar(c)) { toast(falta(c) === 0 ? 'Tudo entregue' : 'Entrega parcial registrada'); rota(); }
    };
    dlg.showModal();
  },
  async desfazer(d) {
    const a = achar(d.id), u = a.entregas[a.entregas.length - 1];
    if (!await confirmar('Desfazer a última entrega?', u.itens.map(i => `${i.qtd}x ${i.nome}`).join(', ') + ' voltam para "falta entregar".', 'Sim, desfazer')) return;
    const o = clone(a);
    o.entregas.pop().itens.forEach(s => { const i = o.itens[s.idx] ?? o.itens.find(x => x.codigo === s.codigo); if (i) i.entregue = Math.max(0, (i.entregue || 0) - s.qtd); });
    if (o.status === 'finalizado' || o.status === 'entrega') mudar(o, entregue(o) ? 'entrega' : 'pago');
    if (await gravar(o)) { toast('Entrega desfeita'); rota(); }
  },
  async cancelar(d) {
    const a = achar(d.id);
    if (!await confirmar('Cancelar este pedido?', `Pedido #${a.numero} de ${a.cliente}. Ele sai da lista de pedidos abertos.`, 'Sim, cancelar o pedido', true)) return;
    const o = clone(a); const devolver = o.baixado; mudar(o, 'cancelado'); o.baixado = false;
    if (await gravar(o)) {
      if (devolver) try { await api.ajustarEstoque(o.itens, 1); } catch { }
      toast('Pedido cancelado'); location.hash = '#/pedidos';
    }
  },
  copCobranca(d) { copiar(msgCobranca(achar(d.id)), 'Cobrança copiada. Agora cole no WhatsApp.'); },
  copGrupo(d) { copiar(msgGrupo(achar(d.id)), 'Aviso copiado. Agora cole no grupo.'); },
  copPix() { S.pix ? copiar(S.pix, 'Chave Pix copiada') : toast('Cadastre a chave Pix em Ajustes'); },
  async salvarObs(d) { const o = clone(achar(d.id)); o.obs = document.querySelector('#obs').value.trim(); if (await gravar(o)) toast('Observações salvas'); },
  verEntregues() { S.verEntregues = true; rota(); },
  mais(d, el) { passoMudar(el, 1); }, menos(d, el) { passoMudar(el, -1); },
  async salvarNovo(d, el) {
    const cliente = document.querySelector('#cliente').value.trim();
    const itens = S.produtos.filter(p => S.carrinho[p.codigo] > 0).map(p => ({ codigo: p.codigo, nome: p.nome, preco: Number(p.preco), qtd: S.carrinho[p.codigo], entregue: 0 }));
    if (!cliente) { toast('Escreva o nome do cliente'); return document.querySelector('#cliente').focus(); }
    if (!itens.length) return toast('Escolha pelo menos 1 produto');
    el.disabled = true;
    const o = await gravar({
      cliente, telefone: document.querySelector('#telefone').value.trim(), status: 'novo', itens, entregas: [], obs: document.querySelector('#obs').value.trim(),
      total: itens.reduce((s, i) => s + i.preco * i.qtd, 0), historico: [{ em: agora(), status: 'novo' }], baixado: false, vendido_em: null, criado_em: agora()
    });
    if (o) { S.carrinho = {}; toast(`Pedido #${o.numero} salvo`); location.hash = '#/pedido/' + o.id; }
  },
  soFav() { S.soFav = !S.soFav; rota(); },
  abrirMidia(d) { const m = S.midias.find(x => String(x.id) === d.id); if (m) abrirMidia(m); },
  async salvarPix() { try { const v = document.querySelector('#pix').value.trim(); await api.salvarPix(v); S.pix = v; toast('Chave Pix salva'); } catch (e) { toast('Não consegui salvar: ' + e.message); } },
  async atualizar() { try { await recarregar(); toast('Dados atualizados'); rota(); } catch (e) { toast('Sem conexão. Tente de novo.'); } },
  async sair() { if (await confirmar(DEMO ? 'Apagar os dados de demonstração?' : 'Sair da conta?', DEMO ? 'Os pedidos de exemplo voltam ao começo.' : 'Para voltar, será preciso digitar e-mail e senha.', DEMO ? 'Sim, apagar' : 'Sim, sair')) api.sair(); }
};
function passoMudar(el, delta) {
  const p = el.closest('.passo'), out = p.querySelector('output');
  const v = Math.min(+p.dataset.max, Math.max(0, +out.textContent + delta)); out.textContent = v;
  if (!p.dataset.chave.startsWith('e')) { S.carrinho[p.dataset.chave] = v; const t = document.querySelector('#totalNovo'); if (t) t.textContent = brl(totalCarrinho()); }
}

document.addEventListener('click', e => {
  const ir = e.target.closest('[data-ir]'); if (ir) { location.hash = ir.dataset.ir; return; }
  if (e.target.closest('dialog')?.id === 'dlg' && !e.target.closest('.passo')) return; // dentro do diálogo, cada diálogo cuida dos seus botões
  const el = e.target.closest('[data-act]'); if (el && ACOES[el.dataset.act]) ACOES[el.dataset.act](el.dataset, el);
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[role=link][data-ir]')) location.hash = e.target.dataset.ir; });

function rota() {
  const h = location.hash || '#/';
  let m;
  if ((m = h.match(/^#\/pedido\/(.+)/))) return telaPedido(decodeURIComponent(m[1]));
  if (h === '#/pedidos') return telaPedidos();
  if (h === '#/novo') return telaNovo();
  if (h === '#/separar') return telaSeparar();
  if ((m = h.match(/^#\/fotos\/(.+)/))) return telaFotos(decodeURIComponent(m[1]));
  if (h === '#/fotos') return telaFotos(null);
  if (h === '#/ajustes') return telaAjustes();
  telaInicio();
}
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/fotos')) { S.busca = ''; S.soFav = false; } rota(); });

async function iniciar() {
  try {
    if (!DEMO) {
      const { data } = await sb.auth.getSession();
      if (!data.session) return telaLogin();
      if (VEIO_DE_LINK && !sessionStorage.getItem('senha-ok')) return telaNovaSenha();
      const { data: ok, error } = await sb.rpc('eh_permitido');
      if (error) throw new Error(error.message);
      if (!ok) { await sb.auth.signOut(); return telaLogin('Este e-mail não tem permissão para usar o app. Fale com o Luís.'); }
    }
    await recarregar(); rota();
  } catch (e) {
    app.innerHTML = `<main><div class="aviso">Não consegui abrir os dados. Confira a internet e tente de novo.<br><small>${esc(e.message)}</small></div><button class="btn p" onclick="location.reload()">Tentar de novo</button></main>`;
  }
}
let ultimaVez = Date.now();
document.addEventListener('visibilitychange', async () => { // ao voltar para o app, busca o que mudou nos outros celulares
  if (document.hidden || dlg.open || Date.now() - ultimaVez < 60000) return;
  if (/^#\/(novo|ajustes|pedido\/)/.test(location.hash)) return; // não atrapalha quem está digitando
  ultimaVez = Date.now();
  try { await recarregar(); rota(); } catch { }
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
iniciar();
