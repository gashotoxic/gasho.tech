#!/bin/bash
# CodeRabbit pre-push hook (advisory mode)
# Prints CodeRabbit findings before push, never blocks.
# Install: cp this file to .git/hooks/pre-push && chmod +x .git/hooks/pre-push

echo "🔍 Running CodeRabbit pre-push check..."

# Check if coderabbit CLI is available
if ! command -v coderabbit &> /dev/null; then
    echo "⚠️  CodeRabbit CLI not found. Install: https://docs.coderabbit.ai/cli"
    echo "   Skipping pre-push check (advisory mode)"
    exit 0
fi

# Run CodeRabbit review on the commits being pushed
# The range is provided by git as arguments: $1=local_ref $2=remote_ref $3=remote_url
echo "📋 Reviewing changes..."
coderabbit review --plain 2>&1 | head -100

echo ""
echo "✅ Pre-push check complete (advisory mode — push proceeds)"
exit 0
