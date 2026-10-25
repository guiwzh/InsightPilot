#!/usr/bin/env bash
# 部署到服务器：在本机构建 → 通过 ssh 传镜像 → 远程启动。服务器不需要构建，也不需要访问 Docker Hub。
#
# 用法（在仓库根目录）：
#   DEPLOY_HOST=root@1.2.3.4 ./scripts/deploy.sh app    构建并发布当前代码（日常发布）
#   DEPLOY_HOST=root@1.2.3.4 ./scripts/deploy.sh data   把本机的 shop 样例数据和 app 表结构导入服务器（只在首次部署时执行）
#
# 服务器上已经有 Nginx Proxy Manager 占着 80/443 时，加上 DEPLOY_WITH_NPM=1：web 容器接入 NPM 的网络，不抢端口。
#
# 服务器上的 $DEPLOY_DIR/.env 需要提前准备好（数据库密码、DEEPSEEK_API_KEY、SITE_ADDRESS 等），见 docs/部署.md。
set -euo pipefail

HOST=${DEPLOY_HOST:?请设置 DEPLOY_HOST，例如 root@1.2.3.4}
DIR=${DEPLOY_DIR:-/opt/insightpilot}
PLATFORM=${DEPLOY_PLATFORM:-linux/amd64}
COMPOSE="docker compose -f docker-compose.prod.yml"
[ "${DEPLOY_WITH_NPM:-0}" = 1 ] && COMPOSE="$COMPOSE -f compose.npm.yml"

ship_image() {
  # 标签对应唯一的构建（见 deploy_app 里的 tag），服务器上已有这个标签就跳过，避免重复上传几百 MB
  local image=$1
  if ssh "$HOST" "docker image inspect $image >/dev/null 2>&1"; then
    echo "· $image 服务器上已存在，跳过"
  else
    echo "· 上传 $image"
    # 本机是多架构镜像存储（containerd），只导出服务器需要的那个架构
    docker save --platform "$PLATFORM" "$image" | gzip | ssh "$HOST" 'gunzip | docker load'
  fi
}

pull_base() {
  # 本机已有这个架构的镜像就不拉；国内访问 Docker Hub 时常超时，失败重试几次
  local image=$1
  docker image inspect --platform "$PLATFORM" "$image" >/dev/null 2>&1 && return 0
  for attempt in 1 2 3 4 5; do
    docker pull --platform "$PLATFORM" "$image" && return 0
    echo "· 拉取 $image 失败（第 $attempt 次），5 秒后重试"
    sleep 5
  done
  return 1
}

deploy_app() {
  local tag
  # 有未提交的改动时加上时间戳，保证同一个标签只对应一次构建
  tag=$(git rev-parse --short HEAD)
  git diff --quiet HEAD || tag="$tag-dirty-$(date +%m%d%H%M%S)"

  echo "== 构建前端和服务端"
  pnpm --filter @insightpilot/web build
  pnpm --filter @insightpilot/server build

  echo "== 构建 $PLATFORM 镜像（$tag）"
  docker build --platform "$PLATFORM" -f deploy/server.Dockerfile -t "insightpilot-server:$tag" .
  docker build --platform "$PLATFORM" -f deploy/web.Dockerfile -t "insightpilot-web:$tag" .
  pull_base postgres:18

  echo "== 传输镜像"
  ship_image "insightpilot-server:$tag"
  ship_image "insightpilot-web:$tag"
  ship_image postgres:18

  echo "== 上传配置并启动"
  ssh "$HOST" "mkdir -p $DIR/db"
  scp -q docker-compose.prod.yml deploy/compose.npm.yml "$HOST:$DIR/"
  scp -q db/init.sql "$HOST:$DIR/db/"
  # 服务器的 umask 可能是 027，scp 上去的文件只有 root 能读，容器里的 postgres 用户会读不了 init.sql，数据库初始化直接失败
  # 版本号写进 .env：以后在服务器上直接 docker compose up 也是这个版本；回滚就是把 TAG 改回旧版本
  ssh "$HOST" "cd $DIR && chmod 644 db/init.sql && sed -i '/^TAG=/d' .env && echo 'TAG=$tag' >> .env && $COMPOSE up -d --wait && $COMPOSE ps"
  echo "== 完成：$tag"
}

deploy_data() {
  # 不能用 local：EXIT trap 在函数返回之后才执行
  TMP_DIR=$(mktemp -d)
  trap 'rm -rf "$TMP_DIR"' EXIT

  echo "== 从本机开发库导出"
  docker exec insightpilot-pg pg_dump -U insightpilot -d insightpilot -n shop -Fc > "$TMP_DIR/shop.dump"
  docker exec insightpilot-pg pg_dump -U insightpilot -d insightpilot -n app --schema-only -Fc > "$TMP_DIR/app-schema.dump"
  scp -q "$TMP_DIR/shop.dump" "$TMP_DIR/app-schema.dump" "$HOST:/tmp/"

  echo "== 导入服务器"
  # 整段放在 { } 里：bash 会先读完整段再执行，避免 docker compose exec 把 stdin 里剩下的脚本当成输入吃掉
  ssh "$HOST" "bash -s -- '$DIR' '$COMPOSE'" <<'REMOTE'
{
  set -euo pipefail
  cd "$1"
  COMPOSE=$2
  set -a; . ./.env; set +a
  PSQL="$COMPOSE exec -T postgres psql -v ON_ERROR_STOP=1 -U $POSTGRES_USER -d $POSTGRES_DB"
  for f in shop app-schema; do
    $COMPOSE cp "/tmp/$f.dump" "postgres:/tmp/$f.dump"
    # init.sql 已经建好了两个 schema，跳过建 schema 的条目
    $COMPOSE exec -T postgres sh -c "pg_restore -l /tmp/$f.dump | grep -v ' SCHEMA - ' > /tmp/$f.list"
    $COMPOSE exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner -L "/tmp/$f.list" "/tmp/$f.dump"
  done
  # init.sql 里只读账号用的是开发默认密码，换成 .env 里的。printf 是 bash 内建命令，密码只经过 stdin，不出现在任何进程的命令行里
  q="'"
  printf "ALTER ROLE analyst_ro PASSWORD '%s';\n" "${ANALYST_RO_PASSWORD//$q/$q$q}" | $PSQL
  $PSQL -c ANALYZE
  rm -f /tmp/shop.dump /tmp/app-schema.dump
}
REMOTE
  echo "== 完成"
}

case "${1:-}" in
  app) deploy_app ;;
  data) deploy_data ;;
  *) echo "用法：DEPLOY_HOST=root@1.2.3.4 $0 app|data" && exit 1 ;;
esac
