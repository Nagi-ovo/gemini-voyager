#!/bin/bash
# 刷新 Safari 扩展 - 完整流程

set -e

echo "🔄 刷新 Safari 扩展..."
echo ""

# 1. 重新构建
echo "📦 步骤 1: 重新构建 Safari 版本..."
npm run build:safari

echo ""
echo "✅ 构建完成"
echo ""

# 2. 提示关闭 Xcode
echo "⚠️  步骤 2: 请执行以下操作："
echo ""
echo "  1. 在 Xcode 中，点击 ⏹ Stop 按钮（停止运行）"
echo "  2. 关闭 'Gemini Voyager' App（如果还在运行）"
echo "  3. 按回车继续..."
read -p ""

# 3. 删除旧的 Xcode 项目（可选）
if [ -d "Gemini Voyager" ]; then
  echo ""
  echo "🗑️  步骤 3: 删除旧的 Xcode 项目..."
  rm -rf "Gemini Voyager"
  echo "✅ 已删除"
fi

# 4. 重新转换
echo ""
echo "🔄 步骤 4: 重新转换扩展为 Xcode 项目..."
xcrun safari-web-extension-converter dist_safari \
  --app-name "Gemini Voyager" \
  --macos-only

echo ""
echo "✅ 转换完成！"
echo ""
echo "📝 接下来请："
echo ""
echo "  1. 打开 Xcode 项目："
echo "     open 'Gemini Voyager/Gemini Voyager.xcodeproj'"
echo ""
echo "  2. 在 Xcode 中选择 'My Mac' 并点击 Run (▶️)"
echo ""
echo "  3. 打开 Safari → 开发 → 允许未签名的扩展 ✓"
echo ""
echo "  4. Safari → 设置 → 扩展 → 启用 Gemini Voyager"
echo ""

