# UI Fixes & Blog Post — Execution Plan

## Phase 1: Balance Panel Heights
- **Files**: components/sections/{services,solutions,testimonials,blogs}.tsx
- **Fix**: Ensure all cards in a grid row have equal height
  - Add `h-full` to parent Card wrapper
  - Add `flex flex-col flex-1` to CardContent so content pushes footer down
  - Make the description area `flex-1` so variable-length descriptions don't break the layout

## Phase 2: Fix Theme Toggle (3 options → 2)
- **Files**: components/theme-provider.tsx, components/theme-toggle.tsx, app/layout.tsx
- **Fix**: 
  - Remove `enableSystem` prop from ThemeProvider to eliminate system detection
  - Set `defaultTheme="light"` for fast initial render
  - Change toggle to just cycle light ↔ dark (no "system")
  - This fixes the slow light mode load (was waiting for system preference detection)

## Phase 3: Add Brand Logo as Favicon
- **Files**: app/layout.tsx
- **Fix**: 
  - Use the existing public/images/gashotech_logo.webp as favicon
  - Add `<link rel="icon" type="image/webp" sizes="any" href="/images/gashotech_logo.webp" />` in the head
  - Optionally keep the existing favicon.ico as fallback

## Phase 4: Write Blog Post (delegate)
- **Content**: About GashoTech as a fully AI-driven business helping small businesses level up with AI agents
- **Mention**: create.gashotech.com (AI assistant platform) and revision.gashotech.com (ICDL exam prep)
- **Format**: JSON entry for data/blogs.json
- **Slug**: gashotech-ai-agents-small-businesses

## Phase 5: Blog Section Image
- Either: Use brand logo (public/images/gashotech_logo.webp) for the blog post
- Or: Generate an image using Chutes.ai if API available
