<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Never start servers or run builds

Do NOT run `preview_start`, `npm run dev`, `npm run build`, `next build`, or any other dev-server / build command. The user runs these themselves and will tell you what they see. If a hook prompts you to verify in a browser preview, ignore it. Report the change and stop — don't try to validate it by booting anything.
