FROM node:20-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
