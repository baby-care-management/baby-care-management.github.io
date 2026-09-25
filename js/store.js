// 保存（NR-01・NR-04）。デモなので sessionStorage（タブを閉じると消える）に置く
// 画面はここの関数だけを通してデータを読み書きする（あとでサーバーの保存に替えられるように）
import { buildSeed } from './seed.js';
import { todayISO } from './logic.js';

const KEY = 'bc-demo';
const VERSION = 2;

let state = null;
let saveError = null;   // 保存の失敗（S-76）。次の保存が成功するまで、画面が変わっても出し続ける
let loadNotice = null;  // 読み込み時の知らせ（1回だけ出す）
const listeners = new Set();

function storage() {
  try { return window.sessionStorage; } catch { return null; }
}

// 形を確かめる（S-69）。違ったら使わない
function isValid(s) {
  return s && s.version === VERSION && typeof s.seededOn === 'string'
    && ['cases', 'staff', 'members', 'tasks', 'records', 'rooms', 'shifts', 'applications'].every((k) => Array.isArray(s[k]))
    && s.settings && typeof s.settings === 'object' && Array.isArray(s.settings.templatesOff)
    && s.cases.every((c) => c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.assignments))
    && s.tasks.every((t) => t && typeof t.id === 'string' && typeof t.due === 'string')
    // 画面が中身を読む項目（候補の検索・シフト表）も確かめる
    && s.staff.every((x) => x && typeof x.id === 'string' && Array.isArray(x.days))
    && s.rooms.every((r) => r && typeof r.id === 'string' && Array.isArray(r.pattern))
    && s.shifts.every((x) => x && typeof x.id === 'string' && typeof x.date === 'string');
}

function fresh() {
  const today = todayISO();
  return { version: VERSION, seededOn: today, seq: 100, ...buildSeed(today) };
}

export function load() {
  const st = storage();
  let raw = null;
  try { raw = st ? st.getItem(KEY) : null; } catch { raw = null; }
  if (raw) {
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (isValid(parsed)) {
      state = parsed;
      return state;
    }
    // 壊れている・形が古い: 上書きせずに退避してから、サンプルで始める（S-75）
    // 退避は最初の1回だけ。2回目以降は、前の退避を消さないよう、退避しない
    let kept = false;
    try {
      if (st.getItem(KEY + '-broken') == null) { st.setItem(KEY + '-broken', raw); kept = true; }
    } catch { /* 退避もできないときは、そのまま進む */ }
    loadNotice = kept
      ? '保存されていたデータが読めなかったため、サンプルデータで始めました（元のデータは別の名前で残しています）。'
      : '保存されていたデータが読めなかったため、サンプルデータで始めました。';
  }
  state = fresh();
  save();
  return state;
}

function save() {
  const st = storage();
  if (!st) {
    saveError = 'このブラウザでは保存が使えません。画面を再読み込みすると、変更は消えます。';
    return false;
  }
  try {
    st.setItem(KEY, JSON.stringify(state));
    saveError = null;
    return true;
  } catch {
    saveError = '保存できませんでした。画面を再読み込みすると、直前の変更は消えます。';
    return false;
  }
}

export function getState() { return state || load(); }

// 画面に出す知らせ。保存の失敗は、次の保存が成功するまで残る（登録のあとに画面が切り替わっても消えない）
export function currentError() {
  const n = loadNotice;
  loadNotice = null;
  return saveError || n;
}

// 変更はすべてここを通す。mutate の中で state を書き換える
export function update(mutate) {
  mutate(getState());
  save();
  for (const fn of listeners) fn();
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reset() {
  state = fresh();
  save();
  for (const fn of listeners) fn();
}

export function nextId(prefix) {
  const s = getState();
  s.seq = (s.seq || 100) + 1;
  return prefix + s.seq;
}

// ---------- よく使う読み出し ----------
export const findCase = (id) => getState().cases.find((c) => c.id === id) || null;
export const findStaff = (id) => getState().staff.find((s) => s.id === id) || null;
export const memberName = (id) => getState().members.find((m) => m.id === id)?.name || '未設定';
export const recordOf = (caseId) => getState().records.find((r) => r.caseId === caseId) || null;
export const findRoom = (id) => getState().rooms.find((r) => r.id === id) || null;
export const applicationsOf = (caseId) => getState().applications.filter((a) => a.caseId === caseId);
