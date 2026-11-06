// Inlines src/ into one self-contained file.
//   index.html       a full document that opens directly in a browser
//   dist/artifact.html  the same page without document tags, for hosts that add their own
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`./src/${f}`, import.meta.url), 'utf8');
const js = ['packs.js', 'planner.js', 'page-plan.js', 'widgets.js', 'runtime.js', 'inspector.js', 'page-render.js', 'app.js'].map(read).join('\n');
if (js.includes('</script')) throw new Error('A source file contains a closing script tag.');

const head = `<title>Morphogen</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600&family=Big+Shoulders+Display:wght@500;700&family=Bricolage+Grotesque:wght@500;700&family=Chakra+Petch:wght@400;600&family=DM+Mono:wght@400;500&family=Figtree:wght@400;600&family=Fira+Code:wght@400;500&family=Fraunces:wght@400;600&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Instrument+Sans:wght@400;600&family=Instrument+Serif&family=JetBrains+Mono:wght@400;500&family=Karla:wght@400;600&family=Martian+Mono:wght@400;500&family=Michroma&family=Share+Tech+Mono&family=Syne:wght@500;700&family=Unbounded:wght@400;600&family=Work+Sans:wght@400;600&display=swap">
<style>
${read('styles.css')}
</style>`;
const body = `${read('page.html')}
<script>
${js}
</script>`;

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/artifact.html', import.meta.url), `${head}\n${body}\n`);
writeFileSync(new URL('./index.html', import.meta.url), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${body}
</body>
</html>
`);
console.log('Built index.html and dist/artifact.html');
