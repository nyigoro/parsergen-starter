#!/bin/bash

# JSON Parser Build Script
# Compiles the Lumina JSON Parser project

set -e  # Exit on error

echo "🔨 Building Lumina JSON Parser..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if luminac exists
if ! command -v luminac &> /dev/null; then
    echo -e "${YELLOW}⚠️  Warning: luminac compiler not found${NC}"
    echo "   Please ensure Lumina compiler is installed and in PATH"
    echo ""
    echo "   Expected usage:"
    echo "   luminac main.lm -o json-parser"
    exit 1
fi

echo -e "${BLUE}📦 Project Structure:${NC}"
ls -lh *.lm | awk '{print "   " $9 " (" $5 ")"}'
echo ""

echo -e "${BLUE}📊 Lines of Code:${NC}"
wc -l *.lm | tail -1 | awk '{print "   Total: " $1 " lines"}'
echo ""

echo -e "${BLUE}🔧 Compiling...${NC}"
luminac main.lm -o json-parser --emit-source-maps

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""
    echo -e "${BLUE}📝 Run the parser:${NC}"
    echo "   ./json-parser"
    echo ""
    echo -e "${BLUE}🧪 Test with sample JSON:${NC}"
    echo "   echo '{\"name\": \"Lumina\"}' | ./json-parser"
else
    echo ""
    echo -e "${YELLOW}❌ Build failed${NC}"
    exit 1
fi
