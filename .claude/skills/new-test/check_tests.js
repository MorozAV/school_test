#!/usr/bin/env node
/*
 * Проверка тестов сайта. Без зависимостей, нужен только Node.
 *
 *   node .claude/skills/new-test/check_tests.js                 все тесты
 *   node .claude/skills/new-test/check_tests.js <файл.html> …   только эти тесты
 *
 * Главная страница и общие для всех тестов правила проверяются всегда.
 * Код страницы выполняется на заглушке браузера, поэтому проверяются те вопросы,
 * которые увидит ученик, а не исходные массивы (их имена в каждом тесте свои).
 * Вопросы и варианты выбираются случайно, поэтому блоки собираются RUNS раз.
 * Код выхода 1 — есть ошибки, замечания на него не влияют.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const RUNS = 40;
const FINAL_SIZE = 20;

const problems = [];
const seen = new Set();
const report = (level, where, text) => {
  const line = `${where}: ${text}`;
  if (seen.has(line)) return;
  seen.add(line);
  problems.push({ level, line });
};
const error = (where, text) => report("ошибка", where, text);
const warn = (where, text) => report("замечание", where, text);

const norm = s => String(s).trim().replace(/\s+/g, " ").toLowerCase();
const short = s => { s = String(s); return s.length > 60 ? s.slice(0, 57) + "…" : s; };
const hasText = s => typeof s === "string" && s.trim() !== "";
const qid = q => norm(q.q) + "\n" + norm(q.a);

/* ---------- заглушка браузера ---------- */
function element(){
  return {
    innerHTML: "", className: "", value: "", style: {}, dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    addEventListener(){}, removeEventListener(){}, setAttribute(){}, getAttribute: () => null,
    appendChild(){}, remove(){}, focus(){}, blur(){}, click(){}, scrollIntoView(){},
    querySelector: () => element(), querySelectorAll: () => [],
  };
}

function runPage(src){
  const keys = new Set();
  const nodes = new Map();
  const byKey = s => { if (!nodes.has(s)) nodes.set(s, element()); return nodes.get(s); };
  const document = {
    ...element(), documentElement: element(), body: element(), createElement: () => element(),
    querySelector: byKey, getElementById: id => byKey("#" + id),
  };
  const sandbox = {
    document, console: { log(){}, warn(){}, error(){} },
    setTimeout: () => 0, clearTimeout(){}, scrollTo(){}, addEventListener(){},
    matchMedia: () => ({ matches: false, addEventListener(){} }),
    location: { href: "", search: "", hash: "" }, navigator: { userAgent: "" },
    localStorage: { getItem: k => { keys.add(k); return null; }, setItem: k => { keys.add(k); }, removeItem(){} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const expose = `\n;window.__page = { BLOCKS, IMG: typeof IMG === "undefined" ? {} : IMG,
    PICS: typeof PICS === "undefined" ? [] : PICS };`;
  new vm.Script(src + expose).runInContext(sandbox, { timeout: 5000 });
  return { ...sandbox.__page, keys, app: byKey("#app") };
}

/* ---------- один вопрос ---------- */
function checkQuestion(where, q, IMG){
  const name = `${where}, вопрос «${short(q.q)}»`;
  if (!hasText(q.q)) error(where, "вопрос без текста");
  if (!hasText(q.a)) error(name, "нет верного ответа");
  if (!hasText(q.e)) warn(name, "нет пояснения к ответу");
  if (q.img && !IMG[q.img]) error(name, `картинка «${q.img}» не найдена в IMG`);

  const opts = Array.isArray(q.opts) ? q.opts : [];
  if (opts.length < 2) error(name, "меньше двух вариантов ответа");
  const dup = opts.filter((x, i) => opts.findIndex(y => norm(y) === norm(x)) !== i);
  if (dup.length) error(name, `варианты повторяются: «${short(dup[0])}»`);
  if (opts.some(x => !hasText(x))) error(name, "пустой вариант ответа");

  if (q.type === "order"){
    const items = Array.isArray(q.items) ? q.items : [];
    if (items.length < 2) error(name, "в задании на порядок меньше двух пунктов");
    if ([...opts].sort().join("\n") !== [...items].sort().join("\n"))
      error(name, "варианты не совпадают с пунктами правильного порядка");
    if (q.a !== items.join(" → ")) error(name, "ответ не равен пунктам, соединённым через « → »");
  } else {
    const hits = opts.filter(x => x === q.a).length;
    if (hits === 0) error(name, `верного ответа «${short(q.a)}» нет среди вариантов`);
    else if (hits > 1 || opts.filter(x => norm(x) === norm(q.a)).length > 1)
      error(name, `верный ответ «${short(q.a)}» указан и среди неверных`);
  }
}

/* ---------- одна страница ---------- */
function checkPage(rel){
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) { error(rel, "на странице нет скрипта"); return null; }

  let page;
  try { page = runPage(m[1]); }
  catch (e) { error(rel, `страница не запускается: ${e.message}`); return null; }
  const { BLOCKS, IMG, PICS, keys, app } = page;

  if (!/name=["']?viewport/.test(html)) error(rel, "нет настройки ширины для телефона (meta viewport)");
  if (!/<title>[^<]+<\/title>/.test(html)) error(rel, "нет заголовка страницы (<title>)");
  if (!/prefers-color-scheme:\s*dark/.test(html) || !/\[data-theme="dark"\]/.test(html))
    error(rel, "тёмная тема описана не в обоих местах");
  if (!/\.home\s*\{/.test(html)) error(rel, "нет стиля .home для ссылки «← Все тесты»");
  if (!/<a class="home" href="\.\.\/index\.html">/.test(app.innerHTML))
    error(rel, "в меню нет ссылки «← Все тесты»");
  if (keys.size === 0) error(rel, "лучший результат не читается из localStorage");

  // «Лента времени» первого теста географии собирается отдельной функцией startOrder, без make.
  const blocks = Object.keys(BLOCKS).filter(k => {
    if (BLOCKS[k].make) return true;
    if (BLOCKS[k].order) warn(rel, `блок «${BLOCKS[k].title}» устроен по-старому, его вопросы не проверены`);
    else error(rel, `у блока ${k} нет функции make`);
    return false;
  });
  if (!BLOCKS.final) error(rel, "нет блока «Контрольная проверка» (final)");
  for (const k of blocks){
    if (!app.innerHTML.includes(`data-go="${k}"`)) error(rel, `блок «${BLOCKS[k].title}» (${k}) не показан в меню`);
    for (const f of ["n", "title", "desc"]) if (!hasText(BLOCKS[k][f])) error(rel, `у блока ${k} пустое поле ${f}`);
  }

  // Вопрос с потерянной картинкой шаблон молча выбрасывает, поэтому ищем ссылки прямо в данных.
  const pictures = [...m[1].matchAll(/\bimg\s*:\s*"([^"]+)"/g)].map(x => x[1]).concat(PICS.map(p => p.id));
  for (const id of pictures)
    if (!IMG[id]) error(rel, `в данных есть картинка «${id}», а в IMG её нет: вопрос не покажется`);

  const inBlock = new Map();
  const inFinal = new Set();
  for (let run = 0; run < RUNS; run++){
    for (const k of blocks){
      const where = `${rel}, блок «${BLOCKS[k].title}»`;
      let list;
      try { list = BLOCKS[k].make(); }
      catch (e) { error(where, `блок не собирается: ${e.message}`); continue; }
      if (!list.length) error(where, "в блоке нет вопросов");
      list.forEach(q => checkQuestion(where, q, IMG));
      if (k === "final"){
        if (list.length !== FINAL_SIZE) error(where, `вопросов ${list.length}, а должно быть ${FINAL_SIZE}`);
        const ids = list.map(qid);
        const again = list.find((q, i) => ids.indexOf(qid(q)) !== i);
        if (again) error(where, `вопрос может попасться дважды: «${short(again.q)}»`);
        ids.forEach(id => inFinal.add(id));
      } else {
        if (!inBlock.has(k)) inBlock.set(k, new Set());
        list.forEach(q => inBlock.get(k).add(qid(q)));
      }
    }
  }
  if (BLOCKS.final) for (const [k, ids] of inBlock)
    if (![...ids].some(id => inFinal.has(id)))
      warn(rel, `блок «${BLOCKS[k].title}» ни разу не попал в контрольную проверку`);

  return { rel, keys };
}

/* ---------- главная и общие правила ---------- */
const plural = n => n % 10 === 1 && n % 100 !== 11 ? "тест"
  : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "теста" : "тестов";

function testFiles(){
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory() && /_\d+_grade$/.test(d.name))
    .flatMap(d => fs.readdirSync(path.join(ROOT, d.name))
      .filter(f => f.endsWith(".html"))
      .map(f => `${d.name}/${f}`));
}

function checkIndex(files){
  const rel = "index.html";
  const html = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const cards = html.match(/<article class="test-card"[\s\S]*?<\/article>/g) || [];
  const links = cards.map(c => (c.match(/href="\.\/([^"]+\.html)"/) || [])[1]);

  // Сравниваем со списком файлов, а не fs.existsSync: Windows не различает регистр букв, а GitHub Pages различает.
  links.forEach((l, i) => {
    if (!l) error(rel, `в карточке № ${i + 1} нет ссылки на тест`);
    else if (!files.includes(l)) error(rel, `карточка ведёт на несуществующий файл: ${l}`);
  });
  const dup = links.filter((l, i) => l && links.indexOf(l) !== i);
  if (dup.length) error(rel, `две карточки на один тест: ${dup[0]}`);
  for (const f of files) if (!links.includes(f)) error(rel, `нет карточки для теста ${f}`);

  const c = html.match(/Доступно\s+(\d+)\s+(\S+?)</);
  if (!c) error(rel, "не найден счётчик «Доступно N тестов»");
  else {
    const n = +c[1];
    if (n !== cards.length) error(rel, `счётчик говорит ${n}, а карточек ${cards.length}`);
    if (c[2] !== plural(n)) error(rel, `в счётчике неверное слово: «${n} ${c[2]}», нужно «${n} ${plural(n)}»`);
  }
}

function main(){
  const files = testFiles();
  const asked = process.argv.slice(2).map(a => path.relative(ROOT, path.resolve(a)).replace(/\\/g, "/"));
  for (const a of asked) if (!files.includes(a)) error(a, "такого теста нет в папках предметов");

  checkIndex(files);

  // Ключи результатов собираем со всех тестов, даже если проверяем один: новый ключ сравнивается со старыми.
  const owners = new Map();
  for (const f of files){
    const quiet = asked.length && !asked.includes(f);
    const mark = problems.length;
    const res = checkPage(f);
    if (quiet) problems.length = mark;
    if (res) for (const k of res.keys){
      if (!owners.has(k)) owners.set(k, []);
      owners.get(k).push(f);
    }
  }
  for (const [k, list] of owners)
    if (list.length > 1) error(list.join(", "), `общий ключ результатов «${k}»: тесты затрут результаты друг друга`);

  const errors = problems.filter(p => p.level === "ошибка");
  const notes = problems.filter(p => p.level === "замечание");
  for (const p of [...errors, ...notes]) console.log(`[${p.level}] ${p.line}`);
  const done = asked.length || files.length;
  console.log(`Проверено тестов: ${done}. Ошибок: ${errors.length}, замечаний: ${notes.length}.`);
  process.exit(errors.length ? 1 : 0);
}

main();
