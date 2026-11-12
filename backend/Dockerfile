FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads

EXPOSE 5000

CMD ["npm", "start"]
