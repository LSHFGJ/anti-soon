#!/bin/bash
# 从WSL启动Chrome调试模式

cd /mnt/c/Windows

# 关闭所有Chrome进程
echo "Closing all Chrome processes..."
powershell.exe -Command "Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue" 2>/dev/null
sleep 3

# 用户数据目录 - D盘
USER_DATA_DIR="D:\\tmp\\chrome-antisoon-debug"

# 确保目录存在
powershell.exe -Command "New-Item -ItemType Directory -Force -Path '$USER_DATA_DIR' | Out-Null" 2>/dev/null

# 启动Chrome调试模式
echo "Starting Chrome with debugging on port 9222..."
echo "User data dir: $USER_DATA_DIR"
powershell.exe -Command "Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' -ArgumentList '--remote-debugging-port=9222','--user-data-dir=$USER_DATA_DIR','http://localhost:5173'" 2>/dev/null

sleep 5

# 检查端口
echo "Checking port 9222..."
result=$(powershell.exe -Command "netstat -an | Select-String ':9222.*LISTENING'" 2>/dev/null)
if [ -n "$result" ]; then
    echo "✓ Chrome debugging is running on port 9222"
    echo "  Connect with: agent-browser --cdp 9222"
else
    echo "✗ Failed to start Chrome debugging"
fi
