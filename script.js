const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";
const valoresHora = { "Suporte NN": 9.09, "Suporte N1": 12.73, "Suporte N2": 15.91, "Suporte N3": 19.44 };

let userData = null;
let allTrips = [];
let currentProject = { sigla: '', tipo: '' };

window.onload = () => {
    userData = JSON.parse(localStorage.getItem('usuarioAtivo'));
    if (userData) { 
        document.getElementById('globalHeader').classList.remove('hidden');
        showView('projectsView'); initApp(); 
    } else { showView('authView'); }
};

function showView(viewId) {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('projectsView').classList.add('hidden');
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
    const btn = document.getElementById(btnId); const textSpan = document.getElementById(textId); const msgDiv = document.getElementById(msgId);
    if(btn) { btn.disabled = true; btn.classList.add('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = '<span class="loader"></span>'; }
    if(msgDiv) msgDiv.classList.add('hidden');
    try {
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
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
    } finally { if(btn) { btn.disabled = false; btn.classList.remove('opacity-75', 'cursor-not-allowed'); textSpan.innerHTML = originalText; } }
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'register', nome: document.getElementById('regNome').value, sobrenome: document.getElementById('regSobrenome').value, equipe: document.getElementById('regEquipe').value, nivel: document.getElementById('regNivel').value, senha: document.getElementById('regSenha').value };
    const result = await fetchAPI(data, 'btnRegister', 'regText', 'regMsg', '<i class="fa-solid fa-save mr-2"></i> Cadastrar');
    if(result && result.success) {
        document.getElementById('registerForm').reset();
        document.getElementById('regMsg').innerHTML = `<i class="fa-solid fa-check"></i> Gerado! Seu login é: <b>${result.login}</b>`;
        setTimeout(() => { document.getElementById('loginUser').value = result.login; toggleAuthView('login'); }, 3000);
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { action: 'login', login: document.getElementById('loginUser').value.trim(), senha: document.getElementById('loginSenha').value };
    const result = await fetchAPI(data, 'btnLogin', 'loginText', 'loginMsg', 'Acessar <i class="fa-solid fa-arrow-right-to-bracket ml-2"></i>');
    if(result && result.success) {
        localStorage.setItem('usuarioAtivo', JSON.stringify(result.user)); userData = result.user; 
        document.getElementById('loginMsg').className = "text-center text-sm font-semibold mt-3 text-blue-600";
        document.getElementById('loginMsg').innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Iniciando portal...';
        setTimeout(() => { document.getElementById('globalHeader').classList.remove('hidden'); showView('projectsView'); initApp(); document.getElementById('loginForm').reset(); document.getElementById('loginMsg').classList.add('hidden'); }, 1200);
    }
});

function logout() { localStorage.removeItem('usuarioAtivo'); userData = null; document.getElementById('globalHeader').classList.add('hidden'); showView('authView'); }

function initApp() {
    document.getElementById('navUserName').textContent = `${userData.nome} ${userData.sobrenome}`;
    document.getElementById('navUserRole').textContent = `Equipe ${userData.equipe} • ${userData.nivel}`;
    carregarTudo(); carregarColegas();
}

async function carregarTudo() {
    document.getElementById('projectsGrid').innerHTML = '<div class="col-span-full text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl"></i> Buscando projetos...</div>';
    try {
        const r = await fetchAPI({ action: 'getTrips', login: userData.login });
        if (r && r.success) {
            allTrips = r.trips; renderizarProjetos();
            if(currentProject.sigla !== '') renderizarWorkspace();
        }
    } catch(e){}
}

function renderizarProjetos() {
    const grid = document.getElementById('projectsGrid');
    if(allTrips.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10 bg-white rounded border border-dashed border-slate-300"><i class="fa-solid fa-folder-open text-4xl mb-3"></i><br>Nenhum projeto ativo.<br>Clique em "Novo Projeto" para começar.</div>';
        return;
    }
    const projetosUnicos = {};
    allTrips.forEach(t => {
        const key = t.sigla + '|' + t.tipo;
        if(!projetosUnicos[key]) projetosUnicos[key] = { sigla: t.sigla, tipo: t.tipo, registros: 0 };
        projetosUnicos[key].registros += 1;
    });

    grid.innerHTML = '';
    Object.values(projetosUnicos).forEach(p => {
        grid.innerHTML += `
            <div onclick="abrirWorkspace('${p.sigla}', '${p.tipo}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 cursor-pointer transition group">
                <div class="flex justify-between items-start mb-4">
                    <div class="bg-blue-50 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition"><i class="fa-solid fa-store"></i></div>
                    <span class="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded">${p.registros} reg.</span>
                </div>
                <h3 class="text-xl font-bold text-slate-800 uppercase tracking-tight">${p.sigla}</h3>
                <p class="text-xs text-slate-500 mt-1 font-medium truncate">${p.tipo}</p>
            </div>`;
    });
}

function checkOutros() {
    const v = document.getElementById('novoProjTipo').value;
    if(v === 'Outros') document.getElementById('novoProjOutros').classList.remove('hidden');
    else { document.getElementById('novoProjOutros').classList.add('hidden'); document.getElementById('novoProjOutros').value = ''; }
}

function abrirModalProjeto() { document.getElementById('modalProjeto').classList.remove('hidden'); }
function fecharModalProjeto() { document.getElementById('modalProjeto').classList.add('hidden'); }

function criarProjeto() {
    const sigla = document.getElementById('novoProjSigla').value.trim().toUpperCase();
    let tipo = document.getElementById('novoProjTipo').value;
    if (tipo === 'Outros') tipo = document.getElementById('novoProjOutros').value.trim();
    if(!sigla) return alert("Informe a sigla da loja!");
    fecharModalProjeto(); abrirWorkspace(sigla, tipo);
}

function abrirWorkspace(sigla, tipo) {
    currentProject = { sigla: sigla, tipo: tipo };
    document.getElementById('workspaceTitle').textContent = `PROJETO: ${sigla}`;
    document.getElementById('workspaceSubtitle').textContent = `Categoria: ${tipo}`;
    showView('dashboardView'); cancelarEdicao(); renderizarWorkspace();
}

function voltarParaProjetos() { currentProject = { sigla: '', tipo: '' }; showView('projectsView'); }

// LÓGICA DE TURNOS (Baseada em Setembro de 2026 - Onde Didi é "Turno Estendido")
function determinarEscala(equipe, dataViagemStr) {
    const d = new Date(dataViagemStr + "T00:00:00");
    let cycleYear = d.getFullYear();
    let cycleMonth = d.getMonth(); 
    if (d.getDate() < 21) { cycleMonth--; if (cycleMonth < 0) { cycleMonth = 11; cycleYear--; } }
    
    // O ciclo de Agosto/2026 (mês 7) coloca Didi no Estendido. (Mês 7 para Setembro ciclo par)
    let monthsPassed = (cycleYear - 2026) * 12 + (cycleMonth - 7);
    let isEvenCycle = (monthsPassed % 2 === 0);
    
    if (equipe === "Didi") return isEvenCycle ? "Turno Estendido" : "Turno Padrão";
    return isEvenCycle ? "Turno Padrão" : "Turno Estendido";
}

function getMinutosPrevistos(escala, dStr) {
    const dia = new Date(dStr + "T00:00:00").getDay();
    if (dia === 0) return 0; // Domingo
    // Legado Horário 1 = Turno Padrão, Horário 2 = Turno Estendido
    if (escala === "Turno Padrão" || escala === "Horário 1") return (dia <= 5) ? 480 : 240; 
    return (dia <= 4) ? 540 : (dia === 5 ? 480 : 0); 
}

function timeToMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minsToTime(m) { return `${m<0?"-":""}${String(Math.floor(Math.abs(m)/60)).padStart(2,'0')}:${String(Math.floor(Math.abs(m)%60)).padStart(2,'0')}`; }

function cancelarEdicao() {
    document.getElementById('tripForm').reset(); document.getElementById('editTripId').value = '';
    document.getElementById('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    document.getElementById('btnSalvar').classList.replace('bg-orange-500', 'bg-blue-600');
    document.getElementById('btnSalvar').classList.replace('hover:bg-orange-600', 'hover:bg-blue-700');
}

function carregarParaEdicao(idTrip) {
    const t = allTrips.find(x => x.idViagem === idTrip); if(!t) return;
    document.getElementById('editTripId').value = t.idViagem; document.getElementById('dataTrabalho').value = t.data.split('T')[0];
    document.getElementById('hrEntrada').value = t.entrada; document.getElementById('hrInicioAlmoco').value = t.inicioAlmoco;
    document.getElementById('hrFimAlmoco').value = t.fimAlmoco; document.getElementById('hrSaida').value = t.saida;
    document.getElementById('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento';
    document.getElementById('btnSalvar').classList.replace('bg-blue-600', 'bg-orange-500');
    document.getElementById('btnSalvar').classList.replace('hover:bg-blue-700', 'hover:bg-orange-600');
}

document.getElementById('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('editTripId').value !== '';
    const btnId = 'btnSalvar'; const msgId = 'msgSalvar';
    const originalText = isEdit ? '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento' : '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    
    document.getElementById(btnId).disabled = true; document.getElementById('btnSalvarTexto').innerHTML = '<span class="loader-small"></span> Aguarde...';
    
    const dV = document.getElementById('dataTrabalho').value;
    const diaSemana = new Date(dV + "T00:00:00").getDay(); 
    
    const minsTrab = (timeToMins(document.getElementById('hrInicioAlmoco').value) - timeToMins(document.getElementById('hrEntrada').value)) + (timeToMins(document.getElementById('hrSaida').value) - timeToMins(document.getElementById('hrFimAlmoco').value));
    const escA = determinarEscala(userData.equipe, dV);
    
    let mExt = minsTrab - getMinutosPrevistos(escA, dV); if (mExt < 0) mExt = 0;
    if (diaSemana === 0) mExt = mExt * 2; 
    const vHora = valoresHora[userData.nivel] || 0;
    
    const payload = { action: isEdit ? 'editTrip' : 'saveTrip', idViagem: document.getElementById('editTripId').value, login: userData.login, sigla: currentProject.sigla, tipoProjeto: currentProject.tipo, data: dV, escala: escA, entrada: document.getElementById('hrEntrada').value, inicioAlmoco: document.getElementById('hrInicioAlmoco').value, fimAlmoco: document.getElementById('hrFimAlmoco').value, saida: document.getElementById('hrSaida').value, totalHoras: minsToTime(minsTrab), horasExtras: minsToTime(mExt), valorHoraExtra: vHora, totalReceber: (mExt / 60) * vHora };

    const r = await fetchAPI(payload, btnId, 'btnSalvarTexto', msgId, originalText);
    if(r && r.success) { cancelarEdicao(); carregarTudo(); setTimeout(() => document.getElementById(msgId).classList.add('hidden'), 3000); }
});

function obterDiaSemana(dataString) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return dias[new Date(dataString + "T00:00:00").getDay()];
}

function renderizarWorkspace() {
    const tbH = document.getElementById('tbHoras'); const tbF = document.getElementById('tbFinanceiro');
    tbH.innerHTML = ''; tbF.innerHTML = '';
    const projTrips = allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo);
    let valorTotal = 0;

    if(projTrips.length > 0) {
        projTrips.sort((a, b) => new Date(b.data) - new Date(a.data));
        projTrips.forEach(t => {
            const dateStr = t.data.includes('T') ? t.data.split('T')[0] : t.data;
            const df = dateStr.split('-').reverse().join('/') + ` (${obterDiaSemana(dateStr)})`;
            const hExt = t.horasExtras !== '00:00';
            valorTotal += Number(t.totalReceber);

            tbH.innerHTML += `
                <tr class="hover:bg-slate-50 border-b transition-colors">
                    <td class="px-4 py-3 text-sm text-slate-600">${df}</td>
                    <td class="px-4 py-3 text-xs"><span class="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">${t.escala}</span></td>
                    <td class="px-4 py-3 text-center font-bold ${hExt?'text-blue-600':'text-slate-400'}">${t.horasExtras}</td>
                    <td class="px-4 py-3 text-center space-x-2" data-pdf-ignore="true">
                        <button onclick="carregarParaEdicao('${t.idViagem}')" class="text-slate-400 hover:text-orange-500 transition"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="abrirModalShare('${t.idViagem}')" class="text-slate-400 hover:text-blue-500 transition"><i class="fa-solid fa-share-nodes"></i></button>
                    </td>
                </tr>`;
            
            tbF.innerHTML += `
                <tr class="hover:bg-slate-50 border-b transition-colors">
                    <td class="px-4 py-3 text-sm text-slate-600">${df}</td>
                    <td class="px-4 py-3 text-center font-mono text-slate-600">${t.horasExtras}</td>
                    <td class="px-4 py-3 text-right text-slate-500">R$ ${Number(t.valorHoraExtra).toFixed(2).replace('.', ',')}</td>
                    <td class="px-4 py-3 text-right font-bold text-emerald-600">R$ ${Number(t.totalReceber).toFixed(2).replace('.', ',')}</td>
                </tr>`;
        });
        document.getElementById('valorTotalProjeto').textContent = `R$ ${valorTotal.toFixed(2).replace('.', ',')}`;
    } else {
        tbH.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Nenhum registro para este projeto.</td></tr>';
        tbF.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-400">Nenhuma movimentação.</td></tr>';
        document.getElementById('valorTotalProjeto').textContent = 'R$ 0,00';
    }
}

function carregarColegas() {
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getUsers' }) }).then(r => r.json()).then(d => {
        if(d.success) {
            const sel = document.getElementById('shareUserSelect'); sel.innerHTML = '<option value="">Selecione um colega...</option>';
            d.users.forEach(u => { if(u.login !== userData.login) sel.innerHTML += `<option value="${u.login}">${u.nome} (${u.login})</option>`; });
        }
    });
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSharedTrips', login: userData.login }) }).then(r => r.json()).then(d => {
        const list = document.getElementById('listaCompartilhados'); list.innerHTML = '';
        if(d.success && d.shared.length > 0) {
            d.shared.forEach(s => {
                const dtStr = s.data.includes('T') ? s.data.split('T')[0] : s.data;
                const dtFmt = dtStr.split('-').reverse().join('/') + ` (${obterDiaSemana(dtStr)})`;
                list.innerHTML += `<div class="bg-slate-50 border rounded p-3 mb-2 flex justify-between items-center hover:bg-slate-100"><div><p class="text-xs font-bold text-slate-800">${s.sigla} - ${dtFmt}</p><p class="text-[10px] text-slate-500">Enviado por: ${s.remetente}</p></div><button onclick='usarShared(${JSON.stringify(s)})' class="bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white px-2 py-1 rounded text-xs font-bold transition">Aproveitar</button></div>`;
            });
        } else { list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhum registro recebido.</p>'; }
    });
}

function usarShared(s) {
    abrirWorkspace(s.sigla, s.tipoProjeto);
    document.getElementById('dataTrabalho').value = s.data.split('T')[0];
    document.getElementById('hrEntrada').value = s.entrada;
    document.getElementById('hrInicioAlmoco').value = s.inicioAlmoco;
    document.getElementById('hrFimAlmoco').value = s.fimAlmoco;
    document.getElementById('hrSaida').value = s.saida;
}

function abrirModalShare(id) { document.getElementById('shareTripId').value = id; document.getElementById('modalShare').classList.remove('hidden'); }
function fecharModalShare() { document.getElementById('modalShare').classList.add('hidden'); document.getElementById('shareUserSelect').value = ''; }

async function confirmarShare() {
    const dest = document.getElementById('shareUserSelect').value; if(!dest) return alert('Selecione um colega!');
    const btn = document.getElementById('btnConfirmShare'); btn.innerHTML = 'Enviando...'; btn.disabled = true;
    const payload = { action: 'shareTrip', remetente: userData.login, destinatario: dest, idViagem: document.getElementById('shareTripId').value };
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    btn.innerHTML = 'Enviar'; btn.disabled = false; fecharModalShare(); alert('Compartilhado com sucesso!');
}

function gerarPDF() {
    const { jsPDF } = window.jspdf; const doc = new jsPDF();
    doc.setFontSize(16); 
    // Título Exato solicitado
    doc.text(`Relatório de Viagens - ${currentProject.sigla} | ${userData.login}`, 14, 15);
    doc.setFontSize(10); 
    doc.text(`Técnico(a): ${userData.nome} ${userData.sobrenome} | Serviço: ${currentProject.tipo}`, 14, 22);
    
    // Configurado para renderizar apenas a Tabela 1 (Registros de Atividades), ignorando a coluna de Ações (índice 3)
    doc.autoTable({ 
        html: '#tableHorasHtml', 
        startY: 30, 
        theme: 'grid', 
        styles: { fontSize: 8 }, 
        headStyles: { fillColor: [30, 41, 59] }, 
        columns: [0, 1, 2] // Exporta apenas Data, Escala, e Horas Extras
    });
    
    doc.save(`Relatorio_Viagens_${currentProject.sigla}_${userData.login}.pdf`);
}
