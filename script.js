const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";
const valoresHora = { "Suporte NN": 9.09, "Suporte N1": 12.73, "Suporte N2": 15.91, "Suporte N3": 19.44 };
let userData = null;
let colegasGlobais = [];

window.onload = () => {
    userData = JSON.parse(localStorage.getItem('usuarioAtivo'));
    if (userData) { showView('dashboardView'); initDashboard(); } else { showView('authView'); }
};

function showView(viewId) {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById(viewId).classList.remove('hidden');
    document.getElementById(viewId).classList.add('fade-in');
}

function toggleAuthView(view) {
    const loginSec = document.getElementById('loginSection');
    const regSec = document.getElementById('registerSection');
    if(view === 'register') { loginSec.classList.add('hidden'); regSec.classList.remove('hidden'); regSec.classList.add('fade-in'); }
    else { regSec.classList.add('hidden'); loginSec.classList.remove('hidden'); loginSec.classList.add('fade-in'); }
}

async function fetchAPI(data, btnId, textId, msgId, originalText) {
    const btn = document.getElementById(btnId);
    const textSpan = document.getElementById(textId);
    const msgDiv = document.getElementById(msgId);
    btn.disabled = true; btn.classList.add('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = '<span class="loader"></span>'; msgDiv.classList.add('hidden');
    try {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
        const result = await response.json();
        msgDiv.classList.remove('hidden');
        if(result.success) { msgDiv.className = "text-center text-sm font-semibold mt-3 text-emerald-500"; msgDiv.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${result.message || "Sucesso!"}`; return result; }
        else { msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; msgDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${result.message}`; return false; }
    } catch (error) {
        msgDiv.classList.remove('hidden'); msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; msgDiv.innerHTML = `<i class="fa-solid fa-wifi mr-1"></i> Erro de conexão.`; return false;
    } finally {
        btn.disabled = false; btn.classList.remove('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = originalText;
    }
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'register', nome: document.getElementById('regNome').value, sobrenome: document.getElementById('regSobrenome').value, equipe: document.getElementById('regEquipe').value, nivel: document.getElementById('regNivel').value, senha: document.getElementById('regSenha').value };
    const original = '<i class="fa-solid fa-save mr-2"></i> Criar Credencial';
    const result = await fetchAPI(data, 'btnRegister', 'regText', 'regMsg', original);
    if(result) {
        document.getElementById('registerForm').reset();
        document.getElementById('regMsg').innerHTML = `<i class="fa-solid fa-check"></i> Gerado! Seu login é: <b>${result.login}</b>`;
        setTimeout(() => { document.getElementById('loginUser').value = result.login; toggleAuthView('login'); }, 3000);
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'login', login: document.getElementById('loginUser').value.trim(), senha: document.getElementById('loginSenha').value };
    const original = 'Acessar Sistema <i class="fa-solid fa-arrow-right-to-bracket ml-2"></i>';
    const result = await fetchAPI(data, 'btnLogin', 'loginText', 'loginMsg', original);
    if(result) {
        localStorage.setItem('usuarioAtivo', JSON.stringify(result.user));
        userData = result.user; 
        document.getElementById('loginMsg').className = "text-center text-sm font-semibold mt-3 text-blue-600";
        // Correção de sintaxe aplicada abaixo (usando aspas simples por fora)
        document.getElementById('loginMsg').innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Carregando workspace...';
        setTimeout(() => { showView('dashboardView'); initDashboard(); document.getElementById('loginForm').reset(); document.getElementById('loginMsg').classList.add('hidden'); }, 1200);
    }
});

function logout() {
    localStorage.removeItem('usuarioAtivo'); userData = null; showView('authView');
    document.getElementById('tbHoras').innerHTML = ''; document.getElementById('tbFinanceiro').innerHTML = '';
}

// DASHBOARD E ESCALAS
function initDashboard() {
    document.getElementById('navUserName').textContent = `${userData.nome} ${userData.sobrenome}`;
    document.getElementById('navUserRole').textContent = `Equipe ${userData.equipe} • ${userData.nivel}`;
    carregarRelatorios();
    carregarColegasEShares();
}

function determinarEscala(equipe, dataViagemStr) {
    const d = new Date(dataViagemStr + "T00:00:00");
    let diff = (d.getFullYear() - 2026) * 12 + (d.getMonth() - 8);
    if (d.getDate() < 21) diff -= 1;
    let isDidiH2 = (diff % 2 === 0);
    if (equipe === "Didi") return isDidiH2 ? 2 : 1;
    return isDidiH2 ? 1 : 2;
}

function getMinutosPrevistos(escala, dStr) {
    const dia = new Date(dStr + "T00:00:00").getDay();
    if (dia === 0) return 0;
    if (escala === 1) return (dia <= 5) ? 480 : 240;
    return (dia <= 4) ? 540 : (dia === 5 ? 480 : 0);
}

function timeToMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(m) { return `${m<0?"-":""}${String(Math.floor(Math.abs(m)/60)).padStart(2,'0')}:${String(Math.floor(Math.abs(m)%60)).padStart(2,'0')}`; }

document.getElementById('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSalvar'); const msg = document.getElementById('msgSalvar');
    btn.disabled = true; document.getElementById('btnSalvarTexto').innerHTML = '<span class="loader-small"></span> Processando...';
    
    const dV = document.getElementById('dataTrabalho').value;
    const minsTrab = (timeToMins(document.getElementById('hrInicioAlmoco').value) - timeToMins(document.getElementById('hrEntrada').value)) + (timeToMins(document.getElementById('hrSaida').value) - timeToMins(document.getElementById('hrFimAlmoco').value));
    const escA = determinarEscala(userData.equipe, dV);
    let mExt = minsTrab - getMinutosPrevistos(escA, dV); if (mExt < 0) mExt = 0;
    const vHora = valoresHora[userData.nivel] || 0;
    
    const payload = { action: 'saveTrip', login: userData.login, sigla: document.getElementById('sigla').value.toUpperCase(), tipoProjeto: document.getElementById('tipoProjeto').value, data: dV, escala: `Horário ${escA}`, entrada: document.getElementById('hrEntrada').value, inicioAlmoco: document.getElementById('hrInicioAlmoco').value, fimAlmoco: document.getElementById('hrFimAlmoco').value, saida: document.getElementById('hrSaida').value, totalHoras: minsToTime(minsTrab), horasExtras: minsToTime(mExt), valorHoraExtra: vHora, totalReceber: (mExt / 60) * vHora };

    try {
        const r = await (await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) })).json();
        msg.classList.remove('hidden');
        if(r.success) { msg.className = "text-center text-xs font-bold mt-3 text-emerald-600 bg-emerald-50 py-2 rounded"; msg.innerHTML = `<i class="fa-solid fa-check"></i> ${r.message}`; document.getElementById('tripForm').reset(); carregarRelatorios(); }
    } catch (err) { msg.classList.remove('hidden'); msg.className = "text-center text-xs font-bold mt-3 text-red-600 bg-red-50 py-2 rounded"; msg.innerHTML = `Erro.`; }
    finally { btn.disabled = false; document.getElementById('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Banco'; setTimeout(() => msg.classList.add('hidden'), 3000); }
});

async function carregarRelatorios() {
    try {
        const r = await (await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getTrips', login: userData.login }) })).json();
        const tbH = document.getElementById('tbHoras'); const tbF = document.getElementById('tbFinanceiro');
        tbH.innerHTML = ''; tbF.innerHTML = '';
        if(r.success && r.trips.length > 0) {
            r.trips.reverse().forEach(t => {
                const df = t.data.split('T')[0].split('-').reverse().join('/');
                const hExt = t.horasExtras !== '00:00';
                tbH.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b">
                        <td class="px-4 py-2 text-sm text-slate-600">${df}</td><td class="px-4 py-2 font-bold">${t.sigla}</td><td class="px-4 py-2 text-xs"><span class="bg-slate-100 px-2 py-1 rounded">${t.escala}</span></td>
                        <td class="px-4 py-2 text-center font-mono">${t.totalHoras}</td><td class="px-4 py-2 text-center font-bold ${hExt?'text-blue-600':'text-slate-400'}">${t.horasExtras}</td>
                        <td class="px-4 py-2 text-center" data-pdf-ignore="true"><button onclick="abrirModalShare('${t.idViagem}')" class="text-slate-400 hover:text-blue-500 transition" title="Compartilhar com Colega"><i class="fa-solid fa-share-nodes"></i></button></td>
                    </tr>`;
                tbF.innerHTML += `
                    <tr class="hover:bg-slate-50 border-b">
                        <td class="px-4 py-2 text-sm text-slate-600">${df}</td><td class="px-4 py-2 font-bold">${t.sigla}</td><td class="px-4 py-2 text-center font-mono">${t.horasExtras}</td>
                        <td class="px-4 py-2 text-right text-slate-500">R$ ${Number(t.valorHoraExtra).toFixed(2).replace('.', ',')}</td><td class="px-4 py-2 text-right font-bold text-emerald-600">R$ ${Number(t.totalReceber).toFixed(2).replace('.', ',')}</td>
                    </tr>`;
            });
        }
    } catch(e){}
}

// COMPARTILHAMENTO
async function carregarColegasEShares() {
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getUsers' }) })
        .then(r => r.json()).then(d => {
            if(d.success) {
                const sel = document.getElementById('shareUserSelect'); sel.innerHTML = '<option value="">Selecione um colega...</option>';
                d.users.forEach(u => { if(u.login !== userData.login) sel.innerHTML += `<option value="${u.login}">${u.nome} (${u.login})</option>`; });
            }
        });
        
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSharedTrips', login: userData.login }) })
        .then(r => r.json()).then(d => {
            const list = document.getElementById('listaCompartilhados'); list.innerHTML = '';
            if(d.success && d.shared.length > 0) {
                d.shared.forEach(s => {
                    const dt = s.data.split('T')[0].split('-').reverse().join('/');
                    list.innerHTML += `
                    <div class="bg-white border rounded p-3 mb-2 shadow-sm flex justify-between items-center">
                        <div><p class="text-xs font-bold text-slate-800">${s.sigla} - ${dt}</p><p class="text-[10px] text-slate-500">Enviado por: ${s.remetente}</p></div>
                        <button onclick='usarShared(${JSON.stringify(s)})' class="bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white px-2 py-1 rounded text-xs font-bold transition">Aproveitar</button>
                    </div>`;
                });
            } else { list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhum registro recebido.</p>'; }
        });
}

function usarShared(s) {
    document.getElementById('sigla').value = s.sigla;
    document.getElementById('tipoProjeto').value = s.tipoProjeto;
    document.getElementById('dataTrabalho').value = s.data.split('T')[0];
    document.getElementById('hrEntrada').value = s.entrada;
    document.getElementById('hrInicioAlmoco').value = s.inicioAlmoco;
    document.getElementById('hrFimAlmoco').value = s.fimAlmoco;
    document.getElementById('hrSaida').value = s.saida;
}

function abrirModalShare(id) { document.getElementById('shareTripId').value = id; document.getElementById('modalShare').classList.remove('hidden'); }
function fecharModalShare() { document.getElementById('modalShare').classList.add('hidden'); document.getElementById('shareUserSelect').value = ''; }

async function confirmarShare() {
    const dest = document.getElementById('shareUserSelect').value;
    if(!dest) return alert('Selecione um colega!');
    const btn = document.getElementById('btnConfirmShare'); btn.innerHTML = 'Enviando...'; btn.disabled = true;
    const payload = { action: 'shareTrip', remetente: userData.login, destinatario: dest, idViagem: document.getElementById('shareTripId').value };
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    btn.innerHTML = 'Enviar Registro'; btn.disabled = false; fecharModalShare(); alert('Compartilhado com sucesso!');
}

// PDF EXPORT
function gerarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("Relatório de Controle Operacional de Viagens", 14, 15);
    doc.setFontSize(10); doc.text(`Técnico: ${userData.nome} ${userData.sobrenome} | Perfil: Equipe ${userData.equipe} - ${userData.nivel}`, 14, 22);
    
    // Tabela 1 ignora a coluna 5 (Ações de Compartilhar)
    doc.autoTable({ html: '#tableHorasHtml', startY: 30, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [71, 85, 105] }, columns: [0, 1, 2, 3, 4] });
    doc.text("Previsão Financeira", 14, doc.lastAutoTable.finalY + 12);
    doc.autoTable({ html: '#tableFinHtml', startY: doc.lastAutoTable.finalY + 15, theme: 'grid', styles: { fontSize: 8 }, headStyles: { fillColor: [15, 23, 42] } });
    
    doc.save(`Relatorio_NOC_${userData.login}.pdf`);
}
