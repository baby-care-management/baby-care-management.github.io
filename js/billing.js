// 請求準備（R-27）。請求額は計算しない。交通費の単純な合計だけ出す
import { formatTimeRange, parseCount } from './logic.js';

export const BILLING_STATES = ['未着手', '準備できた', '経理へ引き継ぎ済み'];
export const BILLING_HEADERS = ['案件名', '実施日', 'お客さま', '会場', '実施時間', '実際の子ども人数', 'スタッフ', '交通費（円）', '交通費の状態', '経路のメモ'];

export const formatYen = (n) => (n == null ? '未入力' : n === 0 ? 'なし（0円）' : `¥${Number(n).toLocaleString('ja-JP')}`);
export const fareState = (a) => (a.fare == null ? '未入力' : a.fareConfirmed ? '確定' : '未確認');

export function billingOf(c) { return c.billing || { state: '未着手', handedOverAt: '' }; }

// 実際に入ったスタッフ（確定）ごとの行
export function billingRows(state, c) {
  const rec = (state.records || []).find((r) => r.caseId === c.id);
  const staffName = (id) => (state.staff.find((s) => s.id === id) || {}).name || '（登録なし）';
  const time = rec ? formatTimeRange(rec.start, rec.end) : formatTimeRange(c.start, c.end);
  return (c.assignments || []).filter((a) => a.state === '確定').map((a) => [
    c.name, rec ? rec.date : c.date, c.customer?.company || '', c.venue || '', time,
    rec ? rec.children : '', staffName(a.staffId), a.fare == null ? '' : a.fare, fareState(a), a.route || '',
  ]);
}

export function fareTotal(c) {
  return (c.assignments || []).filter((a) => a.state === '確定' && a.fare != null).reduce((n, a) => n + a.fare, 0);
}

// 足りないこと（あれば、経理へ引き継ぐ前に確かめる）
export function billingIssues(state, c) {
  const out = [];
  const rec = (state.records || []).find((r) => r.caseId === c.id);
  const worked = (c.assignments || []).filter((a) => a.state === '確定');
  if (!rec) out.push('実績がまだ登録されていません');
  if (!c.customer?.company) out.push('お客さま（顧客名）が入っていません');
  if (!worked.length) out.push('確定したスタッフがいません');
  const noFare = worked.filter((a) => a.fare == null).length;
  if (noFare) out.push(`交通費が未入力のスタッフが${noFare}名います`);
  const unconfirmed = worked.filter((a) => a.fare != null && !a.fareConfirmed).length;
  if (unconfirmed) out.push(`交通費が未確定（未確認）のスタッフが${unconfirmed}名います`);
  if (rec && worked.length && rec.staff !== worked.length) out.push(`実績のスタッフ人数（${rec.staff}名）と、確定した人数（${worked.length}名）が違います`);
  return out;
}

// 請求準備の対象（実績がある・実施済み以降の案件）
export const billingTargets = (state) => state.cases.filter((c) => !['問い合わせ', 'ヒアリング', '見積', '申込確認'].includes(c.status)
  && ((state.records || []).some((r) => r.caseId === c.id) || c.status === '実施済み' || c.status === '完了'));

// ---------- CSV・表のコピー ----------
// 表計算で式として動かないように、= + - @ 、タブ・改行で始まる文字の先頭に ' をつける（CSV インジェクション対策）
export function safeCell(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
}
export function csvCell(v) {
  const s = safeCell(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCSV(headers, rows) {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function toTSV(headers, rows) {
  const cell = (v) => safeCell(v).replace(/[\t\r\n]+/g, ' ');
  return [headers, ...rows].map((r) => r.map(cell).join('\t')).join('\n');
}
export const MAX_EXPORT_ROWS = 2000;

// 交通費の入力チェック（R-20）。金額は 空＝未入力・0＝なし
export function validateFare(v) {
  const e = {};
  if (v.fare != null && (!Number.isInteger(v.fare) || v.fare < 0 || v.fare > 99999)) e.fare = '金額は 0〜99,999 の整数（円）で入れてください。かからないときは 0';
  if ((v.route || '').length > 60) e.route = `経路のメモは60文字以内にしてください（今 ${v.route.length}文字）`;
  if (v.fareConfirmed && v.fare == null) e.fare = '金額を入れてから、確定にしてください（かからないときは 0）';
  return e;
}
export { parseCount };
