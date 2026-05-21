FROM ghcr.io/puppeteer/puppeteer:22.6.0

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências do seu projeto
RUN npm ci

# Copia o restante do código do bot
COPY . .

# 📍 Aponta para o local correto onde o Chrome foi instalado na imagem base
ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

# 👑 Dá permissão de superusuário para o container ter acesso total ao Volume
USER root

# Comando para iniciar o seu robô
CMD ["npm", "start"]