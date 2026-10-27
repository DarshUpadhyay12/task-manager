FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5001 5002 5003 5005

CMD ["npm", "run", "start:gateway"]
