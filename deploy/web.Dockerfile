# Caddy：托管前端静态文件、反向代理 /api、自动申请 HTTPS 证书
FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY apps/web/dist /srv/web
