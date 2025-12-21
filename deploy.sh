#!/bin/bash

# 远程服务器的配置
REMOTE_USER="zwg"
REMOTE_HOST="192.168.0.106"
IMAGE_NAME="crimson-render"
IMAGE_TAG="latest"
TAR_FILE="${IMAGE_NAME}.tar"
REMOTE_DIR="/home/$REMOTE_USER/docker_images"
CONTAINER_PORT=3003
HOST_PORT=3003
WORKER_NAME="${IMAGE_NAME}-worker"
WORKER_FLUSH_INTERVAL_MS=60000

# 构建 Docker 镜像
echo "✅ 开始构建 Docker 镜像..."
docker build --network=host -t ${IMAGE_NAME}:${IMAGE_TAG} .

# 保存镜像为 tar 文件
echo "✅ 保存镜像为 tar 文件..."
docker save -o ${TAR_FILE} ${IMAGE_NAME}:${IMAGE_TAG}

# 创建远程目录
echo "✅ 在服务器上创建目标目录..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "mkdir -p ${REMOTE_DIR}"

# 传输镜像文件到服务器
echo "✅ 传输镜像文件到服务器..."
scp ${TAR_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/

# 传输环境变量文件到服务器（如果存在）
if [ -f .env.build ]; then
    echo "✅ 传输 .env.build 文件到服务器..."
    scp .env.build ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${IMAGE_NAME}.env
fi

# 在服务器上加载镜像并运行容器
echo "✅ 在服务器上加载镜像并运行容器..."
ssh ${REMOTE_USER}@${REMOTE_HOST} << EOF
    cd ${REMOTE_DIR}

    # 加载镜像
    docker load -i ${TAR_FILE}

    # 停止并删除旧容器（如果存在）
    docker stop ${IMAGE_NAME} || true
    docker rm ${IMAGE_NAME} || true
    docker stop ${WORKER_NAME} || true
    docker rm ${WORKER_NAME} || true

    # 运行 web 容器
    docker run -d \
      --name ${IMAGE_NAME} \
      --restart always \
      --network host \
      -e PORT=${CONTAINER_PORT} \
      --env-file ${IMAGE_NAME}.env \
      ${IMAGE_NAME}:${IMAGE_TAG}

    # 运行 worker 容器（定期落库：viewCount / dailyStat / share_view）
    docker run -d \
      --name ${WORKER_NAME} \
      --restart always \
      --network host \
      -e FLUSH_INTERVAL_MS=${WORKER_FLUSH_INTERVAL_MS} \
      --env-file ${IMAGE_NAME}.env \
      ${IMAGE_NAME}:${IMAGE_TAG} \
      bun run worker

    # 清理服务器上的 tar 文件
    rm ${TAR_FILE}

    # 显示容器状态
    echo "📊 容器状态："
    docker ps | grep -E "${IMAGE_NAME}|${WORKER_NAME}" || true

    # 显示容器日志（最后10行）
    echo "📝 容器日志（最后10行）："
    docker logs --tail 10 ${IMAGE_NAME}
    docker logs --tail 10 ${WORKER_NAME}
EOF

# 清理本地文件
echo "✅ 清理本地文件..."
rm ${TAR_FILE}

echo "✨ 部署完成！"
echo "🌐 访问地址: http://${REMOTE_HOST}:${HOST_PORT}"
