// Controle de Imobilizado — comum a todas as páginas: API, login, menu, componentes
const API = "https://wughmiprdbycsmkjsslj.supabase.co/functions/v1/imobilizado/api";
const ESTADO_NOME = { novo: "Novo", bom: "Bom", ruim: "Ruim" };
const ESTADOS = ["novo", "bom", "ruim"];
const TIPO_SAIDA = { emprestimo: "Empréstimo", manutencao: "Manutenção" };
const STATUS_NOME = { aberta: "Aberta", encerrada: "Encerrada", lancada: "Lançada", cancelada: "Cancelada", pendente: "Pendente", aprovada: "Aprovada", recusada: "Recusada" };
const MENU = [
  { arq: "index.html", nome: "Início" },
  { arq: "bens.html", nome: "Consulta geral" },
  { arq: "incluir.html", nome: "Incluir", perfis: ["operador"] },
  { arq: "retirar.html", nome: "Retirar", perfis: ["operador"] },
  { arq: "emprestimos.html", nome: "Empréstimos e manutenções" },
  { arq: "transferir.html", nome: "Transferir", perfis: ["operador"] },
  { arq: "conferencias.html", nome: "Conferências" },
  { arq: "baixas.html", nome: "Baixas" },
  { arq: "usuarios.html", nome: "Usuários", perfis: [] },
];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);
let BASE = null; // { usuario, locais, categorias, hoje }

// ------------------------------------------------------------- formatos ---
function fmtData(iso) { return iso ? String(iso).slice(8, 10) + "/" + String(iso).slice(5, 7) + "/" + String(iso).slice(0, 4) : ""; }
function fmtDataHora(iso) { return iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""; }
const moeda = (v) => v === null || v === undefined || v === "" ? "" : "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v) => Number(v || 0).toLocaleString("pt-BR");
function fmtTel(d) {
  d = String(d || "").replace(/\D/g, "");
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return d;
}
function mascaraTel(input) {
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").slice(0, 11);
    if (d.length > 6) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, d.length > 10 ? 7 : 6) + "-" + d.slice(d.length > 10 ? 7 : 6);
    else if (d.length > 2) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
    else input.value = d;
  });
}
function normBusca(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function diasAte(iso) { return Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse((BASE?.hoje || new Date().toISOString().slice(0, 10)) + "T12:00:00Z")) / 86400000); }
function prazoTexto(iso) {
  const d = diasAte(iso);
  if (d < 0) return `<span class="pill vencido">vencido há ${-d} dia${d === -1 ? "" : "s"}</span>`;
  if (d === 0) return `<span class="pill vencendo">vence hoje</span>`;
  if (d <= 3) return `<span class="pill vencendo">vence em ${d} dia${d === 1 ? "" : "s"}</span>`;
  return `<span class="pill neutro">até ${fmtData(iso)}</span>`;
}
const pillEstado = (e) => `<span class="pill ${e}">${ESTADO_NOME[e] || e}</span>`;
const pillStatus = (s) => `<span class="pill ${s}">${STATUS_NOME[s] || s}</span>`;

function toast(msg, erro = false) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = erro ? "var(--verm)" : "";
  t.classList.add("on");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("on"), erro ? 5000 : 2800);
}

// ------------------------------------------------------------------ API ---
async function api(rota, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("im_token");
  if (token) headers["x-token"] = token;
  let r;
  try { r = await fetch(API + rota, { method: opts.method || (opts.body ? "POST" : "GET"), headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
  catch { throw new Error("Sem conexão com o servidor. Confira a internet e tente de novo."); }
  let dados = null;
  try { dados = await r.json(); } catch { dados = { erro: "Resposta inválida do servidor." }; }
  if (r.status === 401 && rota !== "/login" && rota !== "/senha") { localStorage.removeItem("im_token"); telaLogin(); throw new Error(dados.erro || "Entre de novo."); }
  if (r.status === 403 && dados.trocar_senha) { telaSenha(true); throw new Error(dados.erro); }
  if (!r.ok) { const e = new Error(dados.erro || "Erro " + r.status); e.status = r.status; throw e; }
  return dados;
}
const pode = (...perfis) => BASE && (BASE.usuario.perfil === "admin" || perfis.includes(BASE.usuario.perfil));
const ehAdmin = () => BASE && BASE.usuario.perfil === "admin";

// ------------------------------------------------------- login e senha ---
function telaLogin() {
  document.body.innerHTML = `
    <header><span class="marca"><h1>Imobilizado</h1><span class="tag">CD · Cabana</span></span></header>
    <main class="centro">
      <h2>Entrar</h2>
      <p>Controle de imobilizado do grupo Tôa Tôa.</p>
      <form id="fLogin">
        <label for="lgUsuario">Usuário</label>
        <input id="lgUsuario" type="text" autocomplete="username" autocapitalize="none" required>
        <label for="lgSenha">Senha</label>
        <input id="lgSenha" type="password" autocomplete="current-password" required>
        <div class="erro" id="lgErro"></div>
        <button class="bt-mar bt-grande" type="submit">Entrar</button>
      </form>
    </main>`;
  $("#lgUsuario").focus();
  $("#fLogin").onsubmit = async (e) => {
    e.preventDefault();
    const bt = $("#fLogin button"); bt.disabled = true; $("#lgErro").textContent = "";
    try {
      const r = await api("/login", { body: { login: $("#lgUsuario").value, senha: $("#lgSenha").value } });
      localStorage.setItem("im_token", r.token);
      if (r.usuario.trocar_senha) telaSenha(true, $("#lgSenha").value); else location.reload();
    } catch (er) { $("#lgErro").textContent = er.message; bt.disabled = false; }
  };
}
function telaSenha(obrigatoria = false, atual = "") {
  document.body.innerHTML = `
    <header><span class="marca"><h1>Imobilizado</h1><span class="tag">CD · Cabana</span></span></header>
    <main class="centro">
      <h2>${obrigatoria ? "Crie sua senha" : "Trocar senha"}</h2>
      <p>${obrigatoria ? "Você entrou com uma senha temporária. Escolha uma senha só sua para continuar." : "Digite a senha atual e a nova."}</p>
      <form id="fSenha">
        <label for="snAtual">Senha ${obrigatoria ? "temporária" : "atual"}</label>
        <input id="snAtual" type="password" autocomplete="current-password" required value="${esc(atual)}">
        <label for="snNova">Nova senha (mínimo 6 caracteres)</label>
        <input id="snNova" type="password" autocomplete="new-password" required minlength="6">
        <label for="snNova2">Repita a nova senha</label>
        <input id="snNova2" type="password" autocomplete="new-password" required minlength="6">
        <div class="erro" id="snErro"></div>
        <button class="bt-mar bt-grande" type="submit">Salvar e continuar</button>
        <button class="link" type="button" id="snSair">Sair</button>
      </form>
    </main>`;
  $(atual ? "#snNova" : "#snAtual").focus();
  $("#snSair").onclick = sair;
  $("#fSenha").onsubmit = async (e) => {
    e.preventDefault();
    $("#snErro").textContent = "";
    if ($("#snNova").value !== $("#snNova2").value) { $("#snErro").textContent = "As duas senhas novas não são iguais."; return; }
    try { await api("/senha", { body: { atual: $("#snAtual").value, nova: $("#snNova").value } }); toast("Senha salva."); setTimeout(() => location.reload(), 500); }
    catch (er) { $("#snErro").textContent = er.message; }
  };
}
async function sair() {
  try { await api("/sair", { body: {} }); } catch { /* sai mesmo assim */ }
  localStorage.removeItem("im_token");
  location.href = "index.html";
}

// Abre a página: confere o login, monta o topo e o menu, carrega locais e categorias
async function iniciar(aoCarregar, opcoes = {}) {
  if (!localStorage.getItem("im_token")) return telaLogin();
  try { BASE = await api("/base"); }
  catch (e) { if (e.status) { document.querySelector("main").innerHTML = `<p class="erro">${esc(e.message)}</p>`; } return; }
  const atual = location.pathname.split("/").pop() || "index.html";
  const itens = MENU.filter((m) => !m.perfis || pode(...m.perfis));
  const header = document.createElement("header");
  header.innerHTML = `<a class="marca" href="index.html"><h1>Imobilizado</h1><span class="tag">CD · Cabana</span></a>
    <span class="quem">${esc(BASE.usuario.nome)} · ${esc(BASE.usuario.perfil_nome)}</span>
    <button id="btConta">Conta</button>`;
  const nav = document.createElement("nav");
  nav.className = "menu";
  nav.innerHTML = itens.map((m) => `<a href="${m.arq}" class="${m.arq === atual ? "on" : ""}" data-arq="${m.arq}">${m.nome}</a>`).join("");
  document.body.prepend(nav); document.body.prepend(header);
  $("#btConta").onclick = () => modal(`<h2>${esc(BASE.usuario.nome)}</h2><p class="msg">Usuário <b>${esc(BASE.usuario.login)}</b> · acesso ${esc(BASE.usuario.perfil_nome)}</p>
    <div class="acoes"><button class="bt-cinza" id="mTrocar">Trocar senha</button><button class="bt-verm" id="mSair">Sair</button><button class="bt-link" data-fechar>Fechar</button></div>`,
    (d) => { $("#mTrocar", d).onclick = () => telaSenha(false); $("#mSair", d).onclick = sair; });
  if (opcoes.perfis && !pode(...opcoes.perfis)) { $("main").innerHTML = `<div class="vazio"><b>Seu acesso não abre esta tela.</b>Fale com o ADM se precisar.</div>`; return; }
  if (pode()) api("/alertas").then((a) => { const n = a.baixas_pendentes; const el = nav.querySelector('[data-arq="baixas.html"]'); if (n && el) el.insertAdjacentHTML("beforeend", `<span class="n">${n}</span>`); }).catch(() => {});
  try { await aoCarregar(BASE); } catch (e) { console.error(e); toast(e.message, true); }
}
async function recarregarBase() { const b = await api("/base"); BASE.locais = b.locais; BASE.categorias = b.categorias; }

// ---------------------------------------------------------------- modal ---
function modal(html, aoAbrir) {
  const d = document.createElement("dialog");
  d.className = "modal";
  d.innerHTML = `<div class="corpo">${html}</div>`;
  document.body.appendChild(d);
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-fechar]")) d.close(); });
  d.showModal();
  if (aoAbrir) aoAbrir(d);
  return d;
}
function verImagem(url, titulo = "") { modal(`${titulo ? `<h2>${esc(titulo)}</h2>` : ""}<img class="foto-modal" src="${esc(url)}" alt="${esc(titulo)}"><div class="acoes"><a href="${esc(url)}" target="_blank" rel="noopener">Abrir em outra aba</a><button class="bt-link" data-fechar>Fechar</button></div>`); }
function confirmar(texto, titulo = "Confirmar", botao = "Confirmar") {
  return new Promise((ok) => {
    modal(`<h2>${esc(titulo)}</h2><p class="msg" style="font-size:15px;color:var(--tinta)">${texto}</p><div class="acoes"><button class="bt-mar" id="cSim">${esc(botao)}</button><button class="bt-cinza" data-fechar>Cancelar</button></div>`,
      (d) => { $("#cSim", d).onclick = () => { ok(true); d.close(); }; d.addEventListener("close", () => ok(false)); });
  });
}

// ------------------------------------------------------- locais e categorias ---
const localPorId = (id) => BASE.locais.find((l) => l.id === id);
const nomeLocal = (id, comUnidade = true) => { const l = localPorId(id); return l ? (comUnidade ? l.unidade + " · " : "") + l.nome : "—"; };
const categoriaNome = (id) => BASE.categorias.find((c) => c.id === id)?.nome || "—";

// <div class="sel-add"><select></select><button>+</button></div> — o "+" cria um local na hora
function campoLocal(container, { unidade = null, valor = "", permitirNovo = true, vazio = "Escolha o local", filtro = null } = {}) {
  container.classList.add("sel-add");
  container.innerHTML = `<select></select>${permitirNovo && pode("operador") ? `<button type="button" title="Adicionar local" aria-label="Adicionar local">+</button>` : ""}`;
  const sel = $("select", container);
  const desenhar = (v) => {
    const grupos = ["CD", "Cabana"].filter((u) => !unidade || u === unidade);
    sel.innerHTML = `<option value="">${esc(vazio)}</option>` + grupos.map((u) => {
      const ls = BASE.locais.filter((l) => l.unidade === u && (l.ativo || l.id === v) && (!filtro || filtro(l)));
      return ls.length ? `<optgroup label="${u}">${ls.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join("")}</optgroup>` : "";
    }).join("");
    sel.value = v || "";
  };
  desenhar(valor);
  const bt = $("button", container);
  if (bt) bt.onclick = () => modal(`<h2>Novo local</h2>
      <label>Unidade</label><select id="nlUn"><option value="CD">CD</option><option value="Cabana">Cabana</option></select>
      <label>Nome do local</label><input id="nlNome" type="text" placeholder="Ex.: Bar, Cozinha, Salão">
      <div class="erro" id="nlErro"></div>
      <div class="acoes"><button class="bt-mar" id="nlOk">Adicionar</button><button class="bt-cinza" data-fechar>Cancelar</button></div>`, (d) => {
    if (unidade) { $("#nlUn", d).value = unidade; $("#nlUn", d).disabled = true; } else $("#nlUn", d).value = "Cabana";
    $("#nlNome", d).focus();
    $("#nlOk", d).onclick = async () => {
      try {
        const r = await api("/locais", { body: { unidade: $("#nlUn", d).value, nome: $("#nlNome", d).value } });
        await recarregarBase(); desenhar(r.local.id); sel.dispatchEvent(new Event("change"));
        toast(r.existente ? "Esse local já existia — selecionado." : "Local adicionado."); d.close();
      } catch (e) { $("#nlErro", d).textContent = e.message; }
    };
  });
  return sel;
}
function campoCategoria(container, valor = "") {
  container.classList.add("sel-add");
  container.innerHTML = `<select></select>${pode("operador") ? `<button type="button" title="Nova categoria" aria-label="Nova categoria">+</button>` : ""}`;
  const sel = $("select", container);
  const desenhar = (v) => {
    sel.innerHTML = `<option value="">Escolha a categoria</option>` + BASE.categorias.filter((c) => c.ativo || c.id === v).map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join("");
    sel.value = v || "";
  };
  desenhar(valor);
  const bt = $("button", container);
  if (bt) bt.onclick = () => modal(`<h2>Nova categoria</h2><label>Nome</label><input id="ncNome" type="text" placeholder="Ex.: Móveis, Eletro, Equipamentos de cozinha">
      <div class="erro" id="ncErro"></div><div class="acoes"><button class="bt-mar" id="ncOk">Adicionar</button><button class="bt-cinza" data-fechar>Cancelar</button></div>`, (d) => {
    $("#ncNome", d).focus();
    $("#ncOk", d).onclick = async () => {
      try {
        const r = await api("/categorias", { body: { nome: $("#ncNome", d).value } });
        await recarregarBase(); desenhar(r.categoria.id); sel.dispatchEvent(new Event("change"));
        toast(r.existente ? "Essa categoria já existia — selecionada." : "Categoria adicionada."); d.close();
      } catch (e) { $("#ncErro", d).textContent = e.message; }
    };
  });
  return sel;
}

// ------------------------------------------------------------ escolher o bem ---
let _bensCache = null;
async function carregarBens(forcar = false) {
  if (!_bensCache || forcar) _bensCache = await api("/bens");
  return _bensCache;
}
// Campo de busca de bem. aoEscolher(bem) recebe a linha do resumo (im_v_bens).
async function campoBem(container, aoEscolher, { bemId = null, so = null } = {}) {
  const dados = await carregarBens();
  let bens = dados.bens;
  if (so) bens = bens.filter(so);
  const mostrarBusca = () => {
    container.innerHTML = `<div class="busca-bem"><input type="search" placeholder="Digite a descrição ou o código (sistema ou patrimônio)" autocomplete="off"><div class="res" hidden></div></div>`;
    const inp = $("input", container), res = $(".res", container);
    const listar = () => {
      const t = normBusca(inp.value.trim());
      const achados = bens.filter((b) => !t || normBusca(b.descricao + " " + b.codigo_sistema + " " + b.codigo_patrimonio).includes(t)).slice(0, 40);
      res.hidden = false;
      res.innerHTML = achados.length ? achados.map((b) => `<div class="linha clic" data-id="${b.id}"><div class="txt"><div class="tit">${esc(b.descricao)}</div><div class="sub">Patrim. ${esc(b.codigo_patrimonio || "—")} · Sist. ${esc(b.codigo_sistema || "—")} · ${num(b.disponivel)} disponíve${b.disponivel === 1 ? "l" : "is"}</div></div></div>`).join("")
        : `<div class="vazio"><b>Nenhum bem encontrado.</b></div>`;
    };
    inp.addEventListener("input", listar);
    inp.addEventListener("focus", listar);
    document.addEventListener("click", (e) => { if (!container.contains(e.target)) res.hidden = true; });
    res.addEventListener("click", (e) => { const l = e.target.closest("[data-id]"); if (l) escolher(l.dataset.id); });
  };
  const escolher = (id) => {
    const b = dados.bens.find((x) => x.id === id);
    if (!b) return mostrarBusca();
    container.innerHTML = `<div class="bem-escolhido"><div class="txt"><div class="tit">${esc(b.descricao)}</div><div class="sub">Patrim. ${esc(b.codigo_patrimonio || "—")} · Sist. ${esc(b.codigo_sistema || "—")} · ${esc(b.categoria || "")}</div></div><button type="button" class="bt-link">trocar</button></div>`;
    $("button", container).onclick = () => { mostrarBusca(); aoEscolher(null); $("input", container).focus(); };
    aoEscolher(b);
  };
  if (bemId) escolher(bemId); else mostrarBusca();
}
// Opções "Local · Estado (N disponíveis)" a partir dos saldos do bem
function opcoesSaldo(bemId, dados) {
  return dados.saldos.filter((s) => s.bem_id === bemId && s.quantidade > 0)
    .sort((a, b) => nomeLocal(a.local_id).localeCompare(nomeLocal(b.local_id)) || ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado))
    .map((s) => ({ valor: s.local_id + "|" + s.estado, local_id: s.local_id, estado: s.estado, qtd: s.quantidade, texto: `${nomeLocal(s.local_id)} · ${ESTADO_NOME[s.estado]} (${num(s.quantidade)} disponíve${s.quantidade === 1 ? "l" : "is"})` }));
}

// --------------------------------------------------------------- arquivos ---
function lerComoDataUrl(arquivo) {
  return new Promise((ok, falha) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => falha(new Error("Não consegui ler o arquivo.")); r.readAsDataURL(arquivo); });
}
// Fotos são reduzidas no aparelho (até 1600 px, JPEG) antes de enviar
async function comprimirImagem(arquivo, max = 1600, qualidade = 0.8) {
  const url = await lerComoDataUrl(arquivo);
  const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error("Imagem inválida.")); i.src = url; });
  const fator = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * fator); c.height = Math.round(img.height * fator);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", qualidade);
}
// <label class="arquivo"> com input escondido. tipo: "foto" ou "nf" (PDF ou foto). Devolve { valor(), limpar() }
function campoArquivo(container, { tipo = "foto", texto = "Tirar ou escolher foto", captura = true } = {}) {
  let dado = null;
  const aceita = tipo === "nf" ? "application/pdf,image/*" : "image/*";
  container.innerHTML = `<label class="arquivo"><input type="file" accept="${aceita}" ${tipo === "foto" && captura ? 'capture="environment"' : ""}><span class="txt">📎 ${esc(texto)}</span><span class="nome"></span></label><div class="prev"></div>`;
  const inp = $("input", container), lab = $(".arquivo", container), nome = $(".nome", container), prev = $(".prev", container);
  inp.onchange = async () => {
    const f = inp.files[0]; dado = null; lab.classList.remove("ok"); nome.textContent = ""; prev.innerHTML = "";
    if (!f) return;
    try {
      if (f.type === "application/pdf") {
        if (f.size > 6 * 1024 * 1024) throw new Error("PDF maior que 6 MB.");
        dado = await lerComoDataUrl(f);
      } else if (f.type.startsWith("image/")) {
        dado = await comprimirImagem(f);
        prev.innerHTML = `<img class="previa-img" src="${dado}" alt="Prévia">`;
      } else throw new Error("Envie " + (tipo === "nf" ? "PDF ou foto." : "uma foto."));
      lab.classList.add("ok"); nome.textContent = f.name;
    } catch (e) { toast(e.message, true); inp.value = ""; }
  };
  return { valor: () => dado, limpar: () => { dado = null; inp.value = ""; lab.classList.remove("ok"); nome.textContent = ""; prev.innerHTML = ""; } };
}

// ------------------------------------------------------------ assinatura ---
// Quadro branco para assinar com o dedo (ou mouse). Devolve { vazia(), valor(), limpar() }
function campoAssinatura(container, rotulo = "Assine aqui") {
  container.innerHTML = `<div class="assinatura"><canvas></canvas><div class="linha-base"></div><div class="rotulo">${esc(rotulo)}</div><button type="button" class="limpar">Limpar</button></div>`;
  const cv = $("canvas", container), ctx = cv.getContext("2d");
  let tracos = 0, desenhando = false, ultimo = null;
  const ajustar = () => {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    const copia = tracos ? cv.toDataURL() : null;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0B2A5E";
    if (copia) { const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, r.width, r.height); i.src = copia; }
  };
  const ponto = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); desenhando = true; ultimo = ponto(e); ctx.beginPath(); ctx.arc(ultimo.x, ultimo.y, 1.1, 0, Math.PI * 2); ctx.fillStyle = "#0B2A5E"; ctx.fill(); });
  cv.addEventListener("pointermove", (e) => {
    if (!desenhando) return;
    e.preventDefault();
    const p = ponto(e);
    ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo = p; tracos++;
  });
  const fim = () => { desenhando = false; };
  cv.addEventListener("pointerup", fim); cv.addEventListener("pointercancel", fim);
  $(".limpar", container).onclick = () => { tracos = 0; ctx.clearRect(0, 0, cv.width, cv.height); };
  requestAnimationFrame(ajustar);
  window.addEventListener("resize", () => { if (!desenhando) ajustar(); });
  return { vazia: () => tracos < 8, valor: () => (tracos < 8 ? null : cv.toDataURL("image/png")), limpar: () => $(".limpar", container).click() };
}

// ------------------------------------------------------ histórico em texto ---
function descreverMov(m) {
  const d = m.dados || {};
  const q = num(Math.abs(m.quantidade || 0));
  const est = (e) => (e ? (ESTADO_NOME[e] || e).toLowerCase() : "");
  switch (m.tipo) {
    case "cadastro": return `<b>Cadastro</b>: +${q} ${est(m.estado_destino)} em ${esc(nomeLocal(m.local_destino_id))}${d.fornecedor ? " · " + esc(d.fornecedor) : ""}${d.sem_nf ? " · sem nota fiscal" : ""}`;
    case "entrada": return `<b>Incluir</b> (aquisição nº ${d.entrada}): +${q} ${est(m.estado_destino)} em ${esc(nomeLocal(m.local_destino_id))}${d.fornecedor ? " · " + esc(d.fornecedor) : ""}${d.sem_nf ? " · sem nota fiscal" : ""}`;
    case "emprestimo": case "manutencao": return `<b>${TIPO_SAIDA[m.tipo]} nº ${d.saida}</b>: −${q} ${est(m.estado_origem)} de ${esc(nomeLocal(m.local_origem_id))} para ${esc(d.para || "—")} · prazo ${fmtData(d.prazo_retorno)} · liberado por ${esc(d.liberado_por || "")}`;
    case "devolucao": return `<b>Devolução</b> do ${TIPO_SAIDA[d.tipo_saida] ? TIPO_SAIDA[d.tipo_saida].toLowerCase() : ""} nº ${d.saida}: +${q} em ${esc(nomeLocal(m.local_destino_id))} (${ESTADOS.filter((k) => d[k]).map((k) => d[k] + " " + est(k)).join(", ")})${d.em_aberto ? ` · ${d.em_aberto} ainda em aberto` : ""}`;
    case "transferencia": return `<b>Transferência</b>: ${q} ${est(m.estado_origem)} de ${esc(nomeLocal(m.local_origem_id))} → ${esc(nomeLocal(m.local_destino_id))}${d.levado_por ? " · levado por " + esc(d.levado_por) : ""}${d.obs ? " · " + esc(d.obs) : ""}`;
    case "baixa_pedida": return `<b>Pedido de baixa nº ${d.baixa}</b>: ${q}${m.estado_origem ? " " + est(m.estado_origem) : ""}${d.origem === "saida" ? " (não voltou do nº " + d.saida + ")" : d.origem === "nao_localizado" ? " (não localizado)" : m.local_origem_id ? " de " + esc(nomeLocal(m.local_origem_id)) : ""} · ${esc(d.obs || "")}`;
    case "baixa_aprovada": return `<b>Baixa nº ${d.baixa} aprovada</b>: ${q} saíram do imobilizado`;
    case "baixa_recusada": return `<b>Baixa nº ${d.baixa} recusada</b>: ${q} voltaram · ${esc(d.motivo_recusa || "")}`;
    case "conferencia": {
      const e = d.esperado || {}, c = d.contado || {};
      const te = (e.novo || 0) + (e.bom || 0) + (e.ruim || 0), tc = (c.novo || 0) + (c.bom || 0) + (c.ruim || 0);
      return `<b>Conferência nº ${d.conferencia}</b> em ${esc(nomeLocal(m.local_destino_id))}: esperado ${te}, contado ${tc}${d.falta ? ` · <span class="dif falta">falta ${d.falta} (não localizado)</span>` : ""}${d.sobra ? ` · <span class="dif sobra">sobra ${d.sobra}</span>` : ""}${!d.falta && !d.sobra ? ` · <span class="dif ok">confere</span>` : ""}${d.localizado ? ` · ${d.localizado} achado(s)` : ""} · contado por estado: ${c.novo} novo, ${c.bom} bom, ${c.ruim} ruim`;
    }
    case "localizado": return `<b>Localizado</b>: ${q} ${est(m.estado_destino)} — faltava em ${esc(nomeLocal(m.local_origem_id))}, achado em ${esc(nomeLocal(m.local_destino_id))}${d.obs ? " · " + esc(d.obs) : ""}`;
    case "edicao": {
      const nomes = { descricao: "descrição", codigo_sistema: "cód. sistema", codigo_patrimonio: "patrimônio", categoria_id: "categoria", foto_path: "foto", data_aquisicao: "data de aquisição", fornecedor: "fornecedor", valor_unitario: "valor unitário", garantia_ate: "garantia", vida_util_anos: "prazo de vida", obs: "obs.", nf_path: "nota fiscal", sem_nf: "sem nota" };
      const campos = Object.entries(d.campos || {}).map(([k, [a, b]]) => `${nomes[k] || k}: ${esc(k === "categoria_id" ? categoriaNome(a) : a ?? "—")} → ${esc(k === "categoria_id" ? categoriaNome(b) : b ?? "—")}`).join("; ");
      return `<b>Edição ${d.o_que === "aquisicao" ? "da aquisição nº " + d.entrada : "dos dados"}</b>: ${campos}`;
    }
    default: return esc(m.tipo);
  }
}
function textoPuro(html) { const d = document.createElement("div"); d.innerHTML = html; return d.textContent; }
function listaHistorico(movs, { mostrarBem = false } = {}) {
  if (!movs.length) return `<div class="vazio"><b>Nada registrado ainda.</b></div>`;
  return `<div class="hist-mov">${movs.map((m) => `<div class="linha"><div class="quando">${fmtDataHora(m.quando)}<br>${esc(m.usuario)}</div><div class="txt">${mostrarBem && m.bem ? `<a href="bem.html?id=${m.bem_id}">${esc(m.bem.descricao)}</a> · ` : ""}${descreverMov(m)}</div></div>`).join("")}</div>`;
}
