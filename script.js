const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";
const valoresHora = { "Suporte NN": 9.09, "Suporte N1": 12.73, "Suporte N2": 15.91, "Suporte N3": 19.44 };

let userData = null;

// ==========================================
// ROTEAMENTO (SPA - SINGLE PAGE APPLICATION)
// ==========================================
window.onload = () => {
    userData = JSON.parse(localStorage.getItem('usuarioAtivo'));
    if (userData) {
        showView('dashboardView');
        initDashboard();
    } else {
        showView('authView');
    }
};

function showView(viewId) {
    document.getElementById('authView').classList.add('hidden');
    document.getElementById('dashboardView').classList.add('hidden');
    
    document.getElementById(viewId).classList.remove('hidden');
    document.getElementById(viewId).classList.add('fade-in');
}

// ==========================================
// MÓDULO 1: AUTENTICAÇÃO
// ==========================================
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
    const btn = document.getElementById(btnId);
    const textSpan = document.getElementById(textId);
    const msgDiv = document.getElementById(msgId);
    
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    textSpan.innerHTML = '<span class="loader"></span> Aguarde...';
    msgDiv.classList.add('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        msgDiv.classList.remove('hidden');
        if(result.success) {
            msgDiv.className = "text-center text-sm font-medium mt-2 text-green-600";
            msgDiv.textContent = result.message || "Sucesso!";
            return result; 
        } else {
            msgDiv.className = "text-center text-sm font-medium mt-2 text-red-500";
            msgDiv.textContent = result.message;
            return false;
        }
    } catch (error) {
        msgDiv.classList.remove('hidden');
        msgDiv.className = "text-center text-sm font-medium mt-2 text-red-500";
        msgDiv.textContent = "Erro de conexão.";
        return false;
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        textSpan.innerHTML = originalText;
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

    const result = await fetchAPI(data, 'btnRegister', 'regText', 'regMsg', 'Cadastrar');
    
    if(result) {
        document.getElementById('registerForm').reset();
        document.getElementById('regMsg').innerHTML = `Cadastro realizado!<br>Seu login é: <b>${result.login}</b>`;
        setTimeout(() => {
            document.getElementById('loginUser').value = result.login;
            toggleAuthView('login');
        }, 3000);
    }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        action: 'login',
        login: document.getElementById('loginUser').value.trim(),
        senha: document.getElementById('loginSenha').value
    };

    const result = await fetchAPI(data, 'btnLogin', 'loginText', 'loginMsg', 'Entrar');
    
    if(result) {
        localStorage.setItem('usuarioAtivo', JSON.stringify(result.user));
        userData = result.user; // Atualiza a variável global
        document.getElementById('loginMsg').textContent = "Acessando...";
        
        setTimeout(() => {
            showView('dashboardView');
            initDashboard();
            document.getElementById('loginForm').reset();
            document.getElementById('loginMsg').classList.add('hidden');
        }, 1000);
    }
});

function logout() {
    localStorage.removeItem('usuarioAtivo');
    userData = null;
    showView('authView');
}

// ==========================================
// MÓDULO 2: LÓGICA DO DASHBOARD E ESCALAS
// ==========================================
function initDashboard() {
    document.getElementById('userGreeting').textContent = `Olá, ${userData.nome} | ${userData.equipe} | ${userData.nivel}`;
    carregarRelatorios();
}

function determinarEscala(equipe, dataViagemStr) {
    const dataViagem = new Date(dataViagemStr + "T00:00:00");
    const ano = dataViagem.getFullYear();
    const mes = dataViagem.getMonth();
    const dataBase = new Date(2026, 8, 21); 
    let mesesDiferenca = (ano - 2026) * 12 + (mes - 8);
    if (dataViagem.getDate() < 21) mesesDiferenca -= 1;
    let isDidiHorario2 = (mesesDiferenca % 2 === 0);
    
    if (equipe === "Didi") return isDidiHorario2 ? 2 : 1;
    if (equipe === "Anna") return isDidiHorario2 ? 1 : 2;
    return 1;
}

function getMinutosPrevistos(escala, dataViagemStr) {
    const data = new Date(dataViagemStr + "T00:00:00");
    const diaSemana = data.getDay(); 
    if (diaSemana === 0) return 0;
    
    if (escala === 1) {
        if (diaSemana >= 1 && diaSemana <= 5) return 8 * 60;
        if (diaSemana === 6) return 4 * 60;
    } else {
        if (diaSemana >= 1 && diaSemana <= 4) return 9 * 60;
        if (diaSemana === 5) return 8 * 60;
        if (diaSemana === 6) return 0;
    }
    return 0;
}

function timeToMins(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(mins) {
    const h = Math.floor(Math.abs(mins) / 60);
    const m = Math.floor(Math.abs(mins) % 60);
    const sinal = mins < 0 ? "-" : "";
    return `${sinal}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

document.getElementById('tripForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSalvar');
    const msg = document.getElementById('msgSalvar');
    btn.disabled = true;
    document.getElementById('btnSalvarTexto').innerHTML = '<span class="loader-small"></span> Processando...';
    
    const dataV = document.getElementById('dataTrabalho').value;
    const ent = timeToMins(document.getElementById('hrEntrada').value);
    const inAlmoco = timeToMins(document.getElementById('hrInicioAlmoco').value);
    const fimAlmoco = timeToMins(document.getElementById('hrFimAlmoco').value);
    const saida = timeToMins(document.getElementById('hrSaida').value);
    
    const minsTrabalhados = (inAlmoco - ent) + (saida - fimAlmoco);
    const escalaAtiva = determinarEscala(userData.equipe, dataV);
    const minsPrevistos = getMinutosPrevistos(escalaAtiva, dataV);
    let minsExtra = minsTrabalhados - minsPrevistos;
    if (minsExtra < 0) minsExtra = 0; 
    
    const valorDaHora = valoresHora[userData.nivel] || 0;
    const totalReceber = (minsExtra / 60) * valorDaHora;

    const tripData = {
        action: 'saveTrip',
        login: userData.login,
        sigla: document.getElementById('sigla').value.toUpperCase(),
        tipoProjeto: document.getElementById('tipoProjeto').value,
        data: dataV,
        escala: `Horário ${escalaAtiva}`,
        entrada: document.getElementById('hrEntrada').value,
        inicioAlmoco: document.getElementById('hrInicioAlmoco').value,
        fimAlmoco: document.getElementById('hrFimAlmoco').value,
        saida: document.getElementById('hrSaida').value,
        totalHoras: minsToTime(minsTrabalhados),
        horasExtras: minsToTime(minsExtra),
        valorHoraExtra: valorDaHora,
        totalReceber: totalReceber
    };

    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(tripData)
        });
        const result = await resp.json();
        
        msg.classList.remove('hidden');
        if(result.success) {
            msg.className = "text-center text-sm font-medium mt-2 text-green-600";
            msg.textContent = result.message;
            document.getElementById('tripForm').reset();
            carregarRelatorios(); 
        }
    } catch (err) {
        msg.classList.remove('hidden');
        msg.className = "text-center text-sm font-medium mt-2 text-red-500";
        msg.textContent = "Erro ao salvar.";
    } finally {
        btn.disabled = false;
        document.getElementById('btnSalvarTexto').textContent = 'Salvar Registro';
        setTimeout(() => msg.classList.add('hidden'), 3000);
    }
});

async function carregarRelatorios() {
    try {
        const resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getTrips', login: userData.login })
        });
        const result = await resp.json();
        
        const tbHoras = document.getElementById('tbHoras');
        const tbFin = document.getElementById('tbFinanceiro');
        tbHoras.innerHTML = ''; tbFin.innerHTML = '';

        if(result.success && result.trips.length > 0) {
            result.trips.reverse().forEach(trip => {
                const dateParts = trip.data.split('T')[0].split('-');
                const dataFormatada = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;

                tbHoras.innerHTML += `
                    <tr class="border-b hover:bg-slate-50">
                        <td class="p-2">${dataFormatada}</td>
                        <td class="p-2 font-bold">${trip.sigla}</td>
                        <td class="p-2">${trip.escala}</td>
                        <td class="p-2 text-center">${trip.totalHoras}</td>
                        <td class="p-2 text-center font-bold text-blue-600">${trip.horasExtras}</td>
                    </tr>`;
                
                tbFin.innerHTML += `
                    <tr class="border-b hover:bg-slate-50">
                        <td class="p-2">${dataFormatada}</td>
                        <td class="p-2 font-bold">${trip.sigla}</td>
                        <td class="p-2 text-center">${trip.horasExtras}</td>
                        <td class="p-2 text-right">R$ ${Number(trip.valorHoraExtra).toFixed(2).replace('.', ',')}</td>
                        <td class="p-2 text-right font-bold text-green-600">R$ ${Number(trip.totalReceber).toFixed(2).replace('.', ',')}</td>
                    </tr>`;
            });
        } else {
            tbHoras.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Nenhuma viagem registrada.</td></tr>';
            tbFin.innerHTML = '<tr><td colspan="5" class="p-4 text-center">Nenhuma viagem registrada.</td></tr>';
        }
    } catch (err) {
        console.error("Erro ao carregar viagens", err);
    }
}
