# Mesma imagem base (fixada por digest), mesma instalação e mesmo comando de
# inicialização usados pelos microsserviços.
FROM node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY migrations ./migrations
COPY web ./web
EXPOSE 8080
CMD ["node", "src/server.js"]
