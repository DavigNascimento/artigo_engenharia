# Uma imagem por serviço (ARG SERVICO), cada uma só com o código compartilhado e o do
# próprio serviço. Mesma imagem base (fixada por digest), mesma instalação e mesmo tipo de
# comando de inicialização do monolito.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
ARG SERVICO
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src/compartilhado ./src/compartilhado
COPY src/${SERVICO} ./src/servico
EXPOSE 8080
CMD ["node", "src/servico/main.js"]
