// Googleフォームの回答の取り込み（R-17）。スプレッドシートからコピーした表・CSV の文字を読み、案件と突き合わせる
// DOM を触らない。外へ通信しない（貼り付けた文字だけを読む）。読む量に上限がある（S-69・S-70）
import { parseISO, minutesOf, normalizeText } from './logic.js';

export const LIMITS = { chars: 200 * 1024, rows: 200, cells: 40 };

// ---------- 表を読む ----------
// 区切りは、1行目にタブがあればタブ、なければカンマ。"" で囲んだ中の改行・区切りは、そのまま文字として読む
export function parseTable(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  if (!src.trim()) return { ok: false, error: '回答の表が空です。Googleフォームの回答（スプレッドシート）から、見出しの行を含めてコピーして貼り付けてください' };
  if (src.length > LIMITS.chars) return { ok: false, error: `貼り付けた文字が多すぎます（${Math.round(src.length / 1024)}KB。上限は ${LIMITS.chars / 1024}KB）。回答を分けて貼り付けてください` };
  const firstLine = src.split(/\r?\n/, 1)[0];
  const delim = firstLine.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  if (q) return { ok: false, error: '「"」が閉じていない所があります。貼り付けた表が途中で切れていないか確かめてください' };
  if (rows.length < 2) return { ok: false, error: '見出しの行と、回答の行が必要です（回答が1件もありません）' };
  if (rows.length - 1 > LIMITS.rows) return { ok: false, error: `回答が多すぎます（${rows.length - 1}件。上限は ${LIMITS.rows}件）。新しい回答だけを貼り付けてください` };
  if (rows[0].length > LIMITS.cells) return { ok: false, error: `列が多すぎます（${rows[0].length}列。上限は ${LIMITS.cells}列）` };
  return { ok: true, header: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
}

// ---------- 見出しを、決まった項目に対応づける ----------
export const FIELDS = [
  { key: 'timestamp', label: '回答日時', aliases: ['タイムスタンプ', '回答日時', '送信日時', 'timestamp'] },
  { key: 'company', label: '顧客名', aliases: ['会社名', '団体名', '顧客名', 'お名前', '法人名'] },
  { key: 'contact', label: '顧客の担当者', aliases: ['担当者', 'ご担当'] },
  { key: 'phone', label: '電話', aliases: ['電話', '連絡先'] },
  { key: 'email', label: 'メール', aliases: ['メールアドレス', 'メール', 'email', 'e-mail'] },
  { key: 'eventName', label: 'イベント名', aliases: ['イベント名', '案件名', 'ご利用の内容'] },
  { key: 'start', label: '開始', aliases: ['開始'] },
  { key: 'end', label: '終了', aliases: ['終了'] },
  { key: 'date', label: '開催日', aliases: ['開催日', '実施日', 'ご利用日', '日付'] },
  { key: 'venue', label: '会場', aliases: ['会場', '場所'] },
  { key: 'children', label: '子ども人数', aliases: ['人数', 'お子さまの数', 'お子様の数'] },
  { key: 'ages', label: '年齢構成', aliases: ['年齢'] },
  { key: 'care', label: '配慮が必要なこと', aliases: ['アレルギー', '配慮'] },
  { key: 'note', label: 'ご質問・ご要望', aliases: ['ご質問', 'ご要望', '備考', 'その他'] },
];

export function mapHeader(header) {
  const map = {};   // key → 列の番号
  header.forEach((h, i) => {
    const t = normalizeText(h);
    // 見出しに含まれる言い換えのうち、いちばん長いものの項目にする（「ご連絡先メールアドレス」は、「連絡先」より長い「メールアドレス」でメール）
    // 長さが同じときは、見出しの中で先に出る言い換えを優先する（「ご担当者様のお名前」は、後ろの「お名前」より先の「ご担当」で担当者）
    let best = null, bestLen = 0, bestPos = Infinity;
    for (const f of FIELDS) {
      if (map[f.key] != null) continue;
      for (const a of f.aliases) {
        const na = normalizeText(a);
        const pos = t.indexOf(na);
        if (pos < 0) continue;
        if (na.length > bestLen || (na.length === bestLen && pos < bestPos)) { best = f.key; bestLen = na.length; bestPos = pos; }
      }
    }
    if (best) map[best] = i;
  });
  return map;
}

// ---------- 値をそろえる ----------
const pad = (n) => String(n).padStart(2, '0');
// 日付・時刻・人数の欄は短い値だけ読む。長い文字は読み取れない（空・null）にする（貼り付けた1セルが長いとき、正規表現が二乗の時間になって固まるのを防ぐ。S-70）
const MAX_VALUE_CHARS = 40;
export function normDate(text, refYear) {
  const t = String(text ?? '').normalize('NFKC').trim();
  if (!t || t.length > MAX_VALUE_CHARS) return '';
  // 数字の前後に、さらに数字が続く形（2026-10-011・12026-10-01）は、一部だけを取り出さず読み取れない（空）にする
  let m = /(?:^|\D)(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?!\d)/.exec(t);
  let y, mo, d;
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(t)) || (m = /^(\d{1,2})\/(\d{1,2})$/.exec(t))) [y, mo, d] = [refYear, +m[1], +m[2]];
  else return '';
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return parseISO(iso) ? iso : '';
}
export function normTime(text) {
  const t = String(text ?? '').normalize('NFKC').trim();
  if (!t || t.length > MAX_VALUE_CHARS) return '';
  if (/\d{3}:|:\d{3}|-\s*\d{1,2}:/.test(t)) return '';   // 100:00・1:000・-1:00 のように、一部だけを取り出さない
  const m = /(午前|午後)?\s*(\d{1,2})\s*(?::(\d{2})|時\s*(?:(\d{1,2})\s*分|(半))?)(?::\d{2})?/.exec(t);
  if (!m) return '';
  let h = +m[2];
  const ap = /(?:^|[^a-z])(am|pm)(?![a-z])/i.exec(t);   // 英語設定のスプレッドシートの「3:00 PM」
  if ((m[1] === '午後' || (ap && ap[1].toLowerCase() === 'pm')) && h < 12) h += 12;
  if (ap && ap[1].toLowerCase() === 'am' && h === 12) h = 0;
  const min = m[3] != null ? +m[3] : m[4] != null ? +m[4] : m[5] ? 30 : 0;
  if (h > 23 || min > 59) return '';
  return `${pad(h)}:${pad(min)}`;
}
export function normCount(text) {
  const t0 = String(text ?? '').normalize('NFKC').trim();
  if (t0.length > MAX_VALUE_CHARS) return null;
  const t = t0.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');   // 「1,000」の桁区切りを消す
  // 4桁以上の数は、下3桁を取り出さず、読み取れない（null）にする
  // 「名・人」の前の数字・区切り・符号の並びをまとめて取り出し、1〜3桁の数だけを数として読む（1,00名・12,3名・-5名・1 000名 は読み取れない）
  const m = /^(\d{1,3})\s*(?:名|人)?$/.exec(t) || /([\d,.\-\s]*\d)\s*(?:名|人)/.exec(t);
  if (!m) return null;
  const tok = m[1].trim();
  return /^\d{1,3}$/.test(tok) ? +tok : null;
}

// 回答の行 → 決まった項目の値
export function normalizeRow(row, map, refYear) {
  const get = (k) => (map[k] == null ? '' : String(row[map[k]] ?? '').trim());
  return {
    timestamp: get('timestamp'), company: get('company'), contact: get('contact'), phone: get('phone'), email: get('email'),
    eventName: get('eventName'), date: normDate(get('date'), refYear), dateText: get('date'),
    start: normTime(get('start')), end: normTime(get('end')), venue: get('venue'),
    children: normCount(get('children')), ages: get('ages'), care: get('care'), note: get('note'),
  };
}

export function readApplications(text, today) {
  const t = parseTable(text);
  if (!t.ok) return t;
  const map = mapHeader(t.header);
  const missing = ['company', 'date'].filter((k) => map[k] == null).map((k) => FIELDS.find((f) => f.key === k).label);
  if (missing.length) return { ok: false, error: `見出しの行から「${missing.join('」「')}」が見つかりません。フォームの質問の名前に、その言葉が入っているか確かめてください` };
  const year = +today.slice(0, 4);
  const used = new Set(Object.values(map));
  return { ok: true, items: t.rows.map((r) => normalizeRow(r, map, year)), unmapped: t.header.filter((_, i) => !used.has(i)) };
}

// ---------- 案件との突き合わせ ----------
const nt = (s) => normalizeText(s).replace(/[（）()・、。「」]/g, '');
const like = (a, b) => { const x = nt(a), y = nt(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

// 案件との突き合わせ（R-17。2026-09-25 本人決定）
// 「見つかった」= 開催日が同じ **かつ** 顧客名が近い（どちらも2文字以上。イベント名が近いと点が上がる）。取り込み先の初期値になる
// 片方だけ近いもの（開催日だけ同じ・顧客名だけ近い）は「近い案件」として注意を出すだけで、初期値は「新しい案件」（別のお客さまの案件に書き込まないため）
const likeName = (a, b) => nt(a).length >= 2 && nt(b).length >= 2 && like(a, b);
const signals = (c, v) => ({
  date: !!v.date && c.date === v.date,
  company: likeName(v.company, c.customer?.company),
  event: !!v.eventName && like(v.eventName, c.name),
});

export function matchCase(cases, v) {
  let best = null;
  for (const c of cases) {
    if (c.status === '完了') continue;
    const g = signals(c, v);
    if (!(g.date && g.company)) continue;
    const score = 6 + (g.event ? 2 : 0);
    if (!best || score > best.score) best = { caseId: c.id, score };
  }
  return best;
}

// 近い案件（片方だけ近い）。確かな一致があるときは使わない。{ caseId, why } か null
export function nearCase(cases, v) {
  let best = null;
  for (const c of cases) {
    if (c.status === '完了') continue;
    const g = signals(c, v);
    if (g.date && g.company) return null;
    if (!g.date && !g.company) continue;
    const score = (g.company ? 2 : 1) + (g.event ? 1 : 0);
    if (!best || score > best.score) best = { caseId: c.id, score, why: g.company ? '顧客名が近い' : '開催日が同じ' };
  }
  return best;
}

export const COMPARE_KEYS = ['company', 'contact', 'phone', 'email', 'date', 'start', 'end', 'venue', 'children', 'ages'];
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

function caseValue(c, k) {
  switch (k) {
    case 'company': case 'contact': case 'phone': case 'email': return c.customer?.[k] || '';
    case 'children': return c.children;
    default: return c[k] ?? '';
  }
}
const same = (k, a, b) => {
  if (k === 'children' || k === 'date' || k === 'start' || k === 'end') return a === b;
  if (k === 'phone') return String(a).replace(/\D/g, '') === String(b).replace(/\D/g, '');
  if (k === 'email') return normalizeText(a) === normalizeText(b);
  return like(a, b);
};
export const displayValue = (k, v) => (v == null || v === '' ? '' : k === 'children' ? `${v}名` : String(v));

// 項目ごとの結果: 一致 / 相違 / 案件にない（案件が空で、回答にある）/ 未入力（回答が空）
export function compareApplication(c, v) {
  return COMPARE_KEYS.map((k) => {
    const cv = caseValue(c, k);
    const fv = v[k];
    const cEmpty = cv == null || cv === '';
    const fEmpty = fv == null || fv === '';
    let status;
    if (fEmpty) status = '未入力';
    else if (cEmpty) status = '案件にない';
    else status = same(k, cv, fv) ? '一致' : '相違';
    return { key: k, label: LABEL[k], caseValue: displayValue(k, cv), formValue: displayValue(k, fv), status };
  });
}

// 反映する項目 → 案件の変更（案件の形にそろえる）
export function patchFromApplication(c, v, keys) {
  const patch = {};
  const customer = { ...(c.customer || {}) };
  let touchedCustomer = false;
  for (const k of keys) {
    if (['company', 'contact', 'phone', 'email'].includes(k)) { customer[k] = v[k]; touchedCustomer = true; }
    else patch[k] = v[k];
  }
  if (touchedCustomer) patch.customer = customer;
  return patch;
}

// 新しい案件にするときの案件の値
export function caseFromApplication(v) {
  return {
    name: v.eventName || `${v.company} 託児`, type: 'イベント託児', date: v.date, start: v.start, end: v.end, venue: v.venue,
    customer: { company: v.company, contact: v.contact, phone: v.phone, email: v.email },
    children: v.children, ages: v.ages, careNotes: v.care ? `申込フォーム: ${v.care}` : '',
  };
}

// 回答が、案件として使えるか
export function applicationIssues(v) {
  const e = [];
  if (!v.company) e.push('顧客名（会社名・お名前）が空です');
  if (!v.date) e.push('開催日が読み取れません（「2026/10/3」「10月3日」の形にしてください）');
  if (v.start && v.end && minutesOf(v.end) <= minutesOf(v.start)) e.push('終了の時刻が、開始より前です');
  return e;
}
