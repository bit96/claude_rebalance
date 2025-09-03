#!/bin/bash

# Claude账号Web验证服务启动脚本

cd /root/account_check

echo "🚀 正在启动Claude账号Web验证服务..."

# 检查3001端口是否被占用
if netstat -tlnp 2>/dev/null | grep -q ":3001 "; then
    echo "❌ 端口3001已被占用，请先停止占用该端口的服务"
    exit 1
fi

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖包..."
    npm install
fi

# 后台启动服务
echo "🔄 启动服务中..."
nohup node web-server.js > /dev/null 2>&1 &
WEB_PID=$!

# 保存PID
echo $WEB_PID > web-server.pid

# 等待服务启动
sleep 3

# 检查服务是否启动成功
if kill -0 $WEB_PID 2>/dev/null; then
    echo "✅ Claude账号Web验证服务启动成功！"
    echo "📱 本地访问: http://localhost:3001"
    echo "🌐 外网访问: http://47.99.45.175:3001"
    echo "📋 进程PID: $WEB_PID"
    echo ""
    echo "💡 使用 ./stop-web.sh 停止服务"
else
    echo "❌ 服务启动失败"
    exit 1
fi