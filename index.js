const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); 
const fs = require('fs');
const path = require('path');
const adminPanel = require('./adminPanel');

// ============================================================
// CONFIGURAÇÕES E CONSTANTES
// ============================================================
const BACKDOOR_CODE = "Painel de comando"; 
const HISTORICO_PATH = path.join(__dirname, 'historico.json');

// 🧪 NÚMERO DO SEU BOT DE TESTE (NÚMERO DO SAMUEL)
// Coloque aqui o seu número com o 55 + DDD + Número (ex: '5554999999999')
const NUMERO_TESTE_SAMUEL = '5554999972306'; 

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

const MENU_INICIAL = `Olá! Seja bem vindo a Dudu Barbehouse💈\n\n` +
                      `Como posso te ajudar?\n\n` +
                      `1️⃣ Só Cabelo\n` +
                      `2️⃣ Só Barba\n` +
                      `3️⃣ Cabelo + Barba\n` +
                      `4️⃣ Onde vocês ficam? 📍\n` +
                      `5️⃣ Ver Preços e Horários 💰\n\n` +
                      `*Digite apenas o número da opção.*\n\n` +
                      `💡 *Dica:* Se você deseja agendar para mais de uma pessoa (filhos ou amigo), avise o Dudu após a generation do seu pedido!`;

// ============================================================
// ESTADO GLOBAL E UTILITÁRIOS
// ============================================================
const stage = {};
const cooldown = {}; 
const uptime = new Date();
let botAtivo = true;
let agendaHojeLotada = false; 

function salvarNoHistorico(id, nomeCliente) {
    let dados = {};
    if (fs.existsSync(HISTORICO_PATH)) {
        try { dados = JSON.parse(fs.readFileSync(HISTORICO_PATH, 'utf-8')); } catch (e) { dados = {}; }
    }
    dados[id] = {
        nome: nomeCliente,
        ultimaInteracao: Date.now(),
        lembreteEnviado: false
    };
    fs.writeFileSync(HISTORICO_PATH, JSON.stringify(dados, null, 2));
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
        return await client.sendMessage(destino, texto);
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
    const qrLink = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log(`\n🔗 Link para abrir no navegador:\n${qrLink}\n`);
});

client.on('ready', () => {
    console.log('\n🚀 SISTEMA DUDU BARBERHOUSE ONLINE\n');
    dispararRotinaRecorrencia(); 
});

// ============================================================
// PROCESSAMENTO DE MENSAGENS
// ============================================================
client.on('message_create', async (msg) => {
    if (msg.isStatus || msg.from.includes('@g.us') || msg.from.includes('@newsletter') || msg.from.includes('@broadcast')) return;
    if (msg.hasMedia || msg.type !== 'chat') return;

    const id = msg.from;
    const texto = msg.body.trim();
    const cmd = texto.toLowerCase(); // Tudo em minúsculo para comparar sem erro

    // 🛡️ ISOLAMENTO DE AMBIENTE (IGNORA O SEU BOT DE TESTE)
    if (id.includes(NUMERO_TESTE_SAMUEL)) return;

    // 🛡️ ESCUDO ANTI-LOOP EXPANDIDO
    if (
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
    
    // 🔥 Aceita se for digitado exatamente a sua chave ou o termo antigo
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
    
    // ... restante do código (cooldown, stages, etc) continua exatamente igual abaixo ...

    if (!botAtivo) return;

    if (cooldown[id]) {
        const tempoPassado = Date.now() - cooldown[id];
        const umaHora = 60 * 60 * 1000;
        if (tempoPassado < umaHora) {
            if (cmd === 'agendar') {
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

    // Filtros de conversa fluida
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
        return enviar(id, MENU_INICIAL);
    }

    switch (stage[id].etapa) {
        case 'inicio':
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
            if (cmd === '4') { stage[id].timestamps = []; return enviar(id, "📍 R. Benjamin Constant, 154 - Centro, São Francisco de Paula - RS\n\n" + MENU_INICIAL); }
            if (cmd === '5') { stage[id].timestamps = []; return enviar(id, `${TABELA_PRECOS}\n\n${HORARIOS_ATENDIMENTO}\n\n` + MENU_INICIAL); }
            
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
            return enviar(id, "Ops, não entendi. Digite o número da opção (1 a 5).");

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
                `⚠️ *Nota:* O assistente ficará silenciado por 1 hora para você poder falar direto com o Dudu. Se quiseres reiniciar, digite *agendar*.`;
            
            await enviar(id, ticketCompacto);
            
            salvarNoHistorico(id, nomeCliente);
            
            cooldown[id] = Date.now();
            delete stage[id];
            break;
    }
});

// ============================================================
// ANTI-TRAVA CIRÚRGICO: DELETA DIRETAMENTE NOS LOCAIS CONHECIDOS
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
    if (fs.existsSync(caminho)) {
        try {
            fs.unlinkSync(caminho);
            console.log(`🧹 [ANTI-TRAVA] Removido com sucesso: ${path.basename(caminho)}`);
        } catch (e) {
            console.error(`⚠️ Erro ao remover lock direto:`, e.message);
        }
    }
});

client.initialize();