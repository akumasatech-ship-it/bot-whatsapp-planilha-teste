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
    const { id, texto, cmd, msg, client, stage, uptime, botAtivo, isHojeLotado, setHojeLotado } = params;

    // --- ENTRADA NO PAINEL ---
    if (cmd === GATILHO && !adminAuth[id]) {
        adminAuth[id] = 'ok';
        const menuAdmin = `🔓 *PAINEL ADMIN ATIVADO*\n\n` +
                          `📝 *Comandos Disponíveis:*\n` +
                          `• *status* — Ver saúde do sistema\n` +
                          `• *on* — Ligar bot para clientes\n` +
                          `• *off* — Desligar bot para clientes\n` +
                          `• *lotado* — Bloquear/Liberar vagas para hoje 🚨\n` +
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
            return client.sendMessage(id, `📊 *STATUS SISTEMA*\n\n• Uptime: ${horas}h ${minutos}m\n• Bot Ativo: ${botAtivo() ? 'SIM ✅' : 'NÃO 🔴'}\n• Agenda de Hoje Lotada: ${isHojeLotado() ? 'SIM 🛑' : 'NÃO 🟢'}\n• Sessões: ${Object.keys(stage).length} ativas`);
        }

        if (cmd === 'lotado') {
            const novoEstado = !isHojeLotado();
            setHojeLotado(novoEstado);
            if (novoEstado) {
                return client.sendMessage(id, "🛑 *AGENDA DE HOJE MARCADA COMO LOTADA.*\nClientes que perguntarem por vagas hoje receberão um aviso de encerramento automático.");
            } else {
                return client.sendMessage(id, "🟢 *AGENDA DE HOJE LIBERADA.*\nPerguntas relacionadas a horários para hoje voltaram a passar normalmente.");
            }
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

        // --- BACKUP ROBUSTO ATUALIZADO E RECURSIVO ---
        if (cmd === 'backup') {
            await client.sendMessage(id, "📦 Gerando backup completo da sessão e dados locais...");
            const zipPath = path.join(__dirname, 'session_railway.zip');
            const authPath = path.join(__dirname, '.wwebjs_auth');
            const historicoPath = path.join(__dirname, 'historico.json');

            try {
                const zip = new AdmZip();
                
                // 1. Inclui o arquivo de histórico
                if (fs.existsSync(historicoPath)) {
                    zip.addLocalFile(historicoPath);
                }

                // 2. Mapeamento recursivo e filtrado da pasta de autenticação
                if (fs.existsSync(authPath)) {
                    
                    // Função auxiliar para varrer todas as subpastas profundamente
                    const adicionarPastaRecursiva = (diretorioAtual, rotaNoZip) => {
                        const arquivos = fs.readdirSync(diretorioAtual);
                        
                        arquivos.forEach(item => {
                            const caminhoCompleto = path.join(diretorioAtual, item);
                            const estatisticas = fs.lstatSync(caminhoCompleto);
                            const caminhoNoZip = rotaNoZip ? path.join(rotaNoZip, item) : item;

                            // Ignora pastas inúteis de cache pesado que travam e incham o arquivo
                            if (item === 'Cache' || item === 'Code Cache' || item === 'GPUCache' || item === 'Local Storage') {
                                return;
                            }

                            if (estatisticas.isDirectory()) {
                                adicionarPastaRecursiva(caminhoCompleto, caminhoNoZip);
                            } else {
                                // Ignora arquivos de trava do sistema criados pelo Chromium ativo
                                if (!item.includes('lock') && !item.includes('Singleton')) {
                                    try {
                                        zip.addLocalFile(caminhoCompleto, rotaNoZip);
                                    } catch (err) {
                                        console.log(`[BACKUP] Pulando arquivo ocupado: ${item}`);
                                    }
                                }
                            }
                        });
                    };

                    // Dispara a varredura dentro da pasta .wwebjs_auth colocando os dados dentro de uma pasta de mesmo nome no ZIP
                    adicionarPastaRecursiva(authPath, '.wwebjs_auth');

                    // Escreve o arquivo ZIP final no disco temporário
                    zip.writeZip(zipPath);
                    
                    // Prepara o arquivo para o envio
                    const media = MessageMedia.fromFilePath(zipPath);
                    
                    await client.sendMessage(id, media, { 
                        caption: "📑 *BACKUP COMPLETO E EXTRAÍDO!*\n\nSua sessão ativa do WhatsApp e o arquivo de histórico foram empacotados com sucesso para uso em novos servidores." 
                    });
                    
                    // Limpa o arquivo temporário gerado localmente
                    fs.unlinkSync(zipPath); 
                } else {
                    await client.sendMessage(id, "❌ Erro: Pasta de credenciais (.wwebjs_auth) não foi encontrada no servidor local.");
                }
            } catch (e) {
                await client.sendMessage(id, "❌ Falha crítica ao gerar o pacote de backup: " + e.message);
            }
            return;
        }
    }    
}

module.exports = {
    isAdminFlow,
    forceAdmin,
    handleAdmin
};