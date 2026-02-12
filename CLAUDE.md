# beauty-mermaid

A mermaid.live-style diagram editor using the [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) rendering library (vendored locally). Supports SVG and ASCII output.

## Tech Stack

- **Vite** — dev server and build tool
- **CodeMirror 6** — code editor (`basicSetup` from `codemirror` package)
- **beautiful-mermaid** — vendored in `lib/beautiful-mermaid/` (TypeScript source, NOT an npm dep)
- **dagre** — graph layout engine, pre-bundled as `lib/dagre.bundle.js` (ESM)
- **Docker + nginx** — production deployment

## Project Structure

```
index.html              — Single-page app shell (editor + preview layout)
src/
  main.js               — App entry: editor init, rendering, UI event handlers
  samples.js            — Sample diagram code (flowchart, sequence, state, class, ER)
  style.css             — Full styling with CSS variables, light/dark themes
lib/
  dagre.bundle.js       — Pre-built ESM bundle of @dagrejs/dagre + graphlib
  beautiful-mermaid/    — Vendored library source (TypeScript)
    index.ts            — Public API: renderMermaid(), renderMermaidAscii(), THEMES
    parser.ts           — Flowchart & state diagram parser
    layout.ts           — Dagre-based graph layout + post-processing
    renderer.ts         — SVG renderer (string concatenation, no DOM)
    dagre-adapter.ts    — Edge orthogonalization + endpoint clipping
    theme.ts            — 15+ color themes, CSS variable system
    styles.ts           — Font metrics, spacing constants
    types.ts            — Core TypeScript interfaces
    ascii/              — ASCII/Unicode box-drawing renderer
    class/              — Class diagram parser/layout/renderer
    er/                 — ER diagram parser/layout/renderer
    sequence/           — Sequence diagram parser/layout/renderer
vite.config.js          — Minimal Vite config
Dockerfile              — Multi-stage build (Node build → nginx serve)
docker-compose.yml      — Single service, port configurable via PORT env
nginx.conf              — Static serving with gzip + asset caching
DEPLOY.md               — Self-hosted deployment guide
```

## Key Architecture Decisions

### Vendored beautiful-mermaid
The library source lives in `lib/beautiful-mermaid/` instead of being an npm dependency. This allows direct modification of the rendering engine (edge clipping, arrowheads, layout fixes). The library's only runtime dep (`@dagrejs/dagre`) is pre-bundled into `lib/dagre.bundle.js` via esbuild because dagre's ESM entry uses `require("@dagrejs/graphlib")` which browsers can't resolve.

### Dagre import path
All layout files import dagre from the local bundle:
- `lib/beautiful-mermaid/layout.ts` → `import dagre from '../dagre.bundle.js'`
- `lib/beautiful-mermaid/class/layout.ts` → `import dagre from '../../dagre.bundle.js'`
- `lib/beautiful-mermaid/er/layout.ts` → `import dagre from '../../dagre.bundle.js'`

If `@dagrejs/dagre` is updated, regenerate the bundle:
```bash
npx esbuild node_modules/@dagrejs/dagre/dist/dagre.cjs.js --bundle --format=esm --outfile=lib/dagre.bundle.js --platform=browser
```

### SVG Rendering Pipeline
```
Mermaid text → parser.ts (parse) → layout.ts (dagre layout + post-processing) → renderer.ts (SVG string)
```

Post-processing in layout.ts includes:
- `snapToOrthogonal()` — converts diagonal edges to 90-degree segments
- `clipEndpointsToNodes()` — fixes edge endpoints at node boundaries (boundary-first detection for correct approach direction)
- `removeBacktracking()` — removes path segments that reverse direction
- `spreadOverlappingEndpoints()` — separates multiple edges at the same node side
- `nudgeEdgeLabelsFromHeaders()` — prevents edge labels from overlapping subgraph headers
- `expandGroupsForHeaders()` — adds space for subgraph header bands

### SVG Paint Order (renderer.ts)
```
1. Group backgrounds (subgraph rects + header bands)
2. Edge lines (polylines without arrowheads)
3. Node shapes
4. Node labels (supports <br/>, <b>, <i>, <u> via SVG tspan)
5. Edge arrowheads (explicit SVG polygons, above nodes)
6. Edge labels (with background pills)
7. Group header labels (always on top)
```
Arrowheads are rendered as explicit `<polygon>` elements (not SVG markers) on a layer above nodes to prevent node shapes from covering them.

### HTML Tag Support in Labels
- `<br/>` → multi-line text (SVG: multiple tspan with dy; ASCII: replaced with space)
- `<b>`, `<i>`, `<u>`, `<s>` → SVG tspan with font-weight/style/decoration
- Node sizing (`estimateNodeSize()`) strips HTML tags before measuring, uses widest line for width
- ASCII renderer strips all HTML tags via `stripHtmlTags()` in `ascii/converter.ts`

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build to dist/
npm run preview      # Preview production build

# Docker
docker compose up -d --build    # Build and run (port 3000)
PORT=8080 docker compose up -d  # Custom port
```

## Common Modification Patterns

### Fixing edge routing issues
Edge clipping logic is in `lib/beautiful-mermaid/dagre-adapter.ts` → `clipEndpointsToNodes()`. The function uses boundary-first detection: if an endpoint is near a node's top/bottom/left/right edge, it clips to that boundary and ensures the final segment is orthogonal.

### Fixing rendering issues
SVG output is pure string concatenation in `lib/beautiful-mermaid/renderer.ts`. No DOM manipulation. All colors use CSS custom properties (`var(--_xxx)`).

### Adding diagram type support
Each diagram type has its own `parser.ts`, `layout.ts`, `renderer.ts` under a subdirectory. The main `index.ts` detects diagram type from the first line and dispatches to the correct pipeline.

### Testing changes
```bash
# Quick test: generate SVG and inspect
cat > /tmp/test.mjs << 'EOF'
import { renderMermaid } from './lib/beautiful-mermaid/index.ts';
import fs from 'fs';
const svg = await renderMermaid('graph TD; A-->B');
fs.writeFileSync('/tmp/test.svg', svg);
EOF
npx vite-node /tmp/test.mjs
open /tmp/test.svg
```
