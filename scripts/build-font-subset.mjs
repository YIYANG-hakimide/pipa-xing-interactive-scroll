import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import subsetFont from "subset-font";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const worksDir = path.join(root, "src/content/works");
const sourceFont = path.join(root, "work/source-assets/fonts/LongCang-Regular.ttf");
const outputFont = path.join(root, "public/assets/fonts/LongCang-PipaXing.woff2");

const workFiles = (await readdir(worksDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => path.join(worksDir, entry.name));
const content = (await Promise.all(workFiles.map((file) => readFile(file, "utf8")))).join("\n");
const interfaceCharacters = "琵琶行曲终卷首唐白居易樂座中泣下谁最多江州司马青衫湿·，。？！；：《》0123456789";
const characters = [...new Set([...content, ...interfaceCharacters])].join("");
const source = await readFile(sourceFont);
const subset = await subsetFont(source, characters, { targetFormat: "woff2" });

await writeFile(outputFont, subset);
console.log(`Wrote ${path.relative(root, outputFont)} with ${characters.length} characters (${subset.length} bytes).`);
