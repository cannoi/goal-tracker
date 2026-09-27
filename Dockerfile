FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
RUN mkdir -p /app/data
COPY package.json package-lock.json* ./
RUN npm ci --production
COPY server.js ./
COPY public/ ./public/
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/goal-tracker.sqlite
CMD ["npm", "start"]
