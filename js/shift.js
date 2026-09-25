// シフト表の計算・判定（画面と分ける。DOM を触らない）
// 常設託児室（rooms）ごとに、定期シフト（pattern）から週の「枠（slot）」を作り、スタッフを手配する
import { addDays, parseISO, weekdayJa, minutesOf, startOfWeek, busyReason, toISO, WEEKDAYS, formatDuration } from './logic.js';

export const SLOT_STATES = ['依頼中', '確定'];

export const weekDates = (weekStart) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));   // 月〜日

export function slotsOf(state, { roomId, date } = {}) {
  return (state.shifts || []).filter((s) => (!roomId || s.roomId === roomId) && (!date || s.date === date))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.id < b.id ? -1 : 1));
}

// 定期シフトから、その週に足りない枠を作る（すでにある枠は重ねて作らない）。nextId は id を出す関数
export function missingSlots(state, weekStart, nextId) {
  const out = [];
  for (const room of state.rooms || []) {
    for (const p of room.pattern || []) {
      for (const date of weekDates(weekStart)) {
        if (!p.days.includes(weekdayJa(date))) continue;
        const have = (state.shifts || []).filter((s) => s.roomId === room.id && s.date === date && s.patternId === p.id).length;
        for (let i = have; i < p.need; i++) {
          out.push({ id: nextId('sh'), roomId: room.id, date, start: p.start, end: p.end, staffId: null, state: '依頼中', patternId: p.id });
        }
      }
    }
  }
  return out;
}

// その枠に入れるスタッフ（曜日・時間・稼働・重なり）と、外れた人の理由
export function findSlotCandidates(state, slot) {
  const res = { candidates: [], excluded: [] };
  const day = weekdayJa(slot.date), ss = minutesOf(slot.start), se = minutesOf(slot.end);
  for (const s of state.staff) {
    if (s.id === slot.staffId) continue;
    let reason = null, detail = '';
    if (s.status !== '稼働可') reason = 'inactive';
    else if (!s.days.includes(day)) reason = 'day';
    else if (minutesOf(s.from) > ss || minutesOf(s.to) < se) reason = 'time';
    else {
      const b = busyReason(state, s.id, slot.date, slot.start, slot.end, { exceptSlotId: slot.id });
      if (b) { reason = 'conflict'; detail = b.label; }
    }
    if (reason) res.excluded.push({ staff: s, reason, detail });
    else res.candidates.push(s);
  }
  res.candidates.sort((a, b) => (b.years - a.years) || a.name.localeCompare(b.name, 'ja'));
  return res;
}

export function slotHours(slot) {
  const m = minutesOf(slot.end) - minutesOf(slot.start);
  return m > 0 ? m / 60 : 0;
}

// その週にそのスタッフが入る時間（枠と、確定・依頼中の案件）
export function staffWeek(state, staffId, weekStart) {
  const dates = new Set(weekDates(weekStart));
  const items = [];
  for (const sl of state.shifts || []) {
    if (sl.staffId === staffId && dates.has(sl.date)) items.push({ type: 'shift', date: sl.date, start: sl.start, end: sl.end, id: sl.id, state: sl.state, roomId: sl.roomId });
  }
  for (const c of state.cases || []) {
    if (c.status === '完了' || !dates.has(c.date)) continue;
    const a = (c.assignments || []).find((x) => x.staffId === staffId);
    if (a) items.push({ type: 'case', date: c.date, start: c.start, end: c.end, id: c.id, state: a.state, name: c.name });
  }
  items.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : 1));
  const hours = items.reduce((n, it) => n + Math.max(0, (minutesOf(it.end) - minutesOf(it.start)) / 60 || 0), 0);
  return { items, hours };
}

export function slotCounts(slots) {
  return {
    total: slots.length,
    open: slots.filter((s) => !s.staffId).length,
    requested: slots.filter((s) => s.staffId && s.state === '依頼中').length,
    confirmed: slots.filter((s) => s.staffId && s.state === '確定').length,
  };
}

export const weekCounts = (state, weekStart) => {
  const dates = new Set(weekDates(weekStart));
  return slotCounts((state.shifts || []).filter((s) => dates.has(s.date)));
};

// 月の表（月曜はじまり）。日ごとの枠の数を添える
export function monthGrid(state, monthISO) {   // monthISO: 'YYYY-MM-01' でも 'YYYY-MM-DD' でもよい
  const first = `${monthISO.slice(0, 7)}-01`;
  const start = startOfWeek(first);
  const d = parseISO(first);
  const last = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const weeks = [];
  for (let w = start; w <= last; w = addDays(w, 7)) {
    weeks.push(weekDates(w).map((date) => ({
      date, inMonth: date.slice(0, 7) === first.slice(0, 7),
      counts: slotCounts((state.shifts || []).filter((s) => s.date === date)),
      cases: (state.cases || []).filter((c) => c.date === date && c.status !== '完了').length,
    })));
  }
  return weeks;
}
export const addMonths = (iso, n) => {
  const d = parseISO(`${iso.slice(0, 7)}-01`);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

// ---------- 入力のチェック ----------
const timeErr = (e, start, end) => {
  if (minutesOf(start) == null) e.start = '開始の時刻を「10:00」の形で入れてください';
  if (minutesOf(end) == null) e.end = '終了の時刻を「15:00」の形で入れてください';
  if (!e.start && !e.end && minutesOf(end) <= minutesOf(start)) e.end = '終了の時刻は、開始より後にしてください';
};
export function validateSlot(v, rooms) {
  const e = {};
  if (!rooms.some((r) => r.id === v.roomId)) e.roomId = '場所を選んでください';
  if (!v.date) e.date = '日付を選んでください';
  else if (!parseISO(v.date)) e.date = '日付を「2026-10-01」の形で入れてください';
  timeErr(e, v.start, v.end);
  if (v.count != null && (!Number.isInteger(v.count) || v.count < 1 || v.count > 10)) e.count = '枠の数は 1〜10 で入れてください';
  return e;
}
export function validatePattern(v) {
  const e = {};
  if (!v.days?.length) e.days = '曜日を1つ以上選んでください';
  timeErr(e, v.start, v.end);
  if (!Number.isInteger(v.need) || v.need < 1 || v.need > 10) e.need = '人数は 1〜10 で入れてください';
  return e;
}

export const patternLabel = (p) => `${WEEKDAYS.filter((d) => p.days.includes(d)).join('・')} ${p.start}〜${p.end}・${p.need}名`;
export { formatDuration };

// ---------- タイムライン（1日を横向きの時間軸で見る。R-31） ----------
const clampMin = (m) => Math.max(0, Math.min(24 * 60, m));

// 重なる予定を、上下の段（lane）に分ける
export function laneAssign(items) {
  const lanes = [];
  for (const it of [...items].sort((a, b) => a.s - b.s || a.e - b.e)) {
    const lane = lanes.find((l) => l[l.length - 1].e <= it.s);
    if (lane) lane.push(it); else lanes.push([it]);
  }
  return lanes;
}

// その日の、スタッフごと・場所ごとの予定。時間は「0時からの分」で持つ（s＝始まり、e＝終わり）
export function dayTimeline(state, date) {
  const day = weekdayJa(date);
  const shiftItems = (state.shifts || []).filter((x) => x.date === date).map((x) => ({
    type: 'shift', id: x.id, s: minutesOf(x.start), e: minutesOf(x.end), start: x.start, end: x.end,
    roomId: x.roomId, staffId: x.staffId, state: x.staffId ? x.state : '', open: !x.staffId,
  }));
  const caseItems = (state.cases || []).filter((c) => c.date === date && c.status !== '完了' && minutesOf(c.start) != null && minutesOf(c.end) != null).map((c) => ({
    type: 'case', id: c.id, s: minutesOf(c.start), e: minutesOf(c.end), start: c.start, end: c.end, name: c.name,
    assignments: c.assignments || [],
  }));

  const staffRows = state.staff.map((st) => {
    const items = [
      ...shiftItems.filter((x) => x.staffId === st.id).map((x) => ({ ...x })),
      ...caseItems.filter((c) => c.assignments.some((a) => a.staffId === st.id)).map((c) => ({ ...c, state: c.assignments.find((a) => a.staffId === st.id).state })),
    ].sort((a, b) => a.s - b.s);
    const inactive = st.status !== '稼働可';
    const offDay = !inactive && !st.days.includes(day);
    const avail = inactive || offDay ? null : { s: minutesOf(st.from), e: minutesOf(st.to) };
    const minutes = items.reduce((n, x) => n + Math.max(0, x.e - x.s), 0);
    return {
      staff: st, items, avail, reason: inactive ? '休止中' : offDay ? '対応外' : '',
      minutes, first: items.length ? items[0].s : null, last: items.length ? Math.max(...items.map((x) => x.e)) : null,
    };
  }).sort((a, b) => (a.items.length ? 0 : 1) - (b.items.length ? 0 : 1) || (a.first ?? 1e9) - (b.first ?? 1e9) || a.staff.name.localeCompare(b.staff.name, 'ja'));

  const roomRows = (state.rooms || []).map((room) => ({
    room, lanes: laneAssign(shiftItems.filter((x) => x.roomId === room.id)),
  }));
  const caseLanes = laneAssign(caseItems);

  // 時間軸の範囲: 8時〜20時を基本に、予定・稼働できる時間に合わせて広げる（1時間きざみ）
  let lo = 8 * 60, hi = 20 * 60;
  const all = [...shiftItems, ...caseItems, ...staffRows.filter((r) => r.avail && r.items.length).map((r) => r.avail)];
  for (const x of all) { lo = Math.min(lo, x.s); hi = Math.max(hi, x.e); }
  const range = { s: clampMin(Math.floor(lo / 60) * 60), e: clampMin(Math.ceil(hi / 60) * 60) };
  return { date, range, staffRows, roomRows, caseLanes, counts: slotCounts((state.shifts || []).filter((x) => x.date === date)) };
}

// 0時からの分 → 横の位置（0〜100 の百分率）
export const pctOf = (m, range) => ((Math.max(range.s, Math.min(range.e, m)) - range.s) / (range.e - range.s)) * 100;   // 範囲の外は、はしに寄せる
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const hoursText = (min) => `${Math.round((min / 60) * 10) / 10}時間`;
