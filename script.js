const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";
const DESPESAS_URL = "https://despesas-gs.vercel.app/";
// Suporte N1 reajustado: R$ 2.851,31 / 220h mensais (44h semanais) = R$ 12,9605 -> R$ 12,96
const valoresHora = { "Suporte NN": 9.09, "Suporte N1": 12.96, "Suporte N2": 15.91, "Suporte N3": 19.44 };
const TEMPO_SESSAO_MS = 4 * 60 * 60 * 1000; // 4 HORAS
const POLL_SUPORTE_MS = 8000;
const POLL_GESTAO_MS = 10000;
const ST_ARQ = ['FECHADA', 'ARQUIVADA', 'CANCELADO'];

let userData = null;
let allTrips = [];
let despesasList = [];     // status das viagens de despesas (para arquivar projetos fechados)
let colegas = [];
let sharedList = [];
let currentProject = { sigla: '', tipo: '' };
let abaProjetos = 'ATIVOS';
let filtroTecnico = 'TODOS';
let sessionInterval = null;
let pollTimer = null, polling = false, pollPromise = null;
let jaCarregou = false, lastSig = '', lastSharedSig = '', busy = 0;
let colegasPromise = null;
let tecnicosSel = new Set();

const $ = (id) => document.getElementById(id);
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const RX_GESTAO = /Coordena|Ger[eê]ncia/i;
function isGestao() { return !!userData && RX_GESTAO.test(userData.nivel || ''); }
function isTecnico(u) { return !RX_GESTAO.test(u.nivel || ''); }
function low(s) { return String(s == null ? '' : s).toLowerCase(); }
function dataSo(t) { const d = String(t.data || ''); return d.includes('T') ? d.split('T')[0] : d; }

// ===== LOGIN ÚNICO ENTRE SISTEMAS (recebe a sessão vinda do despesas-gs) =====
(function consumirSSO() {
    const m = location.hash.match(/^#sso=(.+)$/);
    if (!m) return;
    try {
        const o = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
        const t = parseInt(o.t, 10);
        if (o && o.u && o.u.login && t && (Date.now() - t < TEMPO_SESSAO_MS)) {
            localStorage.setItem('usuarioAtivo', JSON.stringify(o.u));
            localStorage.setItem('loginTimestamp', String(t));
        }
    } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search);
})();

function irParaDespesas() {
    if (!userData) return;
    const pacote = { u: userData, t: localStorage.getItem('loginTimestamp') || Date.now().toString() };
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(pacote))));
    window.location.href = DESPESAS_URL + '#sso=' + payload;
}

// ===== GERENCIAMENTO DE SESSÃO =====
function iniciarMonitoramentoSessao() {
    if (sessionInterval) clearInterval(sessionInterval);
    sessionInterval = setInterval(() => {
        const loginTime = localStorage.getItem('loginTimestamp');
        if (!loginTime) return logout(true);
        if (Date.now() - parseInt(loginTime) >= TEMPO_SESSAO_MS) {
            showToast('Sua sessão expirou por segurança.', 'warning', 'Tempo Esgotado');
            setTimeout(() => logout(true), 2000);
        }
    }, 30000);
}

function logout(forcarReload = false) {
    pararPolling();
    if (userData) { try { localStorage.removeItem('tripsCache_' + userData.login); } catch (e) {} }
    localStorage.removeItem('usuarioAtivo');
    localStorage.removeItem('loginTimestamp');
    userData = null; allTrips = []; despesasList = []; colegas = []; colegasPromise = null; sharedList = [];
    jaCarregou = false; lastSig = ''; lastSharedSig = '';
    currentProject = { sigla: '', tipo: '' };
    if (sessionInterval) clearInterval(sessionInterval);
    $('globalHeader').classList.add('hidden');
    showView('authView');
    if (forcarReload) window.location.reload();
    else showToast('Você saiu do sistema', 'info', 'Logout');
}

// ===== MÁSCARA E VALIDAÇÃO =====
function mascaraHora(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length >= 3) v = v.substring(0, 2) + ':' + v.substring(2, 4);
    input.value = v;
}

function validarHora(input) {
    if (!input.value) return;
    if (input.value.length === 4 && !input.value.includes(':')) input.value = input.value.substring(0,2) + ':' + input.value.substring(2,4);
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(input.value)) {
        showToast('Formato inválido! Use o padrão 24h (Ex: 14:30)', 'warning', 'Atenção');
        input.value = '';
    }
}

// ===== TOASTS =====
function showToast(message, type = 'info', title = null, duration = 4000) {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const titles = { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Informação' };
    toast.innerHTML = `<div class="toast-icon"><i class="fa-solid ${icons[type]}"></i></div><div class="toast-content"><div class="toast-title">${title || titles[type]}</div><div class="toast-message">${message}</div></div><button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('hiding'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ===== MODAL DE CONFIRMAÇÃO =====
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const { title = 'Confirmar Ação', confirmText = 'Confirmar', cancelText = 'Cancelar', type = 'warning', icon = 'fa-question' } = options;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const icons = { warning: 'fa-triangle-exclamation', danger: 'fa-trash-can', info: 'fa-circle-info' };
        overlay.innerHTML = `<div class="modal-confirm"><div class="modal-header ${type}"><div class="modal-icon"><i class="fa-solid ${icon || icons[type]}"></i></div><h3 class="modal-title">${title}</h3></div><div class="modal-body"><p class="modal-message">${message}</p></div><div class="modal-footer"><button class="modal-btn modal-btn-cancel" id="modalCancel">${cancelText}</button><button class="modal-btn ${type === 'danger' ? 'modal-btn-danger' : 'modal-btn-confirm'}" id="modalConfirm">${confirmText}</button></div></div>`;
        document.body.appendChild(overlay);
        const cleanup = () => { overlay.style.animation = 'fadeIn 0.2s ease-out reverse'; setTimeout(() => overlay.remove(), 200); };
        $('modalConfirm').onclick = () => { cleanup(); resolve(true); };
        $('modalCancel').onclick = () => { cleanup(); resolve(false); };
        overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
    });
}

// ===== INICIALIZAÇÃO =====
window.onload = () => {
    const savedUser = localStorage.getItem('usuarioAtivo');
    const loginTime = localStorage.getItem('loginTimestamp');
    if (savedUser && loginTime && (Date.now() - parseInt(loginTime) < TEMPO_SESSAO_MS)) {
        userData = JSON.parse(savedUser);
        $('globalHeader').classList.remove('hidden');
        showView('projectsView');
        initApp();
        iniciarMonitoramentoSessao();
    } else {
        localStorage.removeItem('usuarioAtivo');
        localStorage.removeItem('loginTimestamp');
        showView('authView');
    }
};

function showView(viewId) {
    ['authView', 'projectsView', 'dashboardView', 'profileView'].forEach(id => $(id).classList.add('hidden'));
    const el = $(viewId);
    el.classList.remove('hidden');
    el.classList.add('fade-in');
}

function toggleAuthView(view) {
    const loginSec = $('loginSection');
    const regSec = $('registerSection');
    if(view === 'register') { loginSec.classList.add('hidden'); regSec.classList.remove('hidden'); regSec.classList.add('fade-in'); }
    else { regSec.classList.add('hidden'); loginSec.classList.remove('hidden'); loginSec.classList.add('fade-in'); }
}

async function fetchAPI(data, btnId, textId, msgId, originalText) {
    const btn = btnId ? $(btnId) : null;
    const textSpan = textId ? $(textId) : null;
    const msgDiv = msgId ? $(msgId) : null;
    if(btn) { btn.disabled = true; btn.classList.add('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = '<span class="loader"></span>'; }
    if(msgDiv) msgDiv.classList.add('hidden');
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
        const result = await response.json();
        if(msgDiv) {
            msgDiv.classList.remove('hidden');
            if(result.success) { msgDiv.className = "text-center text-sm font-semibold mt-3 text-emerald-500"; msgDiv.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${result.message || "Sucesso!"}`; }
            else { msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; msgDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${result.message}`; }
        }
        return result;
    } catch (error) {
        if(msgDiv) { msgDiv.classList.remove('hidden'); msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; msgDiv.innerHTML = `<i class="fa-solid fa-wifi mr-1"></i> Erro de conexão.`; }
        return false;
    } finally {
        if(btn) { btn.disabled = false; btn.classList.remove('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = originalText; }
    }
}

async function postAPI(data) {
    try { const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) }); return await r.json(); }
    catch (e) { return null; }
}

// ===== AUTH & PERFIL =====
$('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'register', nome: $('regNome').value, sobrenome: $('regSobrenome').value, equipe: $('regEquipe').value, nivel: $('regNivel').value, senha: $('regSenha').value };
    const r = await fetchAPI(data, 'btnRegister', 'regText', 'regMsg', '<i class="fa-solid fa-save mr-2"></i> Cadastrar');
    if(r && r.success) { $('registerForm').reset(); showToast(`Seu login é: <b>${r.login}</b>`, 'success', 'Cadastro Realizado!'); setTimeout(() => { $('loginUser').value = r.login; toggleAuthView('login'); }, 2000); }
});

$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'login', login: $('loginUser').value.trim(), senha: $('loginSenha').value };
    const r = await fetchAPI(data, 'btnLogin', 'loginText', 'loginMsg', 'Acessar <i class="fa-solid fa-arrow-right-to-bracket ml-2"></i>');
    if(r && r.success) {
        localStorage.setItem('usuarioAtivo', JSON.stringify(r.user));
        localStorage.setItem('loginTimestamp', Date.now().toString());
        userData = r.user;
        showToast('Bem-vindo ao portal!', 'success', 'Login Realizado');
        $('globalHeader').classList.remove('hidden'); showView('projectsView'); initApp(); iniciarMonitoramentoSessao();
        $('loginForm').reset(); $('loginMsg').classList.add('hidden');
    }
});

function abrirPerfil() {
    if(!userData) return;
    $('profNome').value = userData.nome;
    $('profSobrenome').value = userData.sobrenome;
    $('profNovaSenha').value = '';
    $('profConfirmaSenha').value = '';
    $('msgPerfil').classList.add('hidden');
    showView('profileView');
}

$('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const novaSenha = $('profNovaSenha').value;
    const confirmaSenha = $('profConfirmaSenha').value;
    if(novaSenha && novaSenha !== confirmaSenha) { showToast('As senhas não conferem!', 'error', 'Erro de Validação'); return; }
    const payload = { action: 'updateProfile', login: userData.login, nome: $('profNome').value, sobrenome: $('profSobrenome').value, novaSenha: novaSenha || null };
    const r = await fetchAPI(payload, 'btnSalvarPerfil', 'btnSalvarPerfilTexto', 'msgPerfil', '<i class="fa-solid fa-check mr-2"></i> Salvar Alterações');
    if(r && r.success) {
        showToast('Perfil atualizado com sucesso!', 'success', 'Salvo');
        userData.nome = payload.nome; userData.sobrenome = payload.sobrenome;
        localStorage.setItem('usuarioAtivo', JSON.stringify(userData));
        $('navUserName').textContent = `${userData.nome} ${userData.sobrenome}`;
        if(novaSenha) { $('profNovaSenha').value = ''; $('profConfirmaSenha').value = ''; }
    }
});

// ===== RECUPERAR SENHA =====
let recupLoginSelecionado = null;
let recupTimer = null;

function abrirModalRecuperar() {
    $('modalRecuperar').classList.remove('hidden');
    voltarBuscaRecuperar();
    $('recupLogin').value = '';
    $('recupLogin').focus();
}
function fecharModalRecuperar() { $('modalRecuperar').classList.add('hidden'); recupLoginSelecionado = null; }

function voltarBuscaRecuperar() {
    recupLoginSelecionado = null;
    $('recupStepBusca').classList.remove('hidden');
    $('recupStepSenha').classList.add('hidden');
    $('recupLista').innerHTML = '';
    $('recupNovaSenha').value = '';
    $('recupConfirmaSenha').value = '';
}

function buscarUsuariosRecuperar(imediato = false) {
    clearTimeout(recupTimer);
    recupTimer = setTimeout(executarBuscaRecuperar, imediato ? 0 : 400);
}

async function executarBuscaRecuperar() {
    const q = $('recupLogin').value.trim();
    const lista = $('recupLista');
    if (q.length < 2) { lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Digite pelo menos 2 letras do login.</p>'; return; }
    lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-2"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Buscando...</p>';
    try {
        const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'searchUsers', query: q }) });
        const res = await r.json();
        lista.innerHTML = '';
        if (!res.success || !res.users || res.users.length === 0) {
            lista.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Nenhum usuário encontrado.</p>';
            return;
        }
        res.users.forEach(u => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-full text-left px-3 py-2 mb-1 border rounded bg-slate-50 hover:bg-emerald-50 hover:border-emerald-400 transition flex items-center gap-3';
            const icon = document.createElement('i'); icon.className = 'fa-solid fa-user text-slate-400';
            const box = document.createElement('div');
            const nome = document.createElement('p'); nome.className = 'text-sm font-bold text-slate-800'; nome.textContent = u.nome;
            const login = document.createElement('p'); login.className = 'text-[11px] text-slate-500 font-mono'; login.textContent = u.login;
            box.appendChild(nome); box.appendChild(login);
            btn.appendChild(icon); btn.appendChild(box);
            btn.onclick = () => selecionarUsuarioRecuperar(u);
            lista.appendChild(btn);
        });
    } catch (e) {
        lista.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Erro de conexão.</p>';
    }
}

function selecionarUsuarioRecuperar(u) {
    recupLoginSelecionado = u.login;
    $('recupUsuarioNome').textContent = u.nome;
    $('recupUsuarioLogin').textContent = u.login;
    $('recupStepBusca').classList.add('hidden');
    $('recupStepSenha').classList.remove('hidden');
    $('recupNovaSenha').focus();
}

async function redefinirSenha() {
    const nova = $('recupNovaSenha').value;
    const conf = $('recupConfirmaSenha').value;
    if (!recupLoginSelecionado) { showToast('Selecione um usuário primeiro.', 'warning'); return; }
    if (nova.length < 4) { showToast('A senha deve ter pelo menos 4 caracteres.', 'warning', 'Senha curta'); return; }
    if (nova !== conf) { showToast('As senhas não conferem!', 'error', 'Erro de Validação'); return; }
    const btn = $('btnRedefinirSenha');
    const originalText = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="loader-small"></span> Salvando...';
    try {
        const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'resetPassword', login: recupLoginSelecionado, novaSenha: nova }) });
        const res = await r.json();
        if (res.success) {
            const login = recupLoginSelecionado;
            fecharModalRecuperar();
            $('loginUser').value = login;
            $('loginSenha').value = '';
            showToast('Agora é só entrar com a nova senha.', 'success', 'Senha redefinida');
        } else {
            showToast(res.message || 'Não foi possível redefinir a senha.', 'error', 'Erro');
        }
    } catch (e) { showToast('Erro de conexão', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

// ===== PERFIL DE ACESSO =====
function aplicarPerfil() {
    const g = isGestao();
    $('btnNovoProjeto').classList.toggle('hidden', g);
    $('btnCriarViagemGestao').classList.toggle('hidden', !g);
    $('blocoCompartilhados').classList.toggle('hidden', g);
    $('projetosTitulo').textContent = g ? 'Viagens em Andamento' : 'Meus Projetos Ativos';
    $('projetosSubtitulo').textContent = g
        ? 'Acompanhe ao vivo os apontamentos de horas dos técnicos ou crie uma nova viagem.'
        : 'Selecione uma loja para gerenciar apontamentos ou inicie um novo projeto.';
}

// ===== ABAS: ATIVOS x ARQUIVADOS =====
function garantirAbas() {
    if ($('abasProjetos')) return;
    const div = document.createElement('div');
    div.id = 'abasProjetos'; div.className = 'mb-6 flex gap-2 border-b border-slate-300';
    $('level1Projects').parentNode.insertBefore(div, $('level1Projects'));
}

function setAbaProjetos(a) {
    abaProjetos = a;
    voltarParaLojas();
    renderizarLojas();
}

// Projeto arquivado = todas as despesas de viagem (da mesma loja) dos técnicos envolvidos estão fechadas/arquivadas
function loginsDoProjeto(sigla, tipo) {
    if (!isGestao()) return [low(userData.login)];
    return Array.from(new Set(allTrips.filter(t => t.sigla === sigla && t.tipo === tipo).map(t => low(t._login || t.login)).filter(Boolean)));
}
function projetoArquivado(sigla, tipo) {
    const logins = loginsDoProjeto(sigla, tipo);
    if (!logins.length) return false;
    const S = String(sigla).toUpperCase();
    return logins.every(l => {
        const ds = despesasList.filter(d => String(d.sigla).toUpperCase() === S && low(d.colaborador) === l);
        return ds.length > 0 && ds.every(d => ST_ARQ.includes(d.status));
    });
}
// retorna lista de pares únicos {sigla,tipo,arquivado}
function paresProjetos() {
    const mapa = {};
    allTrips.forEach(t => { const k = t.sigla + '|' + t.tipo; if (!mapa[k]) mapa[k] = { sigla: t.sigla, tipo: t.tipo }; });
    return Object.values(mapa).map(p => Object.assign(p, { arquivado: projetoArquivado(p.sigla, p.tipo) }));
}

function initApp() {
    $('navUserName').textContent = `${userData.nome} ${userData.sobrenome}`;
    $('navUserRole').textContent = `Equipe ${userData.equipe} • ${userData.nivel}`;
    aplicarPerfil();
    garantirAbas();
    abaProjetos = 'ATIVOS';
    voltarParaLojas();
    jaCarregou = false; lastSig = ''; lastSharedSig = '';
    let temCache = false;
    try {
        const c = JSON.parse(localStorage.getItem('tripsCache_' + userData.login) || 'null');
        if (Array.isArray(c) && c.length) { allTrips = c; renderizarLojas(); temCache = true; }
    } catch (e) {}
    if (!temCache) $('level1Projects').innerHTML = '<div class="col-span-full text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl"></i> Buscando projetos...</div>';
    carregarColegas();
    atualizarDados();
    iniciarPolling();
}

// ===== SINCRONIZAÇÃO AUTOMÁTICA =====
function iniciarPolling() {
    pararPolling();
    pollTimer = setInterval(() => { if (!document.hidden && !polling && busy === 0) atualizarDados(); }, isGestao() ? POLL_GESTAO_MS : POLL_SUPORTE_MS);
}
function pararPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && userData) atualizarDados(); });
window.addEventListener('online', () => { if (userData) atualizarDados(); });

function carregarColegas(forcar = false) {
    if (!colegasPromise || forcar) {
        colegasPromise = postAPI({ action: 'getUsers' }).then(d => {
            if (d && d.success) { colegas = d.users || []; preencherSelectShare(); }
            else colegasPromise = null;
            return colegas;
        });
    }
    return colegasPromise;
}

function preencherSelectShare() {
    const sel = $('shareUserSelect'); if (!sel || !userData) return;
    sel.innerHTML = '<option value="">Selecione um colega...</option>';
    colegas.forEach(u => { if (u.login !== userData.login && isTecnico(u)) sel.innerHTML += `<option value="${esc(u.login)}">${esc(u.nome)} (${esc(u.login)})</option>`; });
}

async function buscarTrips() {
    if (!isGestao()) {
        const r = await postAPI({ action: 'getTrips', login: userData.login });
        return (r && r.success) ? (r.trips || []) : null;
    }
    await carregarColegas();
    const tecnicos = colegas.filter(isTecnico);
    if (!tecnicos.length) return null;
    const res = await Promise.all(tecnicos.map(async u => {
        const r = await postAPI({ action: 'getTrips', login: u.login });
        if (r && r.success) return (r.trips || []).map(t => Object.assign({}, t, { _login: u.login, _nome: u.nome }));
        return allTrips.filter(t => t._login === u.login);
    }));
    return [].concat(...res);
}

async function atualizarDados() {
    if (!userData) return;
    while (polling) await pollPromise;
    if (!userData) return;
    polling = true;
    pollPromise = executarAtualizacao();
    try { await pollPromise; } finally { polling = false; }
}

async function executarAtualizacao() {
    try {
        const [trips, shared, desp] = await Promise.all([
            buscarTrips(),
            isGestao() ? Promise.resolve(null) : postAPI({ action: 'getSharedTrips', login: userData.login }),
            postAPI({ action: 'getDespesasViagens', login: userData.login, nivel: userData.nivel })
        ]);
        if (!userData) return;
        if (desp && desp.success) despesasList = (desp.viagens || []).map(v => ({ sigla: v.sigla, colaborador: v.colaborador, status: v.status, motivo: v.motivo }));
        if (trips) aplicarTrips(trips);
        else if (!jaCarregou && allTrips.length === 0) $('level1Projects').innerHTML = '<div class="col-span-full text-center text-amber-600 py-10"><i class="fa-solid fa-wifi mr-1"></i> Não foi possível carregar. Tentando novamente...</div>';
        if (shared && shared.success) renderCompartilhados(shared.shared || []);
    } catch (e) {}
}

function aplicarTrips(trips) {
    if (busy > 0) return;
    const tripsSig = JSON.stringify(trips);
    const sig = tripsSig + '#' + JSON.stringify(despesasList);
    if (sig === lastSig && jaCarregou) return;
    const antes = allTrips.filter(t => !t.isInit).length;
    lastSig = sig;
    allTrips = trips;
    try { localStorage.setItem('tripsCache_' + userData.login, tripsSig); } catch (e) {}
    const depois = trips.filter(t => !t.isInit).length;
    if (jaCarregou && isGestao() && depois > antes) showToast(`${depois - antes} novo(s) apontamento(s) registrado(s).`, 'info', 'Ao vivo');
    jaCarregou = true;
    rerender();
}

function rerender() {
    renderizarLojas();
    if (currentProject.sigla) {
        if (currentProject.tipo === '') abrirLoja(currentProject.sigla);
        else renderizarWorkspace();
    }
}

function renderCompartilhados(lista) {
    const sig = JSON.stringify(lista);
    if (sig === lastSharedSig) return;
    if (lastSharedSig !== '' && lista.length > sharedList.length) showToast('Você recebeu um novo projeto compartilhado.', 'info', 'Compartilhado');
    lastSharedSig = sig; sharedList = lista;
    const el = $('listaCompartilhados'); el.innerHTML = '';
    if (!lista.length) { el.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhum projeto recebido.</p>'; return; }
    lista.forEach((s, i) => {
        el.innerHTML += `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 flex justify-between items-center hover:bg-white hover:border-blue-300 transition group shadow-sm"><div><p class="text-xs font-bold text-slate-800 uppercase">${esc(s.sigla)} - ${esc(s.tipoProjeto)}</p><p class="text-[10px] text-slate-500 mt-1">Enviado por: <b>${esc(s.remetente)}</b> (${s.trips.length} reg.)</p></div><button onclick="usarSharedProject(${i})" class="bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition">Aproveitar Projeto</button></div>`;
    });
}

// ===== LOJAS / CATEGORIAS (com abas Ativos x Arquivados) =====
function renderizarLojas() {
    garantirAbas();
    const grid1 = $('level1Projects');
    const pares = paresProjetos();
    const ativos = pares.filter(p => !p.arquivado), arqs = pares.filter(p => p.arquivado);

    const aba = (id, icon, txt, n) => {
        const on = abaProjetos === id;
        return `<button onclick="setAbaProjetos('${id}')" class="px-4 py-2.5 text-sm font-bold -mb-px border-b-2 transition ${on ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}"><i class="fa-solid ${icon} mr-2"></i>${txt} <span class="ml-1 text-[10px] px-2 py-0.5 rounded-full ${on ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}">${n}</span></button>`;
    };
    $('abasProjetos').innerHTML = aba('ATIVOS', 'fa-layer-group', 'Ativos', ativos.length) + aba('ARQUIVADOS', 'fa-box-archive', 'Arquivados', arqs.length);

    const doTab = abaProjetos === 'ARQUIVADOS' ? arqs : ativos;
    if (doTab.length === 0) {
        const msgVazio = abaProjetos === 'ARQUIVADOS' ? 'Nenhum projeto arquivado.<br>Viagens fechadas aparecem aqui.' : ('Nenhum projeto ativo.<br>' + (isGestao() ? 'Clique em "Criar Viagem" para começar.' : 'Clique em "Novo Projeto" para começar.'));
        grid1.innerHTML = `<div class="col-span-full text-center text-slate-400 py-10 bg-white rounded border border-dashed border-slate-300"><i class="fa-solid ${abaProjetos === 'ARQUIVADOS' ? 'fa-box-archive' : 'fa-folder-open'} text-4xl mb-3"></i><br>${msgVazio}</div>`;
        return;
    }
    const chaves = new Set(doTab.map(p => p.sigla + '|' + p.tipo));
    const lojas = {};
    allTrips.forEach(t => {
        if (!chaves.has(t.sigla + '|' + t.tipo)) return;
        if (!lojas[t.sigla]) lojas[t.sigla] = { regs: 0, tecs: new Set(), cats: new Set() };
        if (!t.isInit) lojas[t.sigla].regs++;
        lojas[t.sigla].cats.add(t.tipo);
        if (isGestao()) lojas[t.sigla].tecs.add(t._nome || t._login || t.login);
    });
    let html = '';
    const arq = abaProjetos === 'ARQUIVADOS';
    Object.keys(lojas).sort().forEach(sigla => {
        const L = lojas[sigla];
        const tecs = isGestao() ? `<p class="text-[11px] text-slate-500 mt-2 line-clamp-2"><i class="fa-solid fa-users mr-1 text-slate-400"></i>${Array.from(L.tecs).map(esc).join(', ')}</p>` : '';
        html += `<div onclick="abrirLoja('${sigla}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 cursor-pointer transition group"><div class="flex justify-between items-start mb-2"><div class="${arq ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'} w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl group-hover:bg-blue-600 group-hover:text-white transition shadow-sm"><i class="fa-solid ${arq ? 'fa-box-archive' : 'fa-store'}"></i></div><span class="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded border">${L.regs} reg.</span></div><h3 class="text-2xl font-black text-slate-800 uppercase tracking-tight mt-2">${esc(sigla)}</h3><p class="text-[11px] text-slate-400 font-semibold">${L.cats.size} categoria(s)</p>${tecs}<p class="text-xs text-slate-500 font-medium mt-2">Acessar pastas da loja <i class="fa-solid fa-arrow-right ml-1"></i></p></div>`;
    });
    grid1.innerHTML = html;
}

function abrirLoja(sigla) {
    currentProject = { sigla: sigla, tipo: '' };
    $('level1Projects').classList.add('hidden');
    $('level2Projects').classList.remove('hidden');
    $('tituloLojaNivel2').textContent = sigla;
    const grid2 = $('gridNivel2'); let html = '';
    const categorias = {};
    const memo = {};
    allTrips.filter(t => t.sigla === sigla).forEach(t => {
        const k = t.tipo;
        if (memo[k] === undefined) memo[k] = projetoArquivado(sigla, t.tipo);
        if (memo[k] !== (abaProjetos === 'ARQUIVADOS')) return;
        if (!categorias[k]) categorias[k] = new Set();
        if (isGestao()) categorias[k].add(t._nome || t._login || t.login);
    });
    const arq = abaProjetos === 'ARQUIVADOS';
    const tipos = Object.keys(categorias).sort();
    if (!tipos.length) { grid2.innerHTML = '<div class="col-span-full text-center text-slate-400 py-8 bg-white rounded border border-dashed">Nenhum projeto nesta aba para esta loja.</div>'; return; }
    tipos.forEach(tipo => {
        const tripsReais = allTrips.filter(t => t.sigla === sigla && t.tipo === tipo && !t.isInit).length;
        const labelReg = tripsReais > 0 ? `${tripsReais} reg.` : 'Novo';
        const tecs = isGestao() ? `<p class="text-[11px] text-slate-500 mt-2 line-clamp-2"><i class="fa-solid fa-users mr-1 text-slate-400"></i>${Array.from(categorias[tipo]).map(esc).join(', ')}</p>` : '';
        html += `<div onclick="abrirWorkspace('${sigla}', '${tipo}')" class="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 cursor-pointer transition group"><div class="flex justify-between items-center mb-3"><div class="${arq ? 'text-slate-400' : 'text-blue-500'} group-hover:text-blue-700 transition"><i class="fa-solid ${arq ? 'fa-box-archive' : 'fa-folder-open'} text-2xl"></i></div><span class="bg-white text-slate-500 text-[10px] font-bold px-2 py-1 rounded shadow-sm">${labelReg}</span></div><h4 class="text-sm font-bold text-slate-800 truncate" title="${esc(tipo)}">${esc(tipo)}</h4>${tecs}<p class="text-[10px] text-slate-400 mt-2 uppercase">${isGestao() ? 'Acompanhar ao vivo' : 'Entrar no Workspace'}</p></div>`;
    });
    grid2.innerHTML = html;
}

function voltarParaLojas() { currentProject = { sigla: '', tipo: '' }; $('level2Projects').classList.add('hidden'); $('level1Projects').classList.remove('hidden'); showView('projectsView'); }
function voltarParaCategorias() { showView('projectsView'); abrirLoja(currentProject.sigla); }

function checkOutros() { const v = $('novoProjTipo').value; if(v === 'Outros') $('novoProjOutros').classList.remove('hidden'); else { $('novoProjOutros').classList.add('hidden'); $('novoProjOutros').value = ''; } }
function abrirModalProjeto() { $('modalProjeto').classList.remove('hidden'); }
function fecharModalProjeto() { $('modalProjeto').classList.add('hidden'); }

async function criarProjeto() {
    const sigla = $('novoProjSigla').value.trim().toUpperCase();
    let tipo = $('novoProjTipo').value;
    if (tipo === 'Outros') tipo = $('novoProjOutros').value.trim();
    if(!sigla) { showToast('Informe a sigla da loja!', 'warning', 'Campo Obrigatório'); return; }
    if(!tipo) { showToast('Informe a categoria do serviço!', 'warning', 'Campo Obrigatório'); return; }
    fecharModalProjeto();
    busy++;
    try {
        await fetchAPI({ action: 'initProject', login: userData.login, sigla: sigla, tipoProjeto: tipo }, null, null, null, null);
    } finally { busy--; }
    await atualizarDados();
    showToast(`Projeto ${sigla} - ${tipo} criado com sucesso!`, 'success', 'Novo Projeto');
    abaProjetos = 'ATIVOS';
    abrirWorkspace(sigla, tipo);
}

// ===== CRIAR VIAGEM (Coordenação / Gerência) - vários técnicos, um único ticket =====
function checkOutrosViagem() { const v = $('novaViagemTipo').value; if (v === 'Outros') $('novaViagemOutros').classList.remove('hidden'); else { $('novaViagemOutros').classList.add('hidden'); $('novaViagemOutros').value = ''; } }

async function abrirModalViagem() {
    $('novaViagemSigla').value = ''; $('novaViagemMotivo').value = ''; $('novaViagemOutros').value = ''; $('buscaTecnico').value = '';
    $('novaViagemTipo').value = 'Inauguração'; checkOutrosViagem();
    tecnicosSel = new Set();
    $('modalViagem').classList.remove('hidden');
    $('listaTecnicos').innerHTML = '<p class="text-xs text-slate-400 text-center py-3"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Carregando técnicos...</p>';
    await carregarColegas();
    renderListaTecnicos();
}
function fecharModalViagem() { $('modalViagem').classList.add('hidden'); }

function atualizarContTecnicos() { $('contTecnicos').textContent = `(${tecnicosSel.size} selecionado${tecnicosSel.size === 1 ? '' : 's'})`; }

function listaTecnicosVisiveis() {
    const q = ($('buscaTecnico').value || '').trim().toLowerCase();
    return colegas.filter(isTecnico).filter(u => (String(u.nome || '') + ' ' + String(u.login || '')).toLowerCase().includes(q));
}

function renderListaTecnicos() {
    const box = $('listaTecnicos'); box.innerHTML = '';
    const lista = listaTecnicosVisiveis();
    if (!lista.length) { box.innerHTML = '<p class="text-xs text-slate-400 text-center py-3">Nenhum técnico encontrado.</p>'; atualizarContTecnicos(); return; }
    lista.forEach(u => {
        const lb = document.createElement('label');
        lb.className = 'flex items-center gap-2 px-3 py-2 border-b text-sm cursor-pointer hover:bg-slate-50';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'h-4 w-4 accent-emerald-600'; cb.checked = tecnicosSel.has(u.login);
        cb.onchange = () => { if (cb.checked) tecnicosSel.add(u.login); else tecnicosSel.delete(u.login); atualizarContTecnicos(); };
        const sp = document.createElement('span'); sp.innerHTML = `<b>${esc(u.nome)}</b> <span class="text-[11px] text-slate-400 font-mono">${esc(u.login)}</span>`;
        lb.appendChild(cb); lb.appendChild(sp); box.appendChild(lb);
    });
    atualizarContTecnicos();
}

function selecionarTodosTecnicos() {
    const vis = listaTecnicosVisiveis();
    const todos = vis.length && vis.every(u => tecnicosSel.has(u.login));
    vis.forEach(u => { if (todos) tecnicosSel.delete(u.login); else tecnicosSel.add(u.login); });
    renderListaTecnicos();
}

async function confirmarCriarViagemGestao() {
    const sigla = $('novaViagemSigla').value.trim().toUpperCase();
    let tipo = $('novaViagemTipo').value;
    if (tipo === 'Outros') tipo = $('novaViagemOutros').value.trim();
    const motivo = $('novaViagemMotivo').value.trim() || tipo;
    let logins = Array.from(tecnicosSel);
    if (!sigla || !tipo) { showToast('Informe a sigla e a categoria.', 'warning', 'Campo Obrigatório'); return; }
    if (!logins.length) { showToast('Selecione ao menos um técnico.', 'warning', 'Campo Obrigatório'); return; }

    // evita duplicar quem já tem despesa ativa na mesma loja + motivo
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const jaExistem = despesasList.filter(d => String(d.sigla).toUpperCase() === sigla && norm(d.motivo) === norm(motivo) && !ST_ARQ.includes(d.status)).map(d => low(d.colaborador));
    const duplicados = logins.filter(l => jaExistem.includes(low(l)));
    if (duplicados.length) {
        showToast(`Já estão nesta viagem: ${duplicados.map(esc).join(', ')}.`, 'warning', 'Ignorados', 6000);
        logins = logins.filter(l => !duplicados.includes(l));
        if (!logins.length) return;
    }

    const idGrupo = 'G' + Date.now();
    const btn = $('btnCriarViagem'); const original = btn.innerHTML; btn.disabled = true;
    busy++;
    const falhas = [];
    try {
        // Sequencial de propósito: evita gravações simultâneas na planilha (ids duplicados)
        for (let i = 0; i < logins.length; i++) {
            btn.innerHTML = `<span class="loader-small"></span> ${i + 1}/${logins.length}`;
            const login = logins[i];
            const a = await postAPI({ action: 'initProject', login, sigla, tipoProjeto: tipo });
            const b = await postAPI({ action: 'createDespesaViagem', sigla, motivo, colaborador: login, criadoPor: userData.login, nivel: userData.nivel, idGrupo });
            if (!(a && a.success) || !(b && b.success)) falhas.push(login);
        }
    } finally { busy--; btn.disabled = false; btn.innerHTML = original; }
    fecharModalViagem();
    if (falhas.length) showToast(`Falha ao criar para: ${falhas.map(esc).join(', ')}`, 'error', 'Atenção', 7000);
    const ok = logins.length - falhas.length;
    if (ok > 0) showToast(`Viagem ${sigla} criada com ${ok} técnico(s): projeto de horas e despesas abertos.`, 'success', 'Viagem Criada');
    abaProjetos = 'ATIVOS';
    atualizarDados();
}

// ===== WORKSPACE =====
function abrirWorkspace(sigla, tipo) {
    currentProject = { sigla: sigla, tipo: tipo };
    filtroTecnico = 'TODOS';
    $('workspaceTitle').textContent = `PROJETO: ${sigla}`;
    $('workspaceSubtitle').textContent = `Categoria: ${tipo}`;
    const g = isGestao();
    ['btnShare', 'btnDelProj'].forEach(id => $(id).classList.toggle('hidden', g));
    $('btnPDF').classList.remove('hidden');
    $('secApontamento').classList.toggle('hidden', g);
    $('painelSuporte').classList.toggle('hidden', g);
    $('painelGestao').classList.toggle('hidden', !g);
    $('secRegistros').classList.toggle('xl:col-span-8', !g);
    $('secRegistros').classList.toggle('xl:col-span-12', g);
    showView('dashboardView'); cancelarEdicao(); renderizarWorkspace();
}

function determinarEscala(equipe, dataViagemStr) {
    const d = new Date(dataViagemStr + "T00:00:00");
    let cycleYear = d.getFullYear(); let cycleMonth = d.getMonth();
    if (d.getDate() < 21) { cycleMonth--; if (cycleMonth < 0) { cycleMonth = 11; cycleYear--; } }
    let monthsPassed = (cycleYear - 2026) * 12 + (cycleMonth - 7);
    let isEvenCycle = (monthsPassed % 2 === 0);
    if (equipe === "Didi") return isEvenCycle ? "Turno Estendido" : "Turno Padrão";
    return isEvenCycle ? "Turno Padrão" : "Turno Estendido";
}

function getMinutosPrevistos(escala, dStr) {
    const dia = new Date(dStr + "T00:00:00").getDay();
    if (dia === 0) return 0;
    if (escala === "Turno Padrão") return (dia <= 5) ? 480 : 240;
    return (dia <= 4) ? 540 : (dia === 5 ? 480 : 0);
}

function timeToMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(m) { return `${m<0?"-":""}${String(Math.floor(Math.abs(m)/60)).padStart(2,'0')}:${String(Math.floor(Math.abs(m)%60)).padStart(2,'0')}`; }
function halveTime(timeStr) { if (!timeStr || timeStr === "00:00") return "00:00"; return minsToTime(timeToMins(timeStr) / 2); }

// Feriado: TODAS as horas trabalhadas contam como extra e o valor a receber é dobrado.
function calcularApontamento(dV, entrada, inicioAlmoco, fimAlmoco, saida, feriado, equipe, nivel) {
    let minsTrab = 0;
    if (inicioAlmoco && fimAlmoco && inicioAlmoco !== "00:00" && fimAlmoco !== "00:00") minsTrab = (timeToMins(inicioAlmoco) - timeToMins(entrada)) + (timeToMins(saida) - timeToMins(fimAlmoco));
    else minsTrab = timeToMins(saida) - timeToMins(entrada);
    const diaSemana = new Date(dV + "T00:00:00").getDay();
    const escala = determinarEscala(equipe, dV);
    let mExt;
    if (feriado) {
        mExt = minsTrab < 0 ? 0 : minsTrab;
    } else {
        mExt = minsTrab - getMinutosPrevistos(escala, dV); if (mExt < 0) mExt = 0;
        if (diaSemana === 0) mExt = mExt * 2;
    }
    const vHora = valoresHora[nivel] || 0;
    const multiplicador = feriado ? 2 : 1;
    return { escala, minsTrab, mExt, vHora, totalReceber: (mExt / 60) * vHora * multiplicador };
}

function cancelarEdicao() {
    $('tripForm').reset(); $('editTripId').value = '';
    $('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    $('btnSalvar').classList.replace('bg-orange-500', 'bg-blue-600');
    $('btnSalvar').classList.replace('hover:bg-orange-600', 'hover:bg-blue-700');
}

function carregarParaEdicao(idTrip) {
    const t = allTrips.find(x => x.idViagem === idTrip); if(!t) return;
    $('editTripId').value = t.idViagem;
    $('dataTrabalho').value = t.data.split('T')[0];
    $('hrEntrada').value = t.entrada;
    $('hrInicioAlmoco').value = t.inicioAlmoco || "";
    $('hrFimAlmoco').value = t.fimAlmoco || "";
    $('hrSaida').value = t.saida;
    $('chkFeriado').checked = !!t.feriado;
    $('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento';
    $('btnSalvar').classList.replace('bg-blue-600', 'bg-orange-500');
    $('btnSalvar').classList.replace('hover:bg-blue-700', 'hover:bg-orange-600');
    showToast('Registro carregado para edição', 'info', 'Editar');
}

$('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = $('editTripId').value !== '';
    const btnId = 'btnSalvar'; const msgId = 'msgSalvar';
    const originalText = isEdit ? '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento' : '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    $(btnId).disabled = true;
    $('btnSalvarTexto').innerHTML = '<span class="loader-small"></span> Aguarde...';
    const dV = $('dataTrabalho').value;
    const hrEntrada = $('hrEntrada').value;
    const hrSaida = $('hrSaida').value;
    const hrInicioAlmoco = $('hrInicioAlmoco').value;
    const hrFimAlmoco = $('hrFimAlmoco').value;
    const isFeriado = $('chkFeriado').checked;
    const calc = calcularApontamento(dV, hrEntrada, hrInicioAlmoco, hrFimAlmoco, hrSaida, isFeriado, userData.equipe, userData.nivel);
    const payload = { action: isEdit ? 'editTrip' : 'saveTrip', idViagem: $('editTripId').value, login: userData.login, sigla: currentProject.sigla, tipoProjeto: currentProject.tipo, data: dV, escala: calc.escala, entrada: hrEntrada, inicioAlmoco: hrInicioAlmoco || "", fimAlmoco: hrFimAlmoco || "", saida: hrSaida, totalHoras: minsToTime(calc.minsTrab), horasExtras: minsToTime(calc.mExt), valorHoraExtra: calc.vHora, totalReceber: calc.totalReceber, feriado: isFeriado };
    busy++;
    let r;
    try { r = await fetchAPI(payload, btnId, 'btnSalvarTexto', msgId, originalText); } finally { busy--; }
    if(r && r.success) {
        const idLocal = isEdit ? payload.idViagem : (r.idViagem || r.id || ('tmp_' + Date.now()));
        const local = Object.assign({}, payload, { idViagem: idLocal, tipo: payload.tipoProjeto });
        delete local.action;
        if (isEdit) allTrips = allTrips.map(t => t.idViagem === idLocal ? Object.assign({}, t, local) : t);
        else allTrips.push(local);
        showToast(isEdit ? 'Registro atualizado!' : 'Apontamento registrado!', 'success', isEdit ? 'Atualizado' : 'Salvo');
        cancelarEdicao(); renderizarLojas(); renderizarWorkspace();
        setTimeout(() => $(msgId).classList.add('hidden'), 3000);
        atualizarDados();
    }
});

async function deletarRegistro(idViagem) {
    const confirmed = await showConfirm('Tem certeza que deseja excluir este registro permanentemente?', { title: 'Excluir Registro', confirmText: 'Sim, Excluir', type: 'danger', icon: 'fa-trash' });
    if(!confirmed) return;
    const backup = allTrips;
    allTrips = allTrips.filter(t => t.idViagem !== idViagem); rerender();
    busy++;
    let r;
    try { r = await fetchAPI({ action: 'deleteTrip', login: userData.login, idViagem: idViagem }, null, null, null, null); } finally { busy--; }
    if(r && r.success) { showToast('Registro excluído com sucesso!', 'success', 'Excluído'); atualizarDados(); }
    else { allTrips = backup; rerender(); showToast((r && r.message) || 'Falha ao excluir.', 'error', 'Erro'); }
}

async function deletarProjeto() {
    const confirmed = await showConfirm(`Excluir o projeto ${currentProject.sigla} e TODOS os lançamentos dele?<br><br><strong>Esta ação não pode ser desfeita.</strong>`, { title: 'Excluir Projeto Completo', confirmText: 'Sim, Excluir Tudo', type: 'danger', icon: 'fa-trash-can' });
    if(!confirmed) return;
    const { sigla, tipo } = currentProject;
    const backup = allTrips;
    allTrips = allTrips.filter(t => !(t.sigla === sigla && t.tipo === tipo));
    renderizarLojas(); voltarParaCategorias();
    busy++;
    let r;
    try { r = await fetchAPI({ action: 'deleteProject', login: userData.login, sigla: sigla, tipoProjeto: tipo }, null, null, null, null); } finally { busy--; }
    if(r && r.success) { showToast('Projeto excluído permanentemente!', 'success', 'Projeto Excluído'); atualizarDados(); }
    else { allTrips = backup; rerender(); showToast((r && r.message) || 'Falha ao excluir o projeto.', 'error', 'Erro'); }
}

function obterDiaSemana(dataString) { const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; return dias[new Date(dataString + "T00:00:00").getDay()]; }

function renderizarWorkspace() {
    if (isGestao()) return renderizarWorkspaceGestao();
    const tbH = $('tbHoras'); const tbF = $('tbFinanceiro');
    let htmlH = '', htmlF = '';
    const projTrips = allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo && !t.isInit);
    let valorTotal = 0;
    if(projTrips.length > 0) {
        projTrips.sort((a, b) => new Date(b.data) - new Date(a.data));
        projTrips.forEach(t => {
            const dateStr = t.data.includes('T') ? t.data.split('T')[0] : t.data;
            const diaSemanaInt = new Date(dateStr + "T00:00:00").getDay();
            const df = dateStr.split('-').reverse().join('/') + ` (${obterDiaSemana(dateStr)})`;
            let horasExibicaoAtividades = t.horasExtras;
            if (diaSemanaInt === 0 && !t.feriado) horasExibicaoAtividades = halveTime(t.horasExtras);
            const badgeFeriado = t.feriado ? ' <span class="ml-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300">FERIADO</span>' : '';
            const taxaExibida = Number(t.valorHoraExtra) * (t.feriado ? 2 : 1);
            const hExt = horasExibicaoAtividades !== '00:00';
            valorTotal += Number(t.totalReceber);
            htmlH += `<tr class="hover:bg-slate-50 border-b transition-colors"><td class="px-4 py-3 text-sm text-slate-600">${df}${badgeFeriado}</td><td class="px-4 py-3 text-xs"><span class="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">${t.escala}</span></td><td class="px-4 py-3 text-center font-bold ${hExt?'text-blue-600':'text-slate-400'}">${horasExibicaoAtividades}</td><td class="px-4 py-3 text-center space-x-3" data-pdf-ignore="true"><button onclick="carregarParaEdicao('${t.idViagem}')" class="text-slate-400 hover:text-orange-500 transition" title="Editar"><i class="fa-solid fa-pen"></i></button><button onclick="deletarRegistro('${t.idViagem}')" class="text-slate-400 hover:text-red-500 transition" title="Excluir"><i class="fa-solid fa-trash"></i></button></td></tr>`;
            htmlF += `<tr class="hover:bg-slate-50 border-b transition-colors"><td class="px-4 py-3 text-sm text-slate-600">${df}${badgeFeriado}</td><td class="px-4 py-3 text-center font-mono text-slate-600">${t.horasExtras}</td><td class="px-4 py-3 text-right text-slate-500">R$ ${taxaExibida.toFixed(2).replace('.', ',')}${t.feriado ? ' <span class="text-[10px] text-amber-600 font-bold">(2x)</span>' : ''}</td><td class="px-4 py-3 text-right font-bold text-emerald-600">R$ ${Number(t.totalReceber).toFixed(2).replace('.', ',')}</td></tr>`;
        });
        tbH.innerHTML = htmlH; tbF.innerHTML = htmlF;
        $('valorTotalProjeto').textContent = `R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
    } else {
        tbH.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Nenhum registro para este projeto.</td></tr>';
        tbF.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Nenhuma movimentação.</td></tr>';
        $('valorTotalProjeto').textContent = 'R$ 0,00';
    }
}

// ===== VISÃO DA COORDENAÇÃO/GERÊNCIA: organizada por técnico =====
// horas extras: regulares / domingo (exibe metade, pois o valor guardado é dobrado) / feriado
function resumoTrips(list) {
    let reg = 0, dom = 0, fer = 0;
    list.forEach(t => {
        const ds = dataSo(t);
        const dow = new Date(ds + 'T00:00:00').getDay();
        if (t.feriado) fer += timeToMins(t.horasExtras);
        else if (dow === 0) dom += timeToMins(halveTime(t.horasExtras));
        else reg += timeToMins(t.horasExtras);
    });
    return { reg, dom, fer, total: reg + dom + fer, dias: list.length };
}
function horasExibicao(t) {
    const dow = new Date(dataSo(t) + 'T00:00:00').getDay();
    return (dow === 0 && !t.feriado) ? halveTime(t.horasExtras) : t.horasExtras;
}

function tecnicosDoProjeto() {
    const mapa = {};
    allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo).forEach(t => {
        const login = t._login || t.login;
        if (!login) return;
        if (!mapa[login]) mapa[login] = { login, nome: t._nome || login, trips: [] };
        if (!t.isInit) mapa[login].trips.push(t);
    });
    return Object.values(mapa).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
}

function setFiltroTecnico(login) { filtroTecnico = login; renderizarWorkspaceGestao(); }

function renderizarWorkspaceGestao() {
    let box = $('gestaoConteudo');
    if (!box) {
        const sc = $('painelGestao').querySelector('.overflow-auto');
        sc.innerHTML = '<div id="gestaoConteudo" class="p-4 space-y-5"></div>';
        box = $('gestaoConteudo');
    }
    const todos = tecnicosDoProjeto();
    if (filtroTecnico !== 'TODOS' && !todos.some(t => t.login === filtroTecnico)) filtroTecnico = 'TODOS';
    const exibidos = filtroTecnico === 'TODOS' ? todos : todos.filter(t => t.login === filtroTecnico);
    const totalRegs = exibidos.reduce((a, t) => a + t.trips.length, 0);
    $('gestaoResumo').textContent = `${totalRegs} registro(s) • ${exibidos.length} técnico(s) • atualização automática`;

    if (!todos.length) { box.innerHTML = '<p class="p-8 text-center text-slate-400">Nenhum técnico neste projeto.</p>'; return; }

    // chips de filtro
    const chip = (id, txt, on) => `<button onclick="setFiltroTecnico('${esc(id)}')" class="${on ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border'} px-3 py-1.5 rounded-full font-bold text-xs shadow-sm transition whitespace-nowrap">${esc(txt)}</button>`;
    let html = `<div class="flex gap-2 flex-wrap items-center"><span class="text-[10px] font-bold uppercase text-slate-400 mr-1">Técnico:</span>${chip('TODOS', `Todos (${todos.length})`, filtroTecnico === 'TODOS')}${todos.map(t => chip(t.login, t.nome, filtroTecnico === t.login)).join('')}</div>`;

    // faixa de resumo geral
    const geral = resumoTrips([].concat(...exibidos.map(t => t.trips)));
    const tile = (lbl, val, cor) => `<div class="bg-slate-50 border rounded-lg px-4 py-3"><p class="text-[10px] font-bold uppercase tracking-wider text-slate-400">${lbl}</p><p class="text-xl font-black ${cor} font-mono">${val}</p></div>`;
    html += `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">${tile('Total horas extras', minsToTime(geral.total), 'text-blue-600')}${tile('Regulares', minsToTime(geral.reg), 'text-slate-700')}${tile('Domingos', minsToTime(geral.dom), 'text-slate-700')}${tile('Feriados', minsToTime(geral.fer), 'text-amber-600')}</div>`;

    // um cartão por técnico
    exibidos.forEach(tec => {
        const trips = tec.trips.slice().sort((a, b) => (new Date(b.data) - new Date(a.data)) || String(b.entrada).localeCompare(String(a.entrada)));
        const r = resumoTrips(trips);
        let linhas = '';
        if (!trips.length) linhas = '<tr><td colspan="4" class="p-6 text-center text-slate-400 text-sm">Nenhum apontamento lançado ainda.</td></tr>';
        trips.forEach(t => {
            const ds = dataSo(t);
            const df = ds.split('-').reverse().join('/') + ` (${obterDiaSemana(ds)})`;
            const horas = horasExibicao(t);
            const badge = t.feriado ? ' <span class="ml-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-amber-300">FERIADO</span>' : '';
            const pausa = (t.inicioAlmoco && t.fimAlmoco) ? `${esc(t.inicioAlmoco)} / ${esc(t.fimAlmoco)}` : 'Sem pausa';
            const hExt = horas !== '00:00';
            linhas += `<tr class="hover:bg-slate-50 border-b transition-colors"><td class="px-4 py-2.5 text-sm text-slate-600">${df}${badge}</td><td class="px-4 py-2.5 text-center font-mono text-xs text-slate-600">${esc(t.entrada)} - ${pausa} - ${esc(t.saida)}</td><td class="px-4 py-2.5 text-xs"><span class="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">${esc(t.escala)}</span></td><td class="px-4 py-2.5 text-center font-bold ${hExt ? 'text-blue-600' : 'text-slate-400'}">${horas}</td></tr>`;
        });
        html += `<div class="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div class="bg-slate-50 px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-slate-800 text-emerald-400 flex items-center justify-center font-black">${esc(String(tec.nome).charAt(0).toUpperCase())}</div>
              <div><p class="text-sm font-bold text-slate-800 leading-tight">${esc(tec.nome)}</p><p class="text-[11px] text-slate-400 font-mono">${esc(tec.login)} • ${r.dias} dia(s) lançado(s)</p></div></div>
            <div class="flex items-center gap-4 text-right">
              <div class="hidden sm:block text-[11px] text-slate-500 leading-tight">Regulares <b class="font-mono text-slate-700">${minsToTime(r.reg)}</b><br>Domingo <b class="font-mono text-slate-700">${minsToTime(r.dom)}</b> • Feriado <b class="font-mono text-amber-600">${minsToTime(r.fer)}</b></div>
              <div><p class="text-[10px] uppercase font-bold text-slate-400">Horas extras</p><p class="text-xl font-black text-blue-600 font-mono leading-none">${minsToTime(r.total)}</p></div>
            </div>
          </div>
          <div class="overflow-auto custom-scrollbar max-h-72"><table class="min-w-full text-sm text-left"><thead class="bg-white sticky top-0 border-b"><tr><th class="px-4 py-2 font-bold text-slate-500 uppercase text-[10px]">Data</th><th class="px-4 py-2 font-bold text-slate-500 uppercase text-[10px] text-center">Entrada / Pausa / Saída</th><th class="px-4 py-2 font-bold text-slate-500 uppercase text-[10px]">Escala</th><th class="px-4 py-2 font-bold text-blue-600 uppercase text-[10px] text-center">Horas Extras</th></tr></thead><tbody class="divide-y divide-slate-100">${linhas}</tbody></table></div>
        </div>`;
    });
    // preserva scroll ao atualizar ao vivo
    const sc = box.parentElement; const st = sc ? sc.scrollTop : 0;
    box.innerHTML = html;
    if (sc) sc.scrollTop = st;
}

// ===== COMPARTILHAMENTO =====
async function usarSharedProject(idx) {
    const sharedData = sharedList[idx]; if (!sharedData) return;
    const confirmed = await showConfirm(`Importar ${sharedData.trips.length} apontamentos do projeto ${esc(sharedData.sigla)}?<br><br>O sistema irá recalcular usando <strong>SUA escala</strong> e <strong>SEU valor/hora</strong>.`, { title: 'Importar Projeto Compartilhado', confirmText: 'Sim, Importar', type: 'info', icon: 'fa-download' });
    if(!confirmed) return;
    $('msgRecebendo').classList.remove('hidden');
    const novasViagensRecalculadas = sharedData.trips.map(trip => {
        const dV = trip.data.includes('T') ? trip.data.split('T')[0] : trip.data;
        const feriado = !!trip.feriado;
        const calc = calcularApontamento(dV, trip.entrada, trip.inicioAlmoco, trip.fimAlmoco, trip.saida, feriado, userData.equipe, userData.nivel);
        return { login: userData.login, sigla: sharedData.sigla, tipoProjeto: sharedData.tipoProjeto, data: dV, escala: calc.escala, entrada: trip.entrada, inicioAlmoco: trip.inicioAlmoco || "", fimAlmoco: trip.fimAlmoco || "", saida: trip.saida, totalHoras: minsToTime(calc.minsTrab), horasExtras: minsToTime(calc.mExt), valorHoraExtra: calc.vHora, totalReceber: calc.totalReceber, feriado: feriado };
    });
    busy++;
    let r;
    try { r = await fetchAPI({ action: 'saveMultipleTrips', trips: novasViagensRecalculadas, idCompartilhamento: sharedData.idShare }, null, null, null, null); } finally { busy--; }
    $('msgRecebendo').classList.add('hidden');
    if(r && r.success) { showToast('Projeto importado e recalculado com sucesso!', 'success', 'Importação Concluída'); atualizarDados(); }
}

function abrirModalShare() { preencherSelectShare(); $('modalShare').classList.remove('hidden'); }
function fecharModalShare() { $('modalShare').classList.add('hidden'); $('shareUserSelect').value = ''; }

async function confirmarShare() {
    const dest = $('shareUserSelect').value;
    if(!dest) { showToast('Selecione um colega para compartilhar!', 'warning', 'Campo Obrigatório'); return; }
    const btn = $('btnConfirmShare'); btn.innerHTML = 'Enviando...'; btn.disabled = true;
    await postAPI({ action: 'shareTrip', remetente: userData.login, destinatario: dest, sigla: currentProject.sigla, tipoProjeto: currentProject.tipo });
    btn.innerHTML = 'Enviar Projeto'; btn.disabled = false; fecharModalShare();
    showToast('Projeto compartilhado com sucesso!', 'success', 'Compartilhado');
}

// ===== LOGO PARA O PDF =====
async function carregarLogoPDF() {
    try {
        const resp = await fetch('logo.png', { cache: 'force-cache' });
        if (!resp.ok) return null;
        const blob = await resp.blob();
        const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        const dim = await new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = dataUrl; });
        if (!dim || !dim.w) return null;
        return { dataUrl, w: dim.w, h: dim.h, fmt: /jpe?g/i.test(blob.type) ? 'JPEG' : 'PNG' };
    } catch (e) { return null; }
}

// ===== PDF DA COORDENAÇÃO / GERÊNCIA (profissional, com logo da TI) =====
async function gerarPDFGestao() {
    const todos = tecnicosDoProjeto();
    const alvo = (filtroTecnico === 'TODOS' ? todos : todos.filter(t => t.login === filtroTecnico)).filter(t => t.trips.length > 0);
    if (!alvo.length) { showToast('Não há apontamentos para exportar.', 'warning', 'Sem dados'); return; }

    const incluirSomadas = await showConfirm(
        'Deseja incluir a coluna "Horas somadas" (domingo e feriado contados em dobro) no resumo?',
        { title: 'Opções do Relatório', confirmText: 'Sim, Incluir', cancelText: 'Não, Apenas Extras', type: 'info', icon: 'fa-file-pdf' }
    );

    const logo = await carregarLogoPDF();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const W = doc.internal.pageSize.getWidth();
    const agora = new Date();
    const emitidoEm = `${agora.toLocaleDateString('pt-BR')} às ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const emitidoPor = `${userData.nome} ${userData.sobrenome}`;

    // ---- Cabeçalho ----
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 32, 'F');
    doc.setFillColor(37, 99, 235); doc.rect(0, 32, W, 1.6, 'F');
    let xTexto = 14;
    if (logo) {
        doc.setFillColor(255, 255, 255); doc.roundedRect(12, 5, 36, 22, 2, 2, 'F');
        const maxW = 32, maxH = 18, esc_ = Math.min(maxW / logo.w, maxH / logo.h);
        const lw = logo.w * esc_, lh = logo.h * esc_;
        try { doc.addImage(logo.dataUrl, logo.fmt, 12 + (36 - lw) / 2, 5 + (22 - lh) / 2, lw, lh); } catch (e) {}
        xTexto = 54;
    }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Relatório de Viagem - Horas Extras', xTexto, 15);
    doc.setFontSize(10); doc.setTextColor(147, 197, 253); doc.text('TI Claudino S/A  |  Gestão de Viagens - Suporte', xTexto, 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(203, 213, 225);
    doc.text(`Emitido em ${emitidoEm}`, W - 12, 13, { align: 'right' });
    doc.text(`por ${emitidoPor}`, W - 12, 18, { align: 'right' });

    // ---- Dados do projeto ----
    const todasTrips = [].concat(...alvo.map(t => t.trips));
    const datas = todasTrips.map(dataSo).sort();
    const fmtD = d => d.split('-').reverse().join('/');
    const periodo = datas.length ? (datas[0] === datas[datas.length - 1] ? fmtD(datas[0]) : `${fmtD(datas[0])} a ${fmtD(datas[datas.length - 1])}`) : '-';
    let y = 42;
    doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252); doc.roundedRect(12, y, W - 24, 28, 2, 2, 'FD');
    const campo = (rot, val, x, yy) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text(rot.toUpperCase(), x, yy);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.text(String(val), x, yy + 5.5);
    };
    campo('Loja (Sigla)', currentProject.sigla, 18, y + 7);
    campo('Categoria do serviço', currentProject.tipo, 70, y + 7);
    campo('Período', periodo, 130, y + 7);
    campo('Técnicos', `${alvo.length} ${alvo.length === 1 ? 'técnico' : 'técnicos'}`, 18, y + 19);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(100, 116, 139); doc.text('PARTICIPANTES', 70, y + 19);
    doc.setFontSize(9); doc.setTextColor(15, 23, 42);
    const part = doc.splitTextToSize(alvo.map(t => t.nome).join(', '), W - 24 - 62);
    doc.text(part.slice(0, 2), 70, y + 24);
    y += 36;

    // ---- Resumo por técnico ----
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 41, 59); doc.text('Resumo por Técnico', 14, y);
    const linhasResumo = alvo.map(t => { const r = resumoTrips(t.trips); const row = [t.nome, String(r.dias), minsToTime(r.reg), minsToTime(r.dom), minsToTime(r.fer), minsToTime(r.total)]; if (incluirSomadas) row.push(minsToTime(r.total + r.dom + r.fer)); return row; });
    const G = resumoTrips(todasTrips);
    const rodape = ['TOTAL GERAL', String(G.dias), minsToTime(G.reg), minsToTime(G.dom), minsToTime(G.fer), minsToTime(G.total)]; if (incluirSomadas) rodape.push(minsToTime(G.total + G.dom + G.fer));
    const cabResumo = ['Técnico', 'Dias', 'Regulares', 'Domingo', 'Feriado', 'Total Extras']; if (incluirSomadas) cabResumo.push('Horas Somadas');
    const colEst = { 0: { halign: 'left', fontStyle: 'bold' } }; for (let i = 1; i < cabResumo.length; i++) colEst[i] = { halign: 'center', font: 'courier' };
    colEst[5] = { halign: 'center', font: 'courier', fontStyle: 'bold', textColor: [37, 99, 235] };
    doc.autoTable({
        startY: y + 3, head: [cabResumo], body: linhasResumo, foot: [rodape], theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3.5, lineColor: [203, 213, 225], lineWidth: 0.1 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center' },
        footStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontStyle: 'bold', halign: 'center', font: 'courier' },
        columnStyles: colEst, alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: 14, right: 14 }
    });
    y = doc.lastAutoTable.finalY + 10;

    // ---- Detalhamento por técnico ----
    alvo.forEach(tec => {
        if (y > 245) { doc.addPage(); y = 18; }
        const r = resumoTrips(tec.trips);
        doc.setFillColor(30, 41, 59); doc.roundedRect(14, y, W - 28, 9, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255); doc.text(tec.nome, 18, y + 6);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(147, 197, 253);
        doc.text(`${tec.login}  |  ${r.dias} dia(s)  |  Total extras: ${minsToTime(r.total)}`, W - 18, y + 6, { align: 'right' });

        const trips = tec.trips.slice().sort((a, b) => new Date(a.data) - new Date(b.data));
        const corpo = trips.map(t => {
            const ds = dataSo(t);
            const pausa = (t.inicioAlmoco && t.fimAlmoco) ? `${t.inicioAlmoco} / ${t.fimAlmoco}` : 'Sem pausa';
            return [`${fmtD(ds)} (${obterDiaSemana(ds)})${t.feriado ? ' - FERIADO' : ''}`, `${t.entrada} - ${pausa} - ${t.saida}`, t.escala || '', t.totalHoras || '-', horasExibicao(t)];
        });
        doc.autoTable({
            startY: y + 11, head: [['Data', 'Entrada - Pausa / Retorno - Saída', 'Escala', 'Trabalhadas', 'Horas Extras']], body: corpo, theme: 'grid',
            styles: { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.1 },
            headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 8 },
            columnStyles: { 0: { cellWidth: 42 }, 1: { halign: 'center', font: 'courier' }, 2: { halign: 'center', cellWidth: 30 }, 3: { halign: 'center', font: 'courier', cellWidth: 24 }, 4: { halign: 'center', font: 'courier', fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 26 } },
            alternateRowStyles: { fillColor: [248, 250, 252] }, margin: { left: 14, right: 14 }
        });
        y = doc.lastAutoTable.finalY + 10;
    });

    // ---- Assinaturas ----
    if (y > 235) { doc.addPage(); y = 18; }
    y += 22;
    doc.setDrawColor(51, 65, 85); doc.setLineWidth(0.3);
    doc.line(20, y, 90, y); doc.line(W - 90, y, W - 20, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(71, 85, 105);
    doc.text('Técnico(s) responsável(is)', 55, y + 5, { align: 'center' });
    doc.text('Coordenação / Gerência', W - 55, y + 5, { align: 'center' });

    // ---- Rodapé em todas as páginas ----
    const n = doc.internal.getNumberOfPages(), H = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.2); doc.line(14, H - 14, W - 14, H - 14);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(148, 163, 184);
        doc.text('TI Claudino S/A  |  Gestão de Viagens', 14, H - 9);
        doc.text(`Página ${i} de ${n}`, W - 14, H - 9, { align: 'right' });
        doc.text(`Gerado em ${emitidoEm}`, W / 2, H - 9, { align: 'center' });
    }

    const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
    doc.save(`Relatorio_Horas_${slug(currentProject.sigla)}_${slug(currentProject.tipo)}_${agora.toISOString().slice(0, 10)}.pdf`);
    showToast('PDF gerado com sucesso!', 'success', 'Exportação Concluída');
}

// ===== GERAR PDF =====
async function gerarPDF() {
    if (isGestao()) return gerarPDFGestao();

    const includeSomadas = await showConfirm(
        'Deseja incluir a linha "TOTAL HORAS SOMADAS" no relatório?',
        { title: 'Opções do Relatório', confirmText: 'Sim, Incluir', cancelText: 'Não, Apenas Extras', type: 'info', icon: 'fa-file-pdf' }
    );

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16); doc.setTextColor(30, 41, 59);
    doc.text(`Relatório de Viagens - ${currentProject.sigla}`, 14, 15);
    doc.setFontSize(10); doc.setTextColor(71, 85, 105);
    doc.text(`Técnico(a): ${userData.nome} ${userData.sobrenome}`, 14, 22);
    doc.text(`Serviço: ${currentProject.tipo} | Equipe: ${userData.equipe} | Nível: ${userData.nivel}`, 14, 28);

    const projTrips = allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo && !t.isInit);
    projTrips.sort((a, b) => new Date(a.data) - new Date(b.data));

    let minRegulares = 0, minDomingoReal = 0, minFeriado = 0;

    const tableData = projTrips.map(t => {
        const dateStr = t.data.includes('T') ? t.data.split('T')[0] : t.data;
        const df = dateStr.split('-').reverse().join('/');
        const diaSemanaInt = new Date(dateStr + "T00:00:00").getDay();
        const diaSemanaStr = obterDiaSemana(dateStr);
        let horasParaTabela = t.horasExtras;
        let minsExtraCalculo = timeToMins(t.horasExtras);
        if (t.feriado) { minFeriado += minsExtraCalculo; }
        else if (diaSemanaInt === 0) { horasParaTabela = halveTime(t.horasExtras); minDomingoReal += timeToMins(horasParaTabela); }
        else { minRegulares += minsExtraCalculo; }
        const pausaTexto = (t.inicioAlmoco && t.fimAlmoco) ? `${t.inicioAlmoco} / ${t.fimAlmoco}` : 'Sem Pausa';
        return [`${df} (${diaSemanaStr})${t.feriado ? ' - FERIADO' : ''}`, `${t.entrada} - ${pausaTexto} - ${t.saida}`, horasParaTabela];
    });

    doc.autoTable({
        startY: 35,
        head: [['Data', 'Horários (Entrada - Pausa / Retorno - Saída)', 'Horas Extras']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.1 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
        columnStyles: { 0: { cellWidth: 45, halign: 'center' }, 1: { cellWidth: 100, halign: 'center', font: 'courier' }, 2: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: [37, 99, 235] } },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    const totalMinsExtras = minRegulares + minDomingoReal + minFeriado;
    const summaryData = [
        ['TOTAL HORAS REGULARES', minsToTime(minRegulares)],
        ['TOTAL HORAS DOMINGO', minsToTime(minDomingoReal)],
        ['TOTAL HORAS FERIADO', minsToTime(minFeriado)],
        ['TOTAL HORAS EXTRAS', minsToTime(totalMinsExtras)]
    ];
    if (includeSomadas) {
        const totalMinsSomadas = totalMinsExtras + minDomingoReal + minFeriado;
        summaryData.push(['TOTAL HORAS SOMADAS', minsToTime(totalMinsSomadas)]);
    }

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.1 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 55 },
            1: { halign: 'center', font: 'courier', fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 20 }
        },
        margin: { left: 121, right: 14 }
    });

    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
        doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} | Página ${i} de ${pageCount}`, 105, doc.internal.pageSize.height - 10, { align: 'center' });
    }

    doc.save(`Relatorio_Viagens_${currentProject.sigla}_${userData.login}.pdf`);
    showToast('PDF gerado com sucesso!', 'success', 'Exportação Concluída');
}
