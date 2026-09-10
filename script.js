// A URL gerada no Passo 3
const API_URL = "https://script.google.com/macros/s/AKfycbyv6rztF_a5ePHzRhzCMJDawDOHhF-le_3MgvoeMY2WUGjVRQBPmt2cSuV6Mp71MGnpUQ/exec";

// Alternar entre Login e Cadastro
function toggleView(view) {
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

// Função genérica para requisições
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
        msgDiv.textContent = "Erro de conexão. Tente novamente.";
        return false;
    } finally {
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        textSpan.innerHTML = originalText;
    }
}

// Submissão do Cadastro
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
            toggleView('login');
        }, 3000);
    }
});

// Submissão do Login
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
        document.getElementById('loginMsg').textContent = "Redirecionando...";
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1000);
    }
});
