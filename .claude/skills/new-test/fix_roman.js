// Fixes OCR-garbled Roman numerals in a recognized textbook.
// The textbooks write "XIII (13) век", "Дарий I (1)": the Arabic number in brackets is
// recognized correctly, so the Roman numeral before it is rebuilt from that number.
// usage: node fix_roman.js <book.txt> [--dry]
const fs = require("fs");
const [file, flag] = process.argv.slice(2);
const roman = n => [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]
  .reduce((s, [v, r]) => { while (n >= v) { s += r; n -= v; } return s; }, "");
// a token of what OCR makes of I, V, X, L: Latin and look-alike Cyrillic letters, 1, |, !
const re = /(^|[\s(«"—–-])([IVXLlі1|!ХхПпУуШшГгЛл]{1,7})( ?)\((\d{1,2})(-?[а-яё]{0,3})\)/gm;
let n = 0, same = 0;
const samples = [];
const text = fs.readFileSync(file, "utf8").replace(re, (m, pre, tok, sp, num, suf) => {
  const r = roman(+num);
  if (tok === r) { same++; return m; }
  n++; if (samples.length < 25) samples.push(`${tok} (${num}${suf}) → ${r}`);
  return `${pre}${r}${sp}(${num}${suf})`;
});
console.log(`${file}: исправлено ${n}, уже верных ${same}`);
console.log(samples.join("\n"));
if (flag !== "--dry") fs.writeFileSync(file, text);
