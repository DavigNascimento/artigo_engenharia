FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY migrations ./migrations
COPY web ./web
EXPOSE 8080
CMD ["npm", "start"]
