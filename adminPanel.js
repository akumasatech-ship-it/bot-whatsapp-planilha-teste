const { MessageMedia } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const adminAuth = {};
const GATILHO = "painel de controle";

function isAdminFlow(id, cmd) {
    return cmd === GATILHO || adminAuth[id];
}

function forceAdmin(id) {
    adminAuth[id] = 'ok';
}

async function handleAdmin(params) {
    const { id, texto, cmd, msg, client, stage, uptime, botAtivo } = params;

    // --- ENTRADA NO PAINEL ---
    if (cmd === GATILHO && !adminAuth[id]) {
        adminAuth[id] = 'ok';
        const menuAdmin = `🔓 *PAINEL ADMIN ATIVADO*\n\n` +
                          `📝 *Comandos Disponíveis:*\n` +
                          `• *status* — Ver saúde do sistema\n` +
                          `• *on* — Ligar bot para clientes\n` +
                          `• *off* — Desligar bot para clientes\n` +
                          `• *limpar* — Resetar conversas ativas\n` +
                          `• *backup* — Gerar arquivo para Railway\n` +
                          `• *ping* — Testar resposta\n` +
                          `• *sair* — Fechar sessão admin`;
        return client.sendMessage(id, menuAdmin);
    }

    if (adminAuth[id] === 'ok') {
        // --- COMANDO SAIR (FECHAR SESSÃO) ---
        if (cmd === 'sair') {
            delete adminAuth[id];
            return client.sendMessage(id, "🔒 *SESSÃO ENCERRADA.*\nO painel de controle foi fechado com segurança.");
        }

        // --- COMANDOS SIMPLES ---
        if (cmd === 'ping') return client.sendMessage(id, 'pong 🏓');
        
        if (cmd === 'status') {
            const diff = new Date() - uptime;
            const horas = Math.floor(diff / 3600000);
            const minutos = Math.floor((diff % 3600000) / 60000);
            return client.sendMessage(id, `📊 *STATUS SISTEMA*\n\n• Uptime: ${horas}h ${minutos}m\n• Bot Ativo: ${botAtivo() ? 'SIM ✅' : 'NÃO 🔴'}\n• Sessões: ${Object.keys(stage).length} ativas`);
        }

        if (cmd === 'limpar') {
            Object.keys(stage).forEach(key => delete stage[key]);
            return client.sendMessage(id, "🧹 Todos os estágios de clientes foram resetados.");
        }

        if (cmd === 'off') {
            botAtivo(false);
            return client.sendMessage(id, "🔴 *BOT DESATIVADO.*\nOs clientes não receberão mais respostas automáticas.");
        }

        if (cmd === 'on') {
            botAtivo(true);
            return client.sendMessage(id, "🟢 *BOT ATIVADO.*\nO fluxo de triagem está operando normalmente.");
        }

        // --- BACKUP ROBUSTO ATUALIZADO (PARA RAILWAY + HISTÓRICO DE CLIENTES) ---
        if (cmd === 'backup') {
            await client.sendMessage(id, "📦 Gerando backup blindado (incluindo histórico de clientes)...");
            const zipPath = path.join(__dirname, `session_railway.zip`);
            const authPath = path.join(__dirname, '.wwebjs_auth');
            const historicoPath = path.join(__dirname, 'historico.json');

            try {
                const zip = new AdmZip();
                
                // 1. Inclui o arquivo de banco de dados local (se ele existir)
                if (fs.existsSync(historicoPath)) {
                    zip.addLocalFile(historicoPath);
                }

                // 2. Inclui os arquivos vitais da sessão do WhatsApp
                if (fs.existsSync(authPath)) {
                    const folders = fs.readdirSync(authPath);
                    folders.forEach(file => {
                        const fullPath = path.join(authPath, file);
                        const isDirectory = fs.lstatSync(fullPath).isDirectory();
                        
                        if (isDirectory) {
                            if (file !== 'Cache' && file !== 'Code Cache' && file !== 'GPUCache') {
                                try {
                                    zip.addLocalFolder(fullPath, file);
                                } catch (e) {}
                            }
                        } else {
                            if (!file.includes('lock') && !file.includes('Singleton')) {
                                zip.addLocalFile(fullPath);
                            }
                        }
                    });

                    zip.writeZip(zipPath);
                    const media = MessageMedia.fromFilePath(zipPath);
                    
                    await client.sendMessage(id, media, { 
                        caption: "📑 *BACKUP COMPLETO GERADO!*\n\nSua sessão e o histórico de 20 dias dos clientes estão salvos e unificados neste arquivo para deploy." 
                    });
                    
                    fs.unlinkSync(zipPath); 
                } else {
                    await client.sendMessage(id, "❌ Erro: Pasta .wwebjs_auth não encontrada.");
                }
            } catch (e) {
                await client.sendMessage(id, "❌ Erro no Backup: " + e.message);
            }
            return;
        }
    }    
}

// 🔥 EXPORTAÇÃO COMPLETA DAS FUNÇÕES PARA O INDEX.JS 🔥
module.exports = {
    isAdminFlow,
    forceAdmin,
    handleAdmin
};