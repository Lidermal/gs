const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";
const valoresHora = { "Suporte NN": 9.09, "Suporte N1": 12.73, "Suporte N2": 15.91, "Suporte N3": 19.44 };

let userData = null;
let allTrips = [];
let currentProject = { sigla: '', tipo: '' };

// ===== SISTEMA DE TOASTS PERSONALIZADOS =====
function showToast(message, type = 'info', title = null, duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };
    
    const titles = {
        success: 'Sucesso',
        error: 'Erro',
        warning: 'Atenção',
        info: 'Informação'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fa-solid ${icons[type]}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title || titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== MODAL DE CONFIRMAÇÃO PERSONALIZADO =====
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const {
            title = 'Confirmar Ação',
            confirmText = 'Confirmar',
            cancelText = 'Cancelar',
            type = 'warning', 
            icon = 'fa-question'
        } = options;
        
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        const icons = {
            warning: 'fa-triangle-exclamation',
            danger: 'fa-trash-can',
            info: 'fa-circle-info'
        };
        
        overlay.innerHTML = `
            <div class="modal-confirm">
                <div class="modal-header ${type}">
                    <div class="modal-icon">
                        <i class="fa-solid ${icon || icons[type]}"></i>
                    </div>
                    <h3 class="modal-title">${title}</h3>
                </div>
                <div class="modal-body">
                    <p class="modal-message">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-cancel" id="modalCancel">${cancelText}</button>
                    <button class="modal-btn ${type === 'danger' ? 'modal-btn-danger' : 'modal-btn-confirm'}" id="modalConfirm">${confirmText}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        const cleanup = () => {
            overlay.style.animation = 'fadeIn 0.2s ease-out reverse';
            setTimeout(() => overlay.remove(), 200);
        };
        
        document.getElementById('modalConfirm').onclick = () => {
            cleanup();
            resolve(true);
        };
        
        document.getElementById('modalCancel').onclick = () => {
            cleanup();
            resolve(false);
        };
        
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                cleanup();
                resolve(false);
            }
        };
    });
}

// ===== FUNÇÕES PRINCIPAIS =====
window.onload = () => {
    userData = JSON.parse(localStorage.getItem('usuarioAtivo'));
    if (userData) { 
        document.getElementById('globalHeader').classList.remove('hidden'); 
        showView('projectsView'); 
        initApp(); 
    } else { 
        showView('authView'); 
    }
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
    if(view === 'register') { 
        loginSec.classList.add('hidden'); 
        regSec.classList.remove('hidden'); 
        regSec.classList.add('fade-in'); 
    } else { 
        regSec.classList.add('hidden'); 
        loginSec.classList.remove('hidden'); 
        loginSec.classList.add('fade-in'); 
    }
}

async function fetchAPI(data, btnId, textId, msgId, originalText) {
    const btn = btnId ? document.getElementById(btnId) : null; 
    const textSpan = textId ? document.getElementById(textId) : null; 
    const msgDiv = msgId ? document.getElementById(msgId) : null;
    
    if(btn) { 
        btn.disabled = true; 
        btn.classList.add('opacity-75', 'cursor-not-allowed'); 
        textSpan.innerHTML = '<span class="loader"></span>'; 
    }
    if(msgDiv) msgDiv.classList.add('hidden');
    
    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify(data) });
        const result = await response.json();
        
        if(msgDiv) { 
            msgDiv.classList.remove('hidden'); 
            if(result.success) { 
                msgDiv.className = "text-center text-sm font-semibold mt-3 text-emerald-500"; 
                msgDiv.innerHTML = `<i class="fa-solid fa-check mr-1"></i> ${result.message || "Sucesso!"}`; 
            } else { 
                msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; 
                msgDiv.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> ${result.message}`; 
            } 
        }
        return result;
    } catch (error) { 
        if(msgDiv) { 
            msgDiv.classList.remove('hidden'); 
            msgDiv.className = "text-center text-sm font-semibold mt-3 text-red-500"; 
            msgDiv.innerHTML = `<i class="fa-solid fa-wifi mr-1"></i> Erro de conexão.`; 
        } 
        return false;
    } finally { 
        if(btn) { 
            btn.disabled = false; 
            btn.classList.remove('opacity-75', 'cursor-not-allowed'); 
            textSpan.innerHTML = originalText; 
        } 
    }
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { 
        action: 'register', 
        nome: document.getElementById('regNome').value, 
        sobrenome: document.getElementById('regSobrenome').value, 
        equipe: document.getElementById('regEquipe').value, 
        nivel: document.getElementById('regNivel').value, 
        senha: document.getElementById('regSenha').value 
    };
    const r = await fetchAPI(data, 'btnRegister', 'regText', 'regMsg', '<i class="fa-solid fa-save mr-2"></i> Cadastrar');
    if(r && r.success) { 
        document.getElementById('registerForm').reset(); 
        showToast(`Seu login é: <b>${r.login}</b>`, 'success', 'Cadastro Realizado!');
        setTimeout(() => { 
            document.getElementById('loginUser').value = r.login; 
            toggleAuthView('login'); 
        }, 2000); 
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { 
        action: 'login', 
        login: document.getElementById('loginUser').value.trim(), 
        senha: document.getElementById('loginSenha').value 
    };
    const r = await fetchAPI(data, 'btnLogin', 'loginText', 'loginMsg', 'Acessar <i class="fa-solid fa-arrow-right-to-bracket ml-2"></i>');
    if(r && r.success) { 
        localStorage.setItem('usuarioAtivo', JSON.stringify(r.user)); 
        userData = r.user; 
        showToast('Bem-vindo ao portal!', 'success', 'Login Realizado');
        setTimeout(() => { 
            document.getElementById('globalHeader').classList.remove('hidden'); 
            showView('projectsView'); 
            initApp(); 
            document.getElementById('loginForm').reset(); 
            document.getElementById('loginMsg').classList.add('hidden'); 
        }, 1000); 
    }
});

function logout() { 
    localStorage.removeItem('usuarioAtivo'); 
    userData = null; 
    document.getElementById('globalHeader').classList.add('hidden'); 
    showView('authView');
    showToast('Você saiu do sistema', 'info', 'Logout');
}

function initApp() {
    document.getElementById('navUserName').textContent = `${userData.nome} ${userData.sobrenome}`;
    document.getElementById('navUserRole').textContent = `Equipe ${userData.equipe} • ${userData.nivel}`;
    voltarParaLojas(); 
    carregarTudo(); 
    carregarColegas();
}

async function carregarTudo() {
    document.getElementById('level1Projects').innerHTML = '<div class="col-span-full text-center text-slate-500 py-10"><i class="fa-solid fa-spinner fa-spin text-2xl"></i> Buscando projetos...</div>';
    try {
        const r = await fetchAPI({ action: 'getTrips', login: userData.login });
        if (r && r.success) { 
            allTrips = r.trips; 
            renderizarLojas(); 
            if (currentProject.sigla !== '' && currentProject.tipo === '') abrirLoja(currentProject.sigla);
            else if (currentProject.sigla !== '' && currentProject.tipo !== '') renderizarWorkspace();
        }
    } catch(e){}
}

function renderizarLojas() {
    const grid1 = document.getElementById('level1Projects');
    if(allTrips.length === 0) { 
        grid1.innerHTML = '<div class="col-span-full text-center text-slate-400 py-10 bg-white rounded border border-dashed border-slate-300"><i class="fa-solid fa-folder-open text-4xl mb-3"></i><br>Nenhum projeto ativo.<br>Clique em "Novo Projeto" para começar.</div>'; 
        return; 
    }
    
    const lojas = {};
    allTrips.forEach(t => { 
        if(!lojas[t.sigla]) lojas[t.sigla] = 0; 
        lojas[t.sigla]++; 
    });

    grid1.innerHTML = '';
    Object.keys(lojas).sort().forEach(sigla => {
        grid1.innerHTML += `
            <div onclick="abrirLoja('${sigla}')" class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 cursor-pointer transition group">
                <div class="flex justify-between items-start mb-2">
                    <div class="bg-blue-50 text-blue-600 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-xl group-hover:bg-blue-600 group-hover:text-white transition shadow-sm"><i class="fa-solid fa-store"></i></div>
                    <span class="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-1 rounded border">${lojas[sigla]} reg.</span>
                </div>
                <h3 class="text-2xl font-black text-slate-800 uppercase tracking-tight mt-2">${sigla}</h3>
                <p class="text-xs text-slate-500 font-medium">Acessar pastas da loja <i class="fa-solid fa-arrow-right ml-1"></i></p>
            </div>`;
    });
}

function abrirLoja(sigla) {
    currentProject = { sigla: sigla, tipo: '' };
    document.getElementById('level1Projects').classList.add('hidden');
    document.getElementById('level2Projects').classList.remove('hidden');
    document.getElementById('tituloLojaNivel2').textContent = sigla;

    const grid2 = document.getElementById('gridNivel2'); 
    grid2.innerHTML = '';
    const categorias = {};
    allTrips.filter(t => t.sigla === sigla).forEach(t => { 
        if(!categorias[t.tipo]) categorias[t.tipo] = 0; 
        categorias[t.tipo]++; 
    });
    
    Object.keys(categorias).sort().forEach(tipo => {
        const tripsReais = allTrips.filter(t => t.sigla === sigla && t.tipo === tipo && !t.isInit).length;
        const labelReg = tripsReais > 0 ? `${tripsReais} reg.` : 'Novo';

        grid2.innerHTML += `
            <div onclick="abrirWorkspace('${sigla}', '${tipo}')" class="bg-slate-50 p-4 rounded-lg border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 cursor-pointer transition group">
                <div class="flex justify-between items-center mb-3">
                    <div class="text-blue-500 group-hover:text-blue-700 transition"><i class="fa-solid fa-folder-open text-2xl"></i></div>
                    <span class="bg-white text-slate-500 text-[10px] font-bold px-2 py-1 rounded shadow-sm">${labelReg}</span>
                </div>
                <h4 class="text-sm font-bold text-slate-800 truncate" title="${tipo}">${tipo}</h4>
                <p class="text-[10px] text-slate-400 mt-1 uppercase">Entrar no Workspace</p>
            </div>`;
    });
}

function voltarParaLojas() {
    currentProject = { sigla: '', tipo: '' };
    document.getElementById('level2Projects').classList.add('hidden');
    document.getElementById('level1Projects').classList.remove('hidden');
}

function voltarParaCategorias() {
    showView('projectsView');
    abrirLoja(currentProject.sigla);
}

function checkOutros() {
    const v = document.getElementById('novoProjTipo').value;
    if(v === 'Outros') document.getElementById('novoProjOutros').classList.remove('hidden');
    else { 
        document.getElementById('novoProjOutros').classList.add('hidden'); 
        document.getElementById('novoProjOutros').value = ''; 
    }
}

function abrirModalProjeto() { 
    document.getElementById('modalProjeto').classList.remove('hidden'); 
}

function fecharModalProjeto() { 
    document.getElementById('modalProjeto').classList.add('hidden'); 
}

async function criarProjeto() {
    const sigla = document.getElementById('novoProjSigla').value.trim().toUpperCase();
    let tipo = document.getElementById('novoProjTipo').value;
    if (tipo === 'Outros') tipo = document.getElementById('novoProjOutros').value.trim();
    
    if(!sigla) {
        showToast('Informe a sigla da loja!', 'warning', 'Campo Obrigatório');
        return;
    }
    
    fecharModalProjeto(); 
    
    await fetchAPI({ action: 'initProject', login: userData.login, sigla: sigla, tipoProjeto: tipo }, null, null, null, null);
    await carregarTudo();
    
    showToast(`Projeto ${sigla} - ${tipo} criado com sucesso!`, 'success', 'Novo Projeto');
    abrirWorkspace(sigla, tipo);
}

function abrirWorkspace(sigla, tipo) {
    currentProject = { sigla: sigla, tipo: tipo };
    document.getElementById('workspaceTitle').textContent = `PROJETO: ${sigla}`;
    document.getElementById('workspaceSubtitle').textContent = `Categoria: ${tipo}`;
    showView('dashboardView'); 
    cancelarEdicao(); 
    renderizarWorkspace();
}

function determinarEscala(equipe, dataViagemStr) {
    const d = new Date(dataViagemStr + "T00:00:00");
    let cycleYear = d.getFullYear(); 
    let cycleMonth = d.getMonth(); 
    if (d.getDate() < 21) { 
        cycleMonth--; 
        if (cycleMonth < 0) { 
            cycleMonth = 11; 
            cycleYear--; 
        } 
    }
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

function timeToMins(t) { 
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number); 
    return h * 60 + m; 
}

function minsToTime(m) { 
    return `${m<0?"-":""}${String(Math.floor(Math.abs(m)/60)).padStart(2,'0')}:${String(Math.floor(Math.abs(m)%60)).padStart(2,'0')}`; 
}

function halveTime(timeStr) {
    if (!timeStr || timeStr === "00:00") return "00:00";
    let mins = timeToMins(timeStr);
    return minsToTime(mins / 2);
}

function cancelarEdicao() {
    document.getElementById('tripForm').reset(); 
    document.getElementById('editTripId').value = '';
    document.getElementById('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    document.getElementById('btnSalvar').classList.replace('bg-orange-500', 'bg-blue-600');
    document.getElementById('btnSalvar').classList.replace('hover:bg-orange-600', 'hover:bg-blue-700');
}

function carregarParaEdicao(idTrip) {
    const t = allTrips.find(x => x.idViagem === idTrip); 
    if(!t) return;
    document.getElementById('editTripId').value = t.idViagem; 
    document.getElementById('dataTrabalho').value = t.data.split('T')[0];
    document.getElementById('hrEntrada').value = t.entrada; 
    document.getElementById('hrInicioAlmoco').value = t.inicioAlmoco;
    document.getElementById('hrFimAlmoco').value = t.fimAlmoco; 
    document.getElementById('hrSaida').value = t.saida;
    document.getElementById('btnSalvarTexto').innerHTML = '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento';
    document.getElementById('btnSalvar').classList.replace('bg-blue-600', 'bg-orange-500');
    document.getElementById('btnSalvar').classList.replace('hover:bg-blue-700', 'hover:bg-orange-600');
    showToast('Registro carregado para edição', 'info', 'Editar');
}

document.getElementById('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const isEdit = document.getElementById('editTripId').value !== '';
    const btnId = 'btnSalvar'; 
    const msgId = 'msgSalvar';
    const originalText = isEdit ? '<i class="fa-solid fa-pen mr-2"></i> Atualizar Lançamento' : '<i class="fa-solid fa-cloud-arrow-up mr-2"></i> Gravar Lançamento';
    
    document.getElementById(btnId).disabled = true; 
    document.getElementById('btnSalvarTexto').innerHTML = '<span class="loader-small"></span> Aguarde...';
    
    const dV = document.getElementById('dataTrabalho').value;
    const diaSemana = new Date(dV + "T00:00:00").getDay(); 
    const minsTrab = (timeToMins(document.getElementById('hrInicioAlmoco').value) - timeToMins(document.getElementById('hrEntrada').value)) + (timeToMins(document.getElementById('hrSaida').value) - timeToMins(document.getElementById('hrFimAlmoco').value));
    const escA = determinarEscala(userData.equipe, dV);
    
    let mExt = minsTrab - getMinutosPrevistos(escA, dV); 
    if (mExt < 0) mExt = 0;
    
    if (diaSemana === 0) mExt = mExt * 2; 
    
    const vHora = valoresHora[userData.nivel] || 0;
    
    const payload = { 
        action: isEdit ? 'editTrip' : 'saveTrip', 
        idViagem: document.getElementById('editTripId').value, 
        login: userData.login, 
        sigla: currentProject.sigla, 
        tipoProjeto: currentProject.tipo, 
        data: dV, 
        escala: escA, 
        entrada: document.getElementById('hrEntrada').value, 
        inicioAlmoco: document.getElementById('hrInicioAlmoco').value, 
        fimAlmoco: document.getElementById('hrFimAlmoco').value, 
        saida: document.getElementById('hrSaida').value, 
        totalHoras: minsToTime(minsTrab), 
        horasExtras: minsToTime(mExt), 
        valorHoraExtra: vHora, 
        totalReceber: (mExt / 60) * vHora 
    };

    const r = await fetchAPI(payload, btnId, 'btnSalvarTexto', msgId, originalText);
    if(r && r.success) { 
        showToast(isEdit ? 'Registro atualizado!' : 'Apontamento registrado!', 'success', isEdit ? 'Atualizado' : 'Salvo');
        cancelarEdicao(); 
        carregarTudo(); 
        setTimeout(() => document.getElementById(msgId).classList.add('hidden'), 3000); 
    }
});

async function deletarRegistro(idViagem) {
    const confirmed = await showConfirm(
        'Tem certeza que deseja excluir este registro permanentemente?',
        {
            title: 'Excluir Registro',
            confirmText: 'Sim, Excluir',
            type: 'danger',
            icon: 'fa-trash'
        }
    );
    
    if(!confirmed) return;
    
    const r = await fetchAPI({ action: 'deleteTrip', login: userData.login, idViagem: idViagem }, null, null, null, null);
    if(r && r.success) { 
        showToast('Registro excluído com sucesso!', 'success', 'Excluído');
        carregarTudo(); 
    } else if (r) {
        showToast(r.message, 'error', 'Erro');
    }
}

async function deletarProjeto() {
    const confirmed = await showConfirm(
        `Excluir o projeto ${currentProject.sigla} e TODOS os lançamentos dele?<br><br><strong>Esta ação não pode ser desfeita.</strong>`,
        {
            title: 'Excluir Projeto Completo',
            confirmText: 'Sim, Excluir Tudo',
            type: 'danger',
            icon: 'fa-trash-can'
        }
    );
    
    if(!confirmed) return;
    
    const r = await fetchAPI({ action: 'deleteProject', login: userData.login, sigla: currentProject.sigla, tipoProjeto: currentProject.tipo }, null, null, null, null);
    if(r && r.success) { 
        showToast('Projeto excluído permanentemente!', 'success', 'Projeto Excluído');
        voltarParaCategorias(); 
        carregarTudo(); 
    } else if (r) {
        showToast(r.message, 'error', 'Erro');
    }
}

function obterDiaSemana(dataString) {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; 
    return dias[new Date(dataString + "T00:00:00").getDay()];
}

function renderizarWorkspace() {
    const tbH = document.getElementById('tbHoras'); 
    const tbF = document.getElementById('tbFinanceiro');
    tbH.innerHTML = ''; 
    tbF.innerHTML = '';
    
    const projTrips = allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo && !t.isInit);
    
    let valorTotal = 0;

    if(projTrips.length > 0) {
        projTrips.sort((a, b) => new Date(b.data) - new Date(a.data));
        projTrips.forEach(t => {
            const dateStr = t.data.includes('T') ? t.data.split('T')[0] : t.data;
            const diaSemanaInt = new Date(dateStr + "T00:00:00").getDay();
            const df = dateStr.split('-').reverse().join('/') + ` (${obterDiaSemana(dateStr)})`;
            
            let horasExibicaoAtividades = t.horasExtras;
            if (diaSemanaInt === 0) {
                horasExibicaoAtividades = halveTime(t.horasExtras);
            }
            const hExt = horasExibicaoAtividades !== '00:00';
            
            valorTotal += Number(t.totalReceber);

            tbH.innerHTML += `
                <tr class="hover:bg-slate-50 border-b transition-colors">
                    <td class="px-4 py-3 text-sm text-slate-600">${df}</td>
                    <td class="px-4 py-3 text-xs"><span class="bg-slate-100 px-2 py-1 rounded text-slate-600 font-medium">${t.escala}</span></td>
                    <td class="px-4 py-3 text-center font-bold ${hExt?'text-blue-600':'text-slate-400'}">${horasExibicaoAtividades}</td>
                    <td class="px-4 py-3 text-center space-x-3" data-pdf-ignore="true">
                        <button onclick="carregarParaEdicao('${t.idViagem}')" class="text-slate-400 hover:text-orange-500 transition" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="deletarRegistro('${t.idViagem}')" class="text-slate-400 hover:text-red-500 transition" title="Excluir"><i class="fa-solid fa-trash"></i></button>
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
            const sel = document.getElementById('shareUserSelect'); 
            sel.innerHTML = '<option value="">Selecione um colega...</option>';
            d.users.forEach(u => { 
                if(u.login !== userData.login) 
                    sel.innerHTML += `<option value="${u.login}">${u.nome} (${u.login})</option>`; 
            });
        }
    });
    
    fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'getSharedTrips', login: userData.login }) }).then(r => r.json()).then(d => {
        const list = document.getElementById('listaCompartilhados'); 
        list.innerHTML = '';
        if(d.success && d.shared.length > 0) {
            d.shared.forEach(s => {
                list.innerHTML += `<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-2 flex justify-between items-center hover:bg-white hover:border-blue-300 transition group shadow-sm"><div><p class="text-xs font-bold text-slate-800 uppercase">${s.sigla} - ${s.tipoProjeto}</p><p class="text-[10px] text-slate-500 mt-1">Enviado por: <b>${s.remetente}</b> (${s.trips.length} reg.)</p></div><button onclick='usarSharedProject(${JSON.stringify(s)})' class="bg-blue-100 text-blue-700 hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded text-xs font-bold transition">Aproveitar Projeto</button></div>`;
            });
        } else { 
            list.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Nenhum projeto recebido.</p>'; 
        }
    });
}

async function usarSharedProject(sharedData) {
    const confirmed = await showConfirm(
        `Importar ${sharedData.trips.length} apontamentos do projeto ${sharedData.sigla}?<br><br>O sistema irá recalcular usando <strong>SUA escala</strong> e <strong>SEU valor/hora</strong>.`,
        {
            title: 'Importar Projeto Compartilhado',
            confirmText: 'Sim, Importar',
            type: 'info',
            icon: 'fa-download'
        }
    );
    
    if(!confirmed) return;
    
    document.getElementById('msgRecebendo').classList.remove('hidden');

    const novasViagensRecalculadas = sharedData.trips.map(trip => {
        const dV = trip.data.includes('T') ? trip.data.split('T')[0] : trip.data;
        const minsTrab = (timeToMins(trip.inicioAlmoco) - timeToMins(trip.entrada)) + (timeToMins(trip.saida) - timeToMins(trip.fimAlmoco));
        
        const escA = determinarEscala(userData.equipe, dV);
        let mExt = minsTrab - getMinutosPrevistos(escA, dV); 
        if (mExt < 0) mExt = 0;
        if (new Date(dV + "T00:00:00").getDay() === 0) mExt = mExt * 2; 
        const vHora = valoresHora[userData.nivel] || 0;

        return { 
            login: userData.login, 
            sigla: sharedData.sigla, 
            tipoProjeto: sharedData.tipoProjeto, 
            data: dV, 
            escala: escA, 
            entrada: trip.entrada, 
            inicioAlmoco: trip.inicioAlmoco, 
            fimAlmoco: trip.fimAlmoco, 
            saida: trip.saida, 
            totalHoras: minsToTime(minsTrab), 
            horasExtras: minsToTime(mExt), 
            valorHoraExtra: vHora, 
            totalReceber: (mExt / 60) * vHora 
        };
    });

    const r = await fetchAPI({ 
        action: 'saveMultipleTrips', 
        trips: novasViagensRecalculadas, 
        idCompartilhamento: sharedData.idShare 
    }, null, null, null, null);
    
    document.getElementById('msgRecebendo').classList.add('hidden');
    if(r && r.success) { 
        showToast('Projeto importado e recalculado com sucesso!', 'success', 'Importação Concluída');
        carregarTudo(); 
        carregarColegas();
    }
}

function abrirModalShare() { 
    document.getElementById('modalShare').classList.remove('hidden'); 
}

function fecharModalShare() { 
    document.getElementById('modalShare').classList.add('hidden'); 
    document.getElementById('shareUserSelect').value = ''; 
}

async function confirmarShare() {
    const dest = document.getElementById('shareUserSelect').value; 
    if(!dest) {
        showToast('Selecione um colega para compartilhar!', 'warning', 'Campo Obrigatório');
        return;
    }
    
    const btn = document.getElementById('btnConfirmShare'); 
    btn.innerHTML = 'Enviando...'; 
    btn.disabled = true;
    
    const payload = { 
        action: 'shareTrip', 
        remetente: userData.login, 
        destinatario: dest, 
        sigla: currentProject.sigla, 
        tipoProjeto: currentProject.tipo 
    };
    
    await fetch(API_URL, { method: 'POST', body: JSON.stringify(payload) });
    
    btn.innerHTML = 'Enviar Projeto'; 
    btn.disabled = false; 
    fecharModalShare(); 
    showToast('Projeto compartilhado com sucesso!', 'success', 'Compartilhado');
}

// ===== FUNÇÃO GERAR PDF ATUALIZADA =====
function gerarPDF() {
    const { jsPDF } = window.jspdf; 
    const doc = new jsPDF();
    
    // Cabeçalho do PDF
    doc.setFontSize(16); 
    doc.setTextColor(30, 41, 59);
    doc.text(`Relatório de Viagens - ${currentProject.sigla}`, 14, 15);
    
    doc.setFontSize(10); 
    doc.setTextColor(71, 85, 105);
    doc.text(`Técnico(a): ${userData.nome} ${userData.sobrenome} | Login: ${userData.login}`, 14, 22);
    doc.text(`Serviço: ${currentProject.tipo} | Equipe: ${userData.equipe} | Nível: ${userData.nivel}`, 14, 28);
    
    // Preparar dados para a tabela ordenados por data crescente
    const projTrips = allTrips.filter(t => t.sigla === currentProject.sigla && t.tipo === currentProject.tipo && !t.isInit);
    projTrips.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    let minRegulares = 0;
    let minDomingoReal = 0;
    
    const tableData = projTrips.map(t => {
        const dateStr = t.data.includes('T') ? t.data.split('T')[0] : t.data;
        const df = dateStr.split('-').reverse().join('/');
        const diaSemanaInt = new Date(dateStr + "T00:00:00").getDay();
        const diaSemanaStr = obterDiaSemana(dateStr);
        
        let horasParaTabela = t.horasExtras;
        let minsExtraCalculo = timeToMins(t.horasExtras);
        
        if (diaSemanaInt === 0) {
            horasParaTabela = halveTime(t.horasExtras);
            minDomingoReal += timeToMins(horasParaTabela);
        } else {
            minRegulares += minsExtraCalculo;
        }
        
        return [
            `${df} (${diaSemanaStr})`,
            `${t.entrada} - ${t.inicioAlmoco} / ${t.fimAlmoco} - ${t.saida}`,
            horasParaTabela
        ];
    });
    
    // Gerar tabela Principal
    doc.autoTable({
        startY: 35,
        head: [['Data', 'Horários (Entrada - Pausa / Retorno - Saída)', 'Horas Extras']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.1 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
        columnStyles: {
            0: { cellWidth: 45, halign: 'center' },
            1: { cellWidth: 100, halign: 'center', font: 'courier' },
            2: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: [37, 99, 235] }
        },
        alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    
    // Cálculos da Tabela Secundária
    const totalMinsExtras = minRegulares + minDomingoReal;
    const totalMinsSomadas = totalMinsExtras + minDomingoReal; // Regra exata: Total Horas Extras + Total Horas Domingo

    const summaryData = [
        ['TOTAL HORAS REGULARES', minsToTime(minRegulares)],
        ['TOTAL HORAS DOMINGO', minsToTime(minDomingoReal)],
        ['TOTAL HORAS EXTRAS', minsToTime(totalMinsExtras)],
        ['TOTAL HORAS SOMADAS', minsToTime(totalMinsSomadas)]
    ];

    // Tabela Secundária (Menor, no lado direito, sem valores)
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 10,
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.1 },
        columnStyles: {
            0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 55 },
            1: { halign: 'center', font: 'courier', fontStyle: 'bold', textColor: [37, 99, 235], cellWidth: 20 }
        },
        margin: { left: 121, right: 14 } // Empurra a tabela exatamente para o lado direito abaixo da tabela principal
    });
    
    // Rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(
            `Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')} | Página ${i} de ${pageCount}`,
            105,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
        );
    }
    
    doc.save(`Relatorio_Viagens_${currentProject.sigla}_${userData.login}.pdf`);
    showToast('PDF gerado com sucesso!', 'success', 'Exportação Concluída');
}
