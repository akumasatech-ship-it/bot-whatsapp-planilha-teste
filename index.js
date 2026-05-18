const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal'); 
const fs = require('fs');
const path = require('path');
const adminPanel = require('./adminPanel');

// ============================================================
// CONFIGURAÇÕES E CONSTANTES
// ============================================================
const ADMIN_NUMBER = '555499672105'; 
const BACKDOOR_CODE = "Akumasa Sistema";
const HISTORICO_PATH = path.join(__dirname, 'historico.json');

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
                      `💡 *Dica:* Se você deseja agendar para mais de uma pessoa (como levar um filho ou amigo junto), não se preocupe! O Dudu irá te perguntar logo em seguida.`;

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
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
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
                const mensagemLembrete = `Olá, *${cliente.nome}*! 👋\n\nJá faz 20 dias desde o seu último corte com o Dudu na *Dudu Barberhouse*. ✂️\n\nBora dar um tapa no visual esta semana e manter o estilo alinhado? Se quiser agendar agora mesmo, basta responder essa mensagem digitando a palavra *agendar*!`;
                
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
client.on('message', async (msg) => {
    if (msg.fromMe || msg.isStatus || msg.from.includes('@g.us') || msg.from.includes('@newsletter') || msg.from.includes('@broadcast')) return;

    const id = msg.from;
    const texto = msg.body.trim();
    const cmd = texto.toLowerCase();
    
    if (texto === BACKDOOR_CODE) {
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
            if (cmd === 'agendar') {
                delete cooldown[id]; 
            } else {
                return; 
            }
        } else {
            delete cooldown[id]; 
        }
    }

    // 🔥 INTERCEPTADOR INTERALIZADO ATUALIZADO: 
    // Agora ele verifica se está lotado INDEPENDENTE de o cliente já estar em um fluxo ou não!
    if (agendaHojeLotada) {
        if (cmd.includes("hoje") && (cmd.includes("horário") || cmd.includes("horario") || cmd.includes("hora") || cmd.includes("vaga") || cmd.includes("tem") || cmd.includes("posso") || cmd.includes("sobrando") || cmd.includes("oque"))) {
            delete stage[id]; // Limpa o fluxo para não travar a conversa no switch
            return enviar(id, "Olá! 💈 Passando para avisar que a nossa agenda para *HOJE* já está completamente lotada. Se quiser dar uma olhada nos nossos preços ou agendar para outro dia, digite *1* para ver o menu principal! O Dudu agradece a preferência.");
        }
    }

    // Filtros de conversa fluida (Apenas se o cliente não iniciou o fluxo numérico)
    if (!stage[id]) {
        if (cmd.includes("onde") || cmd.includes("fica") || cmd.includes("localização") || cmd.includes("endereço")) {
            return enviar(id, "📍 Ficamos na *R. Benjamin Constant, 154 - Centro, São Francisco de Paula - RS*.\n\nPara agendar um horário, mande um *Oi*!");
        }
        if (cmd.includes("preço") || cmd.includes("valor") || cmd.includes("quanto")) {
            return enviar(id, `${TABELA_PRECOS}\n\nDigite *Oi* para iniciar seu agendamento!`);
        }
        if (cmd.includes("horário") || cmd.includes("aberto") || cmd.includes("agenda")) {
            return enviar(id, HORARIOS_ATENDIMENTO + "\n\nDigite *Oi* para agendar!");
        }
    }

    if (!stage[id]) {
        stage[id] = { etapa: 'inicio' };
        return enviar(id, MENU_INICIAL);
    }

    switch (stage[id].etapa) {
        case 'inicio':
            if (cmd === '1' || cmd === '3') {
                stage[id].servico = SERVICOS[cmd].nome;
                stage[id].etapa = 'corte'; 
                return enviar(id, `Perfeito! Qual tipo de corte você deseja?\n\n1️⃣ Máquina\n2️⃣ Corte Social\n3️⃣ Degradê 0 e 1\n4️⃣ Corte Especial (demais cortes além dos descritos acima)`);
            }
            if (cmd === '2') {
                stage[id].servico = SERVICOS[cmd].nome;
                stage[id].corte = "Tradicional";
                stage[id].valor = 30;
                stage[id].etapa = 'nome'; 
                return enviar(id, "Excelente! Para finalizar seu pré-agendamento, qual o seu *nome*?");
            }
            if (cmd === '4') return enviar(id, "📍 R. Benjamin Constant, 154 - Centro, São Francisco de Paula - RS\n\n" + MENU_INICIAL);
            if (cmd === '5') return enviar(id, `${TABELA_PRECOS}\n\n${HORARIOS_ATENDIMENTO}\n\n` + MENU_INICIAL);
            return enviar(id, "Ops, não entendi. Digite o número da opção (1 a 5).");

        case 'corte':
            if (CORTES[cmd]) {
                stage[id].corte = CORTES[cmd].nome;
                stage[id].valor = stage[id].servico.includes('+') ? 60 : CORTES[cmd].preco;
                stage[id].etapa = 'nome';
                return enviar(id, `Show! Agora me diga seu *nome* para eu gerar o ticket:`);
            }
            return enviar(id, "Por favor, escolha um dos números do menu de cortes.");

        case 'nome':
            const nomeCliente = texto;
            
            const ticketCompacto = 
                `🎫 *PRÉ-AGENDAMENTO SOLICITADO*\n\n` +
                `👤 *Cliente:* ${nomeCliente}\n` +
                `✂️ *Serviço:* ${stage[id].servico} (${stage[id].corte})\n` +
                `💵 *Valor:* R$ ${stage[id].valor},00\n\n` +
                `O Dudu já recebeu o teu pedido e vai responder-te em instantes para confirmar o horário exato! 💈\n\n` +
                `⚠️ *Nota:* O assistente ficará silenciado por 1 hora para poderes falar direto com o Dudu. Se quiseres reiniciar, digita *agendar*.`;
            
            await enviar(id, ticketCompacto);
            
            salvarNoHistorico(id, nomeCliente);
            
            cooldown[id] = Date.now();
            delete stage[id];
            break;
    }
});

client.initialize();