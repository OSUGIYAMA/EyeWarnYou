import countries from "i18n-iso-countries";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));
countries.registerLocale(require("i18n-iso-countries/langs/ja.json"));

// Names used in EAR tables (Country Chart / Country Groups / Part 746) that the ISO
// library does not resolve on its own.
const EAR_ALIASES: Record<string, string> = {
  "korea, north": "KP",
  "korea, south": "KR",
  "china (prc)": "CN",
  "china": "CN",
  "burma": "MM",
  "macau": "MO",
  "russia": "RU",
  "iran": "IR",
  "syria": "SY",
  "laos": "LA",
  "vietnam": "VN",
  "venezuela": "VE",
  "bolivia": "BO",
  "moldova": "MD",
  "tanzania": "TZ",
  "taiwan": "TW",
  "kosovo": "XK",
  "vatican city": "VA",
  "holy see": "VA",
  "türkiye": "TR",
  "turkey": "TR",
  "cote d'ivoire": "CI",
  "cote d'lvoire": "CI", // typo present in Supp. 1 to Part 740
  "côte d'ivoire": "CI",
  "gambia, the": "GM",
  "bahamas, the": "BS",
  "the bahamas": "BS",
  "micronesia, federated states of": "FM",
  "micronesia": "FM",
  "micronesia (federated state of)": "FM",
  "micronesia (federated states of)": "FM",
  "st. kitts and nevis": "KN",
  "saint kitts and nevis": "KN",
  "seycheles": "SC", // typo present in Supp. 1 to Part 738
  "south sudan, republic of": "SS",
  "south sudan": "SS",
  "congo (democratic republic of the)": "CD",
  "congo (democratic republic of)": "CD",
  "congo, democratic republic of the": "CD",
  "democratic republic of the congo": "CD",
  "republic of the congo": "CG",
  "people's republic of china": "CN",
  "congo (republic of the)": "CG",
  "congo, republic of the": "CG",
  "bosnia & herzegovina": "BA",
  "saint kitts & nevis": "KN",
  "st. kitts & nevis": "KN",
  "sao tome & principe": "ST",
  "trinidad & tobago": "TT",
  "antigua & barbuda": "AG",
  "st. lucia": "LC",
  "st. vincent and the grenadines": "VC",
  "sint maarten (the dutch two-fifths of the island of saint martin)": "SX",
  "sint maarten": "SX",
  "curaçao": "CW",
  "curacao": "CW",
  "eswatini": "SZ",
  "swaziland": "SZ",
  "north macedonia": "MK",
  "macedonia": "MK",
  "czech republic": "CZ",
  "czechia": "CZ",
  "cape verde": "CV",
  "cabo verde": "CV",
  "timor-leste": "TL",
  "east timor": "TL",
  "western sahara": "EH",
  "palestinian territories": "PS",
  "west bank": "PS",
  "gaza": "PS",
  "brunei": "BN",
  "united kingdom": "GB",
  "united states": "US",
  "hong kong": "HK",
  "netherlands antilles": "CW",
  "french guiana": "GF",
  "greenland": "GL",
};

// Names as written in 輸出貿易管理令 別表 (Japanese law) → ISO.
const JA_LAW_ALIASES: Record<string, string> = {
  "アメリカ合衆国": "US",
  "英国": "GB",
  "大韓民国": "KR",
  "北朝鮮": "KP",
  "チェコ": "CZ",
  "中央アフリカ": "CF",
  "コンゴ民主共和国": "CD",
  "南スーダン": "SS",
  "スーダン": "SD",
  "イラン": "IR",
  "イラク": "IQ",
  "レバノン": "LB",
  "リビア": "LY",
  "ソマリア": "SO",
  "アフガニスタン": "AF",
  "ニュージーランド": "NZ",
  "シリア": "SY",
  "中華人民共和国": "CN",
  "アラブ首長国連邦": "AE",
  "アルメニア": "AM",
  "インド": "IN",
  "カザフスタン": "KZ",
  "キルギス": "KG",
  "タイ": "TH",
  "トルコ": "TR",
  "ウズベキスタン": "UZ",
  "ロシア": "RU",
  "ベラルーシ": "BY",
  "ウクライナ": "UA",
};

export function resolveEarCountry(rawName: string): string | undefined {
  const name = rawName.replace(/\s+/g, " ").trim().toLowerCase();
  if (EAR_ALIASES[name]) return EAR_ALIASES[name];
  const code = countries.getAlpha2Code(rawName.trim(), "en");
  return code ?? undefined;
}

export function resolveJaLawCountry(rawName: string): string | undefined {
  const name = rawName.trim();
  if (JA_LAW_ALIASES[name]) return JA_LAW_ALIASES[name];
  return countries.getAlpha2Code(name, "ja") ?? undefined;
}

export function countryNames(iso2: string): { en: string; ja: string } {
  if (iso2 === "XK") return { en: "Kosovo", ja: "コソボ" };
  const en = countries.getName(iso2, "en", { select: "alias" }) ?? countries.getName(iso2, "en") ?? iso2;
  const ja = countries.getName(iso2, "ja") ?? en;
  return { en: SHORT_EN[iso2] ?? en, ja: SHORT_JA[iso2] ?? ja };
}

// Friendlier display names than the ISO long forms.
const SHORT_EN: Record<string, string> = {
  KP: "North Korea", KR: "South Korea", RU: "Russia", IR: "Iran", SY: "Syria", LA: "Laos",
  VN: "Vietnam", VE: "Venezuela", BO: "Bolivia", MD: "Moldova", TZ: "Tanzania", TW: "Taiwan",
  GB: "United Kingdom", US: "United States", CD: "DR Congo", CG: "Congo", MM: "Burma (Myanmar)",
  MO: "Macau", VA: "Vatican City", FM: "Micronesia", PS: "Palestinian Territories", TR: "Türkiye",
  CZ: "Czechia", BN: "Brunei", HK: "Hong Kong", CN: "China",
};
const SHORT_JA: Record<string, string> = {
  KP: "北朝鮮", KR: "韓国", US: "米国", GB: "英国", CD: "コンゴ民主共和国", CG: "コンゴ共和国",
  TW: "台湾", MO: "マカオ", HK: "香港", CN: "中国", RU: "ロシア", IR: "イラン", SY: "シリア",
  VN: "ベトナム", LA: "ラオス", MM: "ミャンマー", VE: "ベネズエラ", BO: "ボリビア", MD: "モルドバ",
  TZ: "タンザニア", FM: "ミクロネシア", PS: "パレスチナ", TR: "トルコ", CZ: "チェコ",
};

export function allIsoCodes(): string[] {
  return Object.keys(countries.getAlpha2Codes());
}
