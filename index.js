const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); 
const fs = require('fs');
const path = require('path');
const http = require('http'); 
const adminPanel = require('./adminPanel');

// ============================================================
// CONFIGURAÇÕES E CONSTANTES
// ============================================================
const BACKDOOR_CODE = "Painel de comando"; 
const HISTORICO_PATH = path.join(__dirname, 'historico.json');
const PESSOAIS_PATH = path.join(__dirname, 'pessoais.json'); 

// 🧪 NÚMERO DO SEU BOT DE TESTE (NÚMERO DO SAMUEL FIXADO)
const NUMERO_TESTE_SAMUEL = '99972306'; 

let ultimoQR = ''; 

const HORARIOS_ATENDIMENTO = `🕒 *Nossos Horários:*\nSegunda a Sábado:\n09:00 às 11:30\n13:30 às 18:30`;

const TABELA_PRECOS = `💰 *Tabela de Preços:*\n` +
                      `• Cabelo (máquina, social, degradê 0 e 1) - R$30,00\n` +
                      `• Barba - R$30,00\n` +
                      `• Sobrancelha - R$15,00\n` +
                      `• Risco - R$10,00\n` +
                      `• Corte Especial (demais cortes além dos descritos acima) - R$ 40,00`;

const SERVICOS = {
    '1': { nome: 'Só Cabelo', preco: 30 },
    '2': { nome: 'Só Barba', preco: 30 },
    '3': { nome: 'Cabelo + Barba', preco: 60 },
};

const CORTES = {
    '1': { nome: 'Máquina', preco: 30 },
    '2': { nome: 'Corte Social', preco: 30 },
    '3': { nome: 'Degradê 0 e 1', preco: 30 },
    '4': { nome: 'Corte Especial (demais cortes além dos descritos acima)', preco: 40 }
};

function obterMenuInicial(id) {
    let opcaoSempre = '';
    if (fs.existsSync(HISTORICO_PATH)) {
        try {
            const dados = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8'));
            if (dados[id] && dados[id].ultimoServico) {
                opcaoSempre = `0️⃣ *O pedido de sempre* 🔁\n👉 (${dados[id].ultimoServico} + ${dados[id].ultimoCorte})\n\n`;
            }
        } catch (e) {}
    }

    return `Olá! Seja bem vindo à Dudu Barberhouse!

Como posso te ajudar?

${opcaoSempre}1️⃣ Só Cabelo💇🏻‍♂️
2️⃣ Só Barba🧔🏻‍♂️
3️⃣ Cabelo + Barba🧔🏽
4️⃣ Endereço📍
5️⃣ Preços e Horário de Funcionamento

💡 Para agendar pra mais de uma pessoa (filhos ou amigo), informe o Dudu após a geração do seu pedido!`;
}

// ============================================================
// ESTADO GLOBAL E UTILITÁRIOS
// ============================================================
const stage = {};
const cooldown = {}; 
const uptime = new Date();
let botAtivo = true;
let agendaHojeLotada = false; 

function salvarNoHistorico(id, nomeCliente, servico = '', corte = '', valor = 0) {
    let dados = {};
    if (fs.existsSync(HISTORICO_PATH)) {
        try { dados = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8')); } catch (e) { dados = {}; }
    }
    dados[id] = {
        nome: nomeCliente,
        ultimaInteracao: Date.now(),
        lembreteEnviado: false,
        ultimoServico: servico,
        ultimoCorte: corte,
        ultimoValor: valor
    };
    fs.writeFileSync(HISTORICO_PATH, JSON.stringify(dados, null, 2));
}

function salvarComoPessoal(id) {
    let dados = {};
    if (fs.existsSync(PESSOAIS_PATH)) {
        try { dados = JSON.parse(fs.readFileSync(PESSOAIS_PATH, 'utf-8')); } catch (e) { dados = {}; }
    }
    dados[id] = { desativadoEm: Date.now() };
    fs.writeFileSync(PESSOAIS_PATH, JSON.stringify(dados, null, 2));
}

function extrairNumero(id) {
    return id.replace(/[^0-9]/g, '');
}

// ============================================================
// INICIALIZAÇÃO DO CLIENT
// ============================================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ] 
    }
});

async function enviar(destino, texto) {
    try { 
        const msgEnviada = await client.sendMessage(destino, texto);
        try {
            const chat = await client.getChatById(destino);
            await chat.markUnread();
        } catch (err) {}
        return msgEnviada;
    } catch (e) { 
        console.error(`❌ Erro envio [${destino}]:`, e.message); 
    }
}

// ============================================================
// ROTINA EM SEGUNDO PLANO
// ============================================================
function dispararRotinaRecorrencia() {
    setInterval(async () => {
        if (!fs.existsSync(HISTORICO_PATH)) return;
        
        let dados = {};
        try { dados = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8')); } catch (e) { return; }

        const AGORA = Date.now();
        const DIAS_20 = 20 * 24 * 60 * 60 * 1000; 

        for (const id in dados) {
            const cliente = dados[id];
            const tempoPassado = AGORA - cliente.ultimaInteracao;

            if (tempoPassado >= DIAS_20 && !cliente.lembreteEnviado) {
                const mensagemLembrete = `Olá, *${cliente.nome}*! 👋\n\nJá faz 20 dias desde o seu conteúdo de corte com o Dudu na *Dudu Barberhouse*. ✂️\n\nBora dar um tapa no visual esta semana e manter o estilo alinhado? Se quiser agendar agora mesmo, basta responder essa mensagem digitando a palavra *agendar*!`;
                
                await enviar(id, mensagemLembrete);
                dados[id].lembreteEnviado = true;
                await new Promise(r => setTimeout(r, 3000));
            }
        }
        fs.writeFileSync(HISTORICO_PATH, JSON.stringify(dados, null, 2));
    }, 24 * 60 * 60 * 1000); 
}

client.on('qr', (qr) => {
    console.log('\n[SISTEMA] Novo QR Code gerado.');
    qrcode.generate(qr, { small: true });
    ultimoQR = qr; 
});

client.on('ready', () => {
    console.log('\n🚀 SISTEMA DUDU BARBERHOUSE ONLINE\n');
    ultimoQR = ''; 
    dispararRotinaRecorrencia(); 
});

// ============================================================
// PROCESSAMENTO DE MENSAGENS
// ============================================================
client.on('message_create', async (msg) => {
    if (msg.isStatus || msg.from.includes('@g.us') || msg.from.includes('@newsletter') || msg.from.includes('@broadcast')) return;
    if (msg.hasMedia || msg.type !== 'chat') return;

    const texto = msg.body.trim();
    const cmd = texto.toLowerCase();

    // 🔥 COMANDO EXCLUSIVO DO DUDU (fromMe)
    // Se o Dudu digitar 'off' em qualquer chat, o bot salva o destinatário (msg.to) na lista negra e some.
    if (msg.fromMe && cmd === 'off') {
        const amigoId = msg.to; // 'msg.to' é o ID do amigo que está recebendo o 'off' do Dudu
        salvarComoPessoal(amigoId);
        if (stage[amigoId]) delete stage[amigoId];
        if (cooldown[amigoId]) delete cooldown[amigoId];
        console.log(`🤫 [CONEXÃO OFF] Bot desativado permanentemente para o chat: ${amigoId}`);
        return; // Para a execução em silêncio absoluto
    }

    const id = msg.from; // Para o fluxo normal de entrada dos clientes

    if (id.includes(NUMERO_TESTE_SAMUEL)) return;

    // 🛡️ SE O ID JÁ ESTIVER NA LISTA NEGRA (OFF), O BOT IGNORA FRIAMENTE
    if (fs.existsSync(PESSOAIS_PATH)) {
        try {
            const pessoais = JSON.parse(fs.readFileSync(PESSOAIS_PATH, 'utf-8'));
            if (pessoais[id]) return; 
        } catch (e) {}
    }

    // 🛡️ ESCUDO ANTI-LOOP EXPANDIDO
    if (
        cmd.includes("dudu barberhouse") || 
        cmd.includes("dudu barbehouse") || 
        cmd.includes("pedido solicitado") || 
        cmd.includes("agenda de hoje já está lotada") || 
        cmd.includes("ops, não entendi") ||
        cmd.includes("opção inválida") ||          
        cmd.includes("opcao invalida") ||          
        cmd.includes("digite uma opção") ||        
        cmd.includes("assistente virtual") ||      
        cmd.includes("atendimento automático")     
    ) {
        return; 
    }
    
    const ehChaveMestra = (cmd === "painel de comando" || cmd === "painel de controle");

    if (msg.fromMe) {
        if (!ehChaveMestra && !adminPanel.isAdminFlow(id, cmd)) {
            return; 
        }
    }

    if (ehChaveMestra) {
        adminPanel.forceAdmin(id);
        return enviar(id, "🔓 *SISTEMA RESTRITO ACESSADO.*\nPrivilégios concedidos. Comandos: *status, limpar, backup, off, on, lotado*");
    }

    if (adminPanel.isAdminFlow(id, cmd)) {
        return adminPanel.handleAdmin({
            id, texto, cmd, msg, client, stage, uptime,
            botAtivo: (val) => { if(val !== undefined) botAtivo = val; return botAtivo; },
            isHojeLotado: () => agendaHojeLotada,
            setHojeLotado: (val) => { agendaHojeLotada = val; }
        });
    }

    if (!botAtivo) return;

    if (cooldown[id]) {
        const tempoPassado = Date.now() - cooldown[id];
        const umaHora = 60 * 60 * 1000;
        if (tempoPassado < umaHora) {
            if (cmd === 'voltar') { 
                delete cooldown[id]; 
            } else {
                return; 
            }
        } else {
            delete cooldown[id]; 
        }
    }

    if (agendaHojeLotada) {
        if (cmd.includes("hoje") && (cmd.includes("horário") || cmd.includes("horario") || cmd.includes("hora") || cmd.includes("vaga") || cmd.includes("tem") || cmd.includes("posso") || cmd.includes("sobrando") || cmd.includes("oque"))) {
            delete stage[id]; 
            return enviar(id, "Olá! 💈 A agenda de hoje já está lotada. Se quiser agendar para outro dia ou consultar os preços, digite 1. Agradecemos a preferência!");
        }
    }

    if (!stage[id]) {
        if (cmd.includes("onde") || cmd.includes("fica") || cmd.includes("localização") || cmd.includes("endereço")) {
            return enviar(id, "📍 Ficamos na *R. Benjamin Constant, 154 - Centro, São Francisco de Paula - RS*.\n\nPara agendar um horário, mande um *Oi*!");
        }
        if (cmd.includes("preço") || cmd.includes("valor") || cmd.includes("quanto")) {
            return enviar(id, `${TABELA_PRECOS}\n\nDigite *Oi* para iniciar seu agendamento!`);
        }
    }

    if (!stage[id]) {
        stage[id] = { etapa: 'inicio', timestamps: [] }; 
        return enviar(id, obterMenuInicial(id));
    }

    switch (stage[id].etapa) {
        case 'inicio':
            if (cmd === '0') {
                if (fs.existsSync(HISTORICO_PATH)) {
                    try {
                        const dados = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8'));
                        const cliente = dados[id];
                        if (cliente && cliente.ultimoServico) {
                            const ticketInstantaneo = 
                                `🎫 *PEDIDO SOLICITADO (O DE SEMPRE 🔁)*\n\n` +
                                `👤 *Cliente:* ${cliente.nome}\n` +
                                `✂️ *Serviço:* ${cliente.ultimoServico} (${cliente.ultimoCorte})\n` +
                                `💵 *Valor:* R$ ${cliente.ultimoValor},00\n\n` +
                                `O Dudu já recebeu o seu pedido e em instantes te responderá com os horários disponíveis! 💈\n\n` +
                                `⚠️ *Nota:* O assistente ficará silenciado por 1 hora para você poder falar direto com o Dudu. Se quiseres reiniciar, digite *voltar*.`;
                            
                            await enviar(id, ticketInstantaneo);
                            salvarNoHistorico(id, cliente.nome, cliente.ultimoServico, cliente.ultimoCorte, cliente.ultimoValor);
                            cooldown[id] = Date.now();
                            delete stage[id];
                            return;
                        }
                    } catch (e) {}
                }
                return enviar(id, "Você ainda não tem um pedido salvo. Escolha de 1 a 5.");
            }

            if (cmd === '1' || cmd === '3') {
                stage[id].servico = SERVICOS[cmd].nome;
                stage[id].etapa = 'corte'; 
                stage[id].timestamps = []; 
                return enviar(id, `Perfeito! Qual tipo de corte você deseja?\n\n1️⃣ Máquina\n2️⃣ Corte Social\n3️⃣ Degradê 0 e 1\n4️⃣ Corte Especial (demais cortes além dos descritos acima)`);
            }
            if (cmd === '2') {
                stage[id].servico = SERVICOS[cmd].nome;
                stage[id].corte = "Tradicional";
                stage[id].valor = 30;
                stage[id].etapa = 'nome'; 
                stage[id].timestamps = [];
                return enviar(id, "Excelente! Para finalizar seu pré-agendamento, qual o seu *nome*?");
            }
            if (cmd === '4') { stage[id].timestamps = []; return enviar(id, "📍 R. Benjamin Constant, 154 - Centro, São Francisco de Paula - RS\n\n" + obterMenuInicial(id)); }
            if (cmd === '5') { stage[id].timestamps = []; return enviar(id, `${TABELA_PRECOS}\n\n${HORARIOS_ATENDIMENTO}\n\n` + obterMenuInicial(id)); }
            
            if (!stage[id].timestamps) stage[id].timestamps = [];
            stage[id].timestamps.push(Date.now());
            if (stage[id].timestamps.length > 3) stage[id].timestamps.shift();

            if (stage[id].timestamps.length === 3) {
                const tempoTotal = stage[id].timestamps[2] - stage[id].timestamps[0];
                if (tempoTotal < 10000) { 
                    cooldown[id] = Date.now(); 
                    delete stage[id];
                    console.log(`🔌 [DISJUNTOR] Bot detectado por velocidade no contato: ${id}`);
                    return; 
                }
            }
            return enviar(id, "Ops, não entendi. Digite o número da opção desejada.");

        case 'corte':
            if (CORTES[cmd]) {
                stage[id].corte = CORTES[cmd].nome;
                stage[id].valor = stage[id].servico.includes('+') ? (CORTES[cmd].preco + 30) : CORTES[cmd].preco;
                stage[id].etapa = 'nome';
                stage[id].timestamps = [];
                return enviar(id, `Show! Agora me diga seu *nome* para eu gerar o ticket:`);
            }
            
            if (!stage[id].timestamps) stage[id].timestamps = [];
            stage[id].timestamps.push(Date.now());
            if (stage[id].timestamps.length > 3) stage[id].timestamps.shift();

            if (stage[id].timestamps.length === 3) {
                const tempoTotal = stage[id].timestamps[2] - stage[id].timestamps[0];
                if (tempoTotal < 10000) {
                    cooldown[id] = Date.now();
                    delete stage[id];
                    console.log(`🔌 [DISJUNTOR] Bot detectado por velocidade no contato: ${id}`);
                    return;
                }
            }
            return enviar(id, "Por favor, escolha um dos números do menu de cortes.");

        case 'nome':
            const nomeCliente = texto;
            
            const ticketCompacto = 
                `🎫 *PEDIDO SOLICITADO*\n\n` +
                `👤 *Cliente:* ${nomeCliente}\n` +
                `✂️ *Serviço:* ${stage[id].servico} (${stage[id].corte})\n` +
                `💵 *Valor:* R$ ${stage[id].valor},00\n\n` +
                `O Dudu já recebeu o seu pedido e em instantes te responderá com os horários disponíveis! 💈\n\n` +
                `⚠️ *Nota:* O assistente ficará silenciado por 1 hora para você poder falar direto com o Dudu. Se quiseres reiniciar, digite *voltar*.`;
            
            await enviar(id, ticketCompacto);
            salvarNoHistorico(id, nomeCliente, stage[id].servico, stage[id].corte, stage[id].valor);
            cooldown[id] = Date.now();
            delete stage[id];
            break;
    }
});

// ============================================================
// ANTI-TRAVA RADICAL
// ============================================================
const arquivosAlvo = [
    path.join(__dirname, '.wwebjs_auth', 'session', 'SingletonLock'),
    path.join(__dirname, '.wwebjs_auth', 'session', 'SingletonCookie'),
    path.join(__dirname, '.wwebjs_auth', 'session', 'SingletonSocket'),
    path.join(__dirname, '.wwebjs_auth', 'session', 'Default', 'SingletonLock'),
    path.join(__dirname, '.wwebjs_auth', 'session', 'Default', 'SingletonCookie'),
    path.join(__dirname, '.wwebjs_auth', 'session', 'Default', 'SingletonSocket')
];

arquivosAlvo.forEach(caminho => {
    try {
        fs.unlinkSync(caminho);
    } catch (e) {}
});

// ============================================================
// 🌍 SERVIDOR WEB DO QR CODE
// ============================================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (!ultimoQR) {
        res.end(`
            <div style="text-align:center; font-family:Arial; margin-top:100px;">
                <h2>🚀 Bot Conectado ou Iniciando!</h2>
                <p>Se o bot acabou de reiniciar, aguarde 10 segundos e atualize a página.</p>
                <meta http-equiv="refresh" content="5">
            </div>
        `);
        return;
    }
    const imgLink = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(ultimoQR)}`;
    res.end(`
        <div style="text-align:center; font-family:Arial; margin-top:40px; background-color:#f4f4f9; padding:20px;">
            <h1 style="color:#333;">💈 Conexão Dudu Barberhouse 💈</h1>
            <p style="font-size:18px; color:#666;">Abra o WhatsApp -> Aparelhos Conectados -> Conectar um Aparelho</p>
            <p style="color:red; font-weight:bold; font-size:14px;">⚠️ Essa tela atualiza sozinha a cada 5 segundos com o código válido!</p>
            <div style="margin:30px;">
                <img src="${imgLink}" alt="QR Code Automático" style="border:10px solid white; box-shadow:0px 0px 15px rgba(0,0,0,0.2); width:350px; height:350px;" />
            </div>
            <small style="color:#aaa;">Desenvolvido por Samuel - Controle de Ambiente Seguro</small>
        </div>
        <meta http-equiv="refresh" content="5">
    `);
}).listen(PORT, () => {
    console.log(`🌍 [WEB] Página de sincronização rodando na porta ${PORT}`);
});

client.initialize();