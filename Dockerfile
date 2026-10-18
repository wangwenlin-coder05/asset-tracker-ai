FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server.js wechat-extractor.js ./
COPY --chown=node:node backend ./backend
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
ENV PORT=3300 ENABLE_LOCAL_FEATURES=false BACKGROUND_JOBS_ENABLED=false
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3300)+'/healthz').then(response=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
