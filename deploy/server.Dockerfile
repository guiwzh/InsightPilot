# Node API 的运行时镜像。只放打包好的单文件（pnpm build 在镜像外完成，见 scripts/deploy.sh），
# 没有 node_modules，和 CPU 架构无关，镜像小、构建快。
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY apps/server/dist/index.js ./index.js
USER node
EXPOSE 8787
CMD ["node", "index.js"]
