#!/bin/bash

# Claude账号Web验证服务停止脚本

cd /root/account_check

echo "🛑 正在停止Claude账号Web验证服务..."

# 检查PID文件是否存在
if [ ! -f "web-server.pid" ]; then
    echo "⚠️ PID文件不存在，尝试通过进程名停止服务..."
    pkill -f "node web-server.js"
    if [ $? -eq 0 ]; then
        echo "✅ 服务已停止"
    else
        echo "❌ 未找到运行中的服务"
    fi
    exit 0
fi

# 读取PID
WEB_PID=$(cat web-server.pid)

# 检查进程是否存在
if kill -0 $WEB_PID 2>/dev/null; then
    # 尝试优雅停止
    echo "🔄 正在停止进程 PID: $WEB_PID"
    kill $WEB_PID
    
    # 等待进程停止
    for i in {1..5}; do
        if ! kill -0 $WEB_PID 2>/dev/null; then
            echo "✅ 服务已成功停止"
            break
        fi
        echo "⏳ 等待进程停止... ($i/5)"
        sleep 1
    done
    
    # 如果还没停止，强制停止
    if kill -0 $WEB_PID 2>/dev/null; then
        echo "⚡ 强制停止进程..."
        kill -9 $WEB_PID
        sleep 1
        if ! kill -0 $WEB_PID 2>/dev/null; then
            echo "✅ 服务已强制停止"
        else
            echo "❌ 无法停止服务"
            exit 1
        fi
    fi
else
    echo "⚠️ 进程已不存在"
fi

# 清理PID文件
rm -f web-server.pid

echo "🧹 清理完成"