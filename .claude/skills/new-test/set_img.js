#!/usr/bin/env node
/*
 * Заменяет строку `const IMG = {...};` в тесте картинками из файлов, чтобы не править base64 руками.
 *
 *   node .claude/skills/new-test/set_img.js <тест.html> <id>=<картинка.jpg> [<id>=<картинка.jpg> …]
 *
 * Пример: node .claude/skills/new-test/set_img.js History_5_grade/Paragraph_20_Greek_Civilization.html knossos=knossos.jpg map=map.jpg
 * Старые картинки удаляются все: перечисли каждую, которая нужна тесту. Тип берётся из расширения (jpg, png).
 */
const fs = require("fs");
const path = require("path");

const [file, ...pairs] = process.argv.slice(2);
if (!file || !pairs.length) { console.error("Нужно: set_img.js <тест.html> <id>=<файл> …"); process.exit(1); }

const IMG = {};
for (const p of pairs) {
  const at = p.indexOf("=");
  if (at < 1) { console.error(`Не понял «${p}»: нужно id=файл`); process.exit(1); }
  const id = p.slice(0, at), src = p.slice(at + 1);
  const ext = path.extname(src).slice(1).toLowerCase();
  const mime = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" }[ext];
  if (!mime) { console.error(`«${src}»: поддерживаются jpg и png`); process.exit(1); }
  const data = fs.readFileSync(src);
  IMG[id] = `data:${mime};base64,` + data.toString("base64");
  console.log(`${id}: ${src}, ${Math.round(data.length / 1024)} КБ`);
}

const lines = fs.readFileSync(file, "utf8").split("\n");
const i = lines.findIndex(l => l.startsWith("const IMG = "));
if (i < 0) { console.error(`В ${file} нет строки «const IMG = …»`); process.exit(1); }
lines[i] = "const IMG = " + JSON.stringify(IMG) + ";";
fs.writeFileSync(file, lines.join("\n"));
console.log(`${file}: картинок ${pairs.length}, файл ${Math.round(fs.statSync(file).size / 1024)} КБ`);
