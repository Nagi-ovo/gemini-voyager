#!/bin/bash
# 测试所有浏览器构建的完整性

set -e

echo "🧪 Testing Gemini Voyager Cross-Browser Builds"
echo "================================================"
echo ""

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Step 1: Building all targets...${NC}"
npm run build:all

echo ""
echo -e "${BLUE}🔍 Step 2: Analyzing build artifacts...${NC}"
echo ""

# Chrome 分析
echo -e "${YELLOW}Chrome Build:${NC}"
echo "  Location: dist_chrome/"
echo "  Size: $(du -sh dist_chrome | cut -f1)"
echo "  Files: $(find dist_chrome -type f | wc -l | xargs)"

if grep -q "chrome" dist_chrome/assets/browser-api*.js 2>/dev/null; then
  echo -e "  ${GREEN}✅ Using native chrome API${NC}"
else
  echo "  ❌ Not using chrome API"
fi

if grep -q "webextension-polyfill" dist_chrome/assets/browser-api*.js 2>/dev/null; then
  echo "  ⚠️  WARNING: Polyfill detected in Chrome build!"
else
  echo -e "  ${GREEN}✅ No polyfill (as expected)${NC}"
fi

echo ""

# Firefox 分析
echo -e "${YELLOW}Firefox Build:${NC}"
echo "  Location: dist_firefox/"
echo "  Size: $(du -sh dist_firefox | cut -f1)"
echo "  Files: $(find dist_firefox -type f | wc -l | xargs)"

if grep -q "chrome" dist_firefox/assets/browser-api*.js 2>/dev/null; then
  echo -e "  ${GREEN}✅ Using native chrome API${NC}"
else
  echo "  ❌ Not using chrome API"
fi

echo ""

# Safari 分析
echo -e "${YELLOW}Safari Build:${NC}"
echo "  Location: dist_safari/"
echo "  Size: $(du -sh dist_safari | cut -f1)"
echo "  Files: $(find dist_safari -type f | wc -l | xargs)"

if grep -q "webextension-polyfill" dist_safari/assets/browser-api*.js 2>/dev/null; then
  echo -e "  ${GREEN}✅ Using webextension-polyfill${NC}"
else
  echo "  ⚠️  WARNING: Polyfill NOT detected in Safari build!"
fi

echo ""
echo -e "${BLUE}📊 Step 3: File size comparison...${NC}"
echo ""

for browser in chrome firefox safari; do
  api_file=$(find dist_${browser} -name "*browser-api*.js" 2>/dev/null | head -1)
  if [ -f "$api_file" ]; then
    size=$(wc -c < "$api_file")
    echo "  ${browser}: $(echo $api_file | xargs basename) - ${size} bytes"
  fi
done

echo ""
echo -e "${BLUE}✅ Step 4: Manifest validation...${NC}"
echo ""

for browser in chrome firefox safari; do
  manifest="dist_${browser}/manifest.json"
  if [ -f "$manifest" ]; then
    version=$(grep '"version"' "$manifest" | head -1 | sed 's/.*: "\(.*\)".*/\1/')
    echo -e "  ${browser}: v${version} ${GREEN}✓${NC}"
  else
    echo "  ${browser}: ❌ manifest.json not found"
  fi
done

echo ""
echo -e "${GREEN}🎉 All builds completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  • Chrome: Load dist_chrome/ in chrome://extensions"
echo "  • Firefox: Load dist_firefox/ in about:debugging"
echo "  • Safari: Run 'xcrun safari-web-extension-converter dist_safari'"

