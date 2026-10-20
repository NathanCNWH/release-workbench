import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const result = await build({
  entryPoints: ["src/main.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  jsx: "automatic",
  outfile: "preview/app.js",
  define: { "process.env.NODE_ENV": '"production"' },
  metafile: true,
});
const js = result.outputFiles
  .find((file) => file.path.endsWith(".js"))
  .text.replaceAll("</script", "<\\/script");
const css = result.outputFiles.find((file) => file.path.endsWith(".css")).text;
let html = await readFile("index.html", "utf8");
const entry = '<script type="module" src="/src/main.tsx"></script>';
if (!html.includes(entry)) throw new Error('Preview entry script was not found');
html = html.replace(entry, () => `<style>${css}</style><script>${js}</script>`);
if (html.includes(entry)) throw new Error('Preview still contains the development entry');
const folder = resolve(process.argv[2] || "output/preview");
await mkdir(folder, { recursive: true });
const destination = resolve(folder, "Release-Workbench-前端样稿.html");
await writeFile(destination, html);
console.log(
  JSON.stringify({
    html: destination,
    bytes: Buffer.byteLength(html),
    standalone: true,
  }),
);
