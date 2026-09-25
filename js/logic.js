// 計算・判定・変換（画面と分ける。tests/ から直接呼べるように、DOM を触らない）
// 日付は 'YYYY-MM-DD'、時刻は 'HH:MM' の文字で持つ。今日の日付は引数で受け取る

// ---------- 日付 ----------
const pad = (n) => String(n).padStart(2, '0');
const WEEK_JA = ['日', '月', '火', '水', '木', '金', '土'];
export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];   // 画面に出す順

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;   // 2月30日などは null
}
export function todayISO(now = new Date()) { return toISO(now); }
export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function diffDays(a, b) {   // a - b（日）
  return Math.round((parseISO(a) - parseISO(b)) / 86400000);
}
export function weekdayJa(iso) { return WEEK_JA[parseISO(iso).getDay()]; }
export function startOfWeek(iso) {   // 月曜はじまり
  const dow = parseISO(iso).getDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}
export function inThisWeek(iso, today) {
  const s = startOfWeek(today);
  return iso >= s && iso <= addDays(s, 6);
}
export function sameMonth(iso, ref) { return iso.slice(0, 7) === ref.slice(0, 7); }
export function nextMonthOf(iso) {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 1)).slice(0, 7);
}
// today から offset 日後以降で、曜日（0=日〜6=土）が dows に入る最初の日
export function onOrAfter(today, offset, dows) {
  let d = addDays(today, offset);
  for (let i = 0; i < 7; i++) {
    if (dows.includes(parseISO(d).getDay())) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function formatDate(iso) {   // 9月27日（土）
  const d = parseISO(iso);
  if (!d) return '未入力';
  return `${d.getMonth() + 1}月${d.getDate()}日（${WEEK_JA[d.getDay()]}）`;
}
export function formatDateShort(iso) {   // 9/27（土）
  const d = parseISO(iso);
  if (!d) return '未入力';
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEK_JA[d.getDay()]}）`;
}
export function formatDateLong(iso) {   // 2026年9月27日（土）
  const d = parseISO(iso);
  if (!d) return '未入力';
  return `${d.getFullYear()}年${formatDate(iso)}`;
}
export function formatTimeRange(start, end) {
  if (!start && !end) return '未入力';
  return `${start || '？'}〜${end || '？'}`;
}
export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}
export function formatDuration(start, end) {
  const s = minutesOf(start), e = minutesOf(end);
  if (s == null || e == null || e <= s) return null;
  const min = e - s;
  return `${Math.floor(min / 60)}時間${min % 60 ? (min % 60) + '分' : ''}`;
}
// 期限の言い方（今日・明日・3日後・2日超過）
export function dueLabel(due, today) {
  const d = diffDays(due, today);
  if (d === 0) return '今日';
  if (d === 1) return '明日';
  if (d > 1) return `${d}日後`;
  return `${-d}日超過`;
}
export function countOrUnset(n, unit = '名') {   // D-55: 空は「未入力」、0 は 0
  return n == null ? '未入力' : `${n}${unit}`;
}

// ---------- 案件のステータスと業務の流れ ----------
export const STATUSES = ['問い合わせ', 'ヒアリング', '見積', '申込確認', 'スタッフ手配', '最終確認', '実施済み', '完了'];

export const STAGES = [
  { key: 'inquiry', label: '問い合わせ', statuses: ['問い合わせ', 'ヒアリング'], screen: 'AIアシスタント・案件',
    roles: { ai: '問い合わせ文から日時・人数などを整理', system: '案件として記録', human: '内容を確かめてヒアリング' } },
  { key: 'casing', label: '案件化', statuses: ['見積', '申込確認'], screen: '案件詳細',
    roles: { ai: '返信文の下書き', system: '進み具合をステータスで管理', human: '見積・申込の判断' } },
  { key: 'staffing', label: 'スタッフ手配', statuses: ['スタッフ手配'], screen: '案件詳細・スタッフ',
    roles: { ai: 'スタッフへの依頼文の下書き', system: '曜日・時間が合う候補を検索', human: '依頼して確定する' } },
  { key: 'tasks', label: 'タスク管理', statuses: [], screen: 'タスク',
    roles: { ai: '—', system: '期限・担当を管理し、期限切れを知らせる', human: '進める・終わらせる' } },
  { key: 'operation', label: '当日運営', statuses: ['最終確認'], screen: '案件詳細',
    roles: { ai: '引き継ぎメモの下書き', system: '当日の案件とスタッフを一覧', human: '当日の判断・例外への対応' } },
  { key: 'result', label: '実績', statuses: ['実施済み', '完了'], screen: '実績',
    roles: { ai: '—', system: '実施の記録・予定との差を表示', human: '申し送りを書く' } },
];

export function statusIndex(status) { return STATUSES.indexOf(status); }
export function nextStatus(status) {
  const i = statusIndex(status);
  return i >= 0 && i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
}
export function prevStatus(status) {
  const i = statusIndex(status);
  return i > 0 ? STATUSES[i - 1] : null;
}
export function stageOf(status) {
  return STAGES.find((s) => s.statuses.includes(status)) || null;
}
// ステータスの札の見た目の分け方（色だけに頼らず、文字も必ず出す）
export function statusTone(status) {
  const i = statusIndex(status);
  if (i <= 1) return 'intake';
  if (i <= 3) return 'plan';
  if (i <= 5) return 'active';
  if (i === 6) return 'held';
  return 'closed';
}
export const isOpenCase = (c) => c.status !== '完了';

// ---------- 案件 ----------
export function staffCounts(c) {
  const a = c.assignments || [];
  return {
    confirmed: a.filter((x) => x.state === '確定').length,
    requested: a.filter((x) => x.state === '依頼中').length,
  };
}
// 足りない人数（必要数が未入力なら null）
export function staffShortage(c) {
  if (c.requiredStaff == null) return null;
  return Math.max(0, c.requiredStaff - staffCounts(c).confirmed);
}

export const TASK_STATUSES = ['未着手', '進行中', '完了'];
export const isOpenTask = (t) => t.status !== '完了';

function byDue(a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : a.id < b.id ? -1 : 1; }

export function nextTaskOf(tasks, caseId) {
  return tasks.filter((t) => t.caseId === caseId && isOpenTask(t)).sort(byDue)[0] || null;
}
export function tasksOfCase(tasks, caseId) {
  return tasks.filter((t) => t.caseId === caseId).sort((a, b) => (isOpenTask(a) === isOpenTask(b) ? byDue(a, b) : isOpenTask(a) ? -1 : 1));
}

export function kpis(state, today) {
  const open = state.tasks.filter(isOpenTask);
  return {
    activeCases: state.cases.filter(isOpenCase).length,
    todayTasks: open.filter((t) => t.due === today).length,
    overdueTasks: open.filter((t) => t.due < today).length,
    weekCases: state.cases.filter((c) => c.date && inThisWeek(c.date, today)).length,
  };
}

// 今日やるタスク: 期限切れ＋今日。期限の古い順
export function todaysTasks(tasks, today) {
  return tasks.filter((t) => isOpenTask(t) && t.due <= today).sort(byDue);
}

export function stageCounts(state) {
  const out = {};
  for (const s of STAGES) out[s.key] = state.cases.filter((c) => s.statuses.includes(c.status)).length;
  out.tasks = state.tasks.filter(isOpenTask).length;
  return out;
}

export const PERIODS = [
  { key: '', label: 'すべての開催日' },
  { key: 'upcoming', label: '今日以降' },
  { key: 'week', label: '今週' },
  { key: 'month', label: '今月' },
  { key: 'next-month', label: '来月' },
  { key: 'past', label: '過去' },
];

export function matchPeriod(iso, period, today) {
  if (!period) return true;
  if (!iso) return false;
  switch (period) {
    case 'upcoming': return iso >= today;
    case 'week': return inThisWeek(iso, today);
    case 'month': return sameMonth(iso, today);
    case 'next-month': return iso.slice(0, 7) === nextMonthOf(today);
    case 'past': return iso < today;
    default: return true;
  }
}

export function normalizeText(s) {
  return (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 案件の絞り込み。status は1つのステータス、'active'（完了以外）、stage は業務の流れの段階
export function filterCases(cases, { q = '', status = '', period = '', stage = '' } = {}, today) {
  const nq = normalizeText(q);
  const st = stage ? STAGES.find((s) => s.key === stage) : null;
  return cases.filter((c) => {
    if (nq) {
      const hay = normalizeText([c.name, c.venue, c.customer?.company, c.customer?.contact].join(' '));
      if (!hay.includes(nq)) return false;
    }
    if (status === 'active' && !isOpenCase(c)) return false;
    if (status && status !== 'active' && c.status !== status) return false;
    if (st && !st.statuses.includes(c.status)) return false;
    return matchPeriod(c.date, period, today);
  });
}

// 並び: 完了していないものを開催日の近い順、そのあと完了を新しい順
export function sortCases(cases) {
  return [...cases].sort((a, b) => {
    const ao = isOpenCase(a), bo = isOpenCase(b);
    if (ao !== bo) return ao ? -1 : 1;
    const ad = a.date || '9999', bd = b.date || '9999';
    if (ad !== bd) return (ad < bd ? -1 : 1) * (ao ? 1 : -1);
    return (a.start || '') < (b.start || '') ? -1 : (a.start || '') > (b.start || '') ? 1 : (a.id < b.id ? -1 : 1);
  });
}

export const DUE_FILTERS = [
  { key: '', label: 'すべての期限' },
  { key: 'overdue', label: '期限切れ' },
  { key: 'today', label: '今日' },
  { key: 'week', label: '今週' },
];

export function filterTasks(tasks, { status = '', assignee = '', due = '', caseId = '' } = {}, today) {
  return tasks.filter((t) => {
    if (status === 'open' && !isOpenTask(t)) return false;
    if (status && status !== 'open' && t.status !== status) return false;
    if (assignee && t.assigneeId !== assignee) return false;
    if (caseId && t.caseId !== caseId) return false;
    if (due === 'overdue' && !(isOpenTask(t) && t.due < today)) return false;
    if (due === 'today' && t.due !== today) return false;
    if (due === 'week' && !inThisWeek(t.due, today)) return false;
    return true;
  });
}

export function sortTasks(tasks) {
  return [...tasks].sort((a, b) => (isOpenTask(a) === isOpenTask(b) ? byDue(a, b) : isOpenTask(a) ? -1 : 1));
}

// ---------- スタッフ候補（R-10） ----------
export const STAFF_STATUSES = ['稼働可', '休止中'];

export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  const as = minutesOf(aStart), ae = minutesOf(aEnd), bs = minutesOf(bStart), be = minutesOf(bEnd);
  if ([as, ae, bs, be].some((v) => v == null)) return true;   // 時刻が分からないときは、重なるものとして扱う（安全な側）
  return as < be && bs < ae;
}

export const EXCLUDE_REASONS = {
  inactive: '休止中',
  day: '曜日が合わない',
  time: '時間が合わない',
  conflict: '同じ時間にほかの予定',
};

// そのスタッフが、同じ日の同じ時間に、ほかの案件・シフトの枠に入っていないか（入っていれば、その内容を返す）
export function busyReason(state, staffId, date, start, end, { exceptSlotId = null, exceptCaseId = null } = {}) {
  for (const o of state.cases || []) {
    if (o.id === exceptCaseId || o.date !== date || o.status === '完了') continue;
    if (!(o.assignments || []).some((a) => a.staffId === staffId)) continue;
    if (timesOverlap(o.start, o.end, start, end)) return { type: 'case', id: o.id, label: o.name };
  }
  for (const sl of state.shifts || []) {
    if (sl.id === exceptSlotId || sl.staffId !== staffId || sl.date !== date) continue;
    if (timesOverlap(sl.start, sl.end, start, end)) {
      const room = (state.rooms || []).find((r) => r.id === sl.roomId);
      return { type: 'shift', id: sl.id, label: (room ? room.name : '常設託児室') + 'のシフト' };
    }
  }
  return null;
}

// 案件に割り当てられる候補と、外れた人の理由
export function findCandidates(state, c) {
  const assigned = new Set((c.assignments || []).map((a) => a.staffId));
  const result = { candidates: [], excluded: [], missing: [] };
  if (!c.date) result.missing.push('開催日');
  if (!c.start || !c.end) result.missing.push('開始・終了の時刻');
  if (result.missing.length) return result;
  const day = weekdayJa(c.date);
  const cs = minutesOf(c.start), ce = minutesOf(c.end);
  for (const s of state.staff) {
    if (assigned.has(s.id)) continue;
    let reason = null;
    if (s.status !== '稼働可') reason = 'inactive';
    else if (!s.days.includes(day)) reason = 'day';
    else if (minutesOf(s.from) > cs || minutesOf(s.to) < ce) reason = 'time';
    let detail = '';
    if (!reason) {
      const clash = busyReason(state, s.id, c.date, c.start, c.end, { exceptCaseId: c.id });
      if (clash) { reason = 'conflict'; detail = clash.label; }
    }
    if (reason) result.excluded.push({ staff: s, reason, detail });
    else result.candidates.push(s);
  }
  // 経験年数の長い順（同じなら名前順）
  result.candidates.sort((a, b) => (b.years - a.years) || a.name.localeCompare(b.name, 'ja'));
  return result;
}

export function excludedSummary(excluded) {
  const counts = {};
  for (const e of excluded) counts[e.reason] = (counts[e.reason] || 0) + 1;
  return Object.entries(counts).map(([k, n]) => ({ reason: k, label: EXCLUDE_REASONS[k], count: n }));
}

// スタッフが担当する案件（完了以外を日付順）
export function casesOfStaff(cases, staffId) {
  return cases.filter((c) => (c.assignments || []).some((a) => a.staffId === staffId))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ---------- 入力のチェック（D-53: 何がだめで、どうすればよいか） ----------
export const LIMITS = { name: 60, text: 60, long: 1000, inquiry: 3000, count: 999 };

function checkLength(errors, key, label, value, max) {
  if (value && value.length > max) errors[key] = `${label}は${max}文字以内にしてください（今 ${value.length}文字）`;
}
function checkCount(errors, key, label, value, { min = 0, max = LIMITS.count } = {}) {
  if (value == null) return;
  if (!Number.isInteger(value) || value < min || value > max) errors[key] = `${label}は ${min}〜${max} の整数で入れてください`;
}
function checkTimes(errors, start, end) {
  if (start && minutesOf(start) == null) errors.start = '開始の時刻を「10:00」の形で入れてください';
  if (end && minutesOf(end) == null) errors.end = '終了の時刻を「15:00」の形で入れてください';
  if (!errors.start && !errors.end && start && end && minutesOf(end) <= minutesOf(start)) errors.end = '終了の時刻は、開始より後にしてください';
}

// 数の欄: 空なら null（未入力）、数字でなければ NaN（チェックでエラーにする）
export function parseCount(raw) {
  const s = String(raw ?? '').normalize('NFKC').trim();
  if (s === '') return null;
  return /^\d+$/.test(s) ? Number(s) : NaN;
}

export function validateCase(v) {
  const e = {};
  if (!v.name?.trim()) e.name = '案件名を入れてください（例: 秋の住宅フェア 託児）';
  checkLength(e, 'name', '案件名', v.name, LIMITS.name);
  if (!v.date) e.date = '開催日を選んでください';
  else if (!parseISO(v.date)) e.date = '開催日を「2026-10-01」の形で入れてください';
  checkTimes(e, v.start, v.end);
  for (const [k, label] of [['venue', '会場'], ['company', '顧客名'], ['contact', '顧客の担当者'], ['phone', '電話'], ['email', 'メール'], ['ages', '年齢構成']]) {
    checkLength(e, k, label, v[k], LIMITS.text);
  }
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = 'メールアドレスの形になっていません（例: name@example.com）';
  if (v.phone && !/^[0-9０-９\-－() ]+$/.test(v.phone)) e.phone = '電話は数字とハイフンで入れてください';
  checkCount(e, 'children', '子ども人数', v.children);
  checkCount(e, 'requiredStaff', '必要スタッフ数', v.requiredStaff, { max: 99 });
  checkLength(e, 'confirmItems', '確認事項', v.confirmItems, LIMITS.long);
  checkLength(e, 'careNotes', '託児メモ', v.careNotes, LIMITS.long);
  return e;
}

export function validateTask(v) {
  const e = {};
  if (!v.title?.trim()) e.title = 'タスク名を入れてください（例: 見積書を送る）';
  checkLength(e, 'title', 'タスク名', v.title, LIMITS.name);
  if (!v.due) e.due = '期限を選んでください';
  else if (!parseISO(v.due)) e.due = '期限を「2026-10-01」の形で入れてください';
  if (!v.assigneeId) e.assigneeId = '担当者を選んでください';
  if (!TASK_STATUSES.includes(v.status)) e.status = 'ステータスを選んでください';
  return e;
}

export function validateStaff(v) {
  const e = {};
  if (!v.name?.trim()) e.name = '名前を入れてください';
  checkLength(e, 'name', '名前', v.name, 30);
  if (!v.days?.length) e.days = '対応できる曜日を1つ以上選んでください';
  if (minutesOf(v.from) == null) e.from = '対応できる時間の始まりを「9:00」の形で入れてください';
  if (minutesOf(v.to) == null) e.to = '対応できる時間の終わりを「18:00」の形で入れてください';
  if (!e.from && !e.to && minutesOf(v.to) <= minutesOf(v.from)) e.to = '終わりの時刻は、始まりより後にしてください';
  checkCount(e, 'years', '経験年数', v.years, { max: 60 });
  checkLength(e, 'qualification', '資格', v.qualification, LIMITS.text);
  checkLength(e, 'experience', '対応経験', v.experience, 200);
  checkLength(e, 'notes', '備考', v.notes, 300);
  if (!STAFF_STATUSES.includes(v.status)) e.status = 'ステータスを選んでください';
  return e;
}

export function validateRecord(v, today) {
  const e = {};
  if (!v.caseId) e.caseId = '案件を選んでください';
  if (!v.date) e.date = '実施日を選んでください';
  else if (!parseISO(v.date)) e.date = '実施日を「2026-10-01」の形で入れてください';
  else if (today && v.date > today) e.date = '実施日に未来の日は選べません（実施したあとに登録します）';
  if (v.children == null) e.children = '実際の子ども人数を入れてください（0人なら 0）';
  else checkCount(e, 'children', '実際の子ども人数', v.children);
  if (v.staff == null) e.staff = '実際のスタッフ人数を入れてください';
  else checkCount(e, 'staff', '実際のスタッフ人数', v.staff, { max: 99 });
  checkTimes(e, v.start, v.end);
  if (!v.start) e.start = '開始の時刻を入れてください';
  if (!v.end) e.end = '終了の時刻を入れてください';
  checkLength(e, 'notes', '申し送り事項', v.notes, LIMITS.long);
  return e;
}

// 予定と実際の差（+2 / -1 / ±0）。どちらかが未入力なら null
export function diffLabel(planned, actual) {
  if (planned == null || actual == null) return null;
  const d = actual - planned;
  return d === 0 ? '予定どおり' : d > 0 ? `予定より${d}名多い` : `予定より${-d}名少ない`;
}

// 対応できる曜日の書き方（毎日・平日・土日・月水金）
export function formatDays(days) {
  const set = WEEKDAYS.filter((d) => days.includes(d));
  if (set.length === 7) return '毎日';
  if (set.join('') === '月火水木金') return '平日';
  if (set.join('') === '土日') return '土日';
  if (set.join('') === '月火水木金土') return '月〜土';
  return set.length ? set.join('・') : 'なし';
}

// ---------- 進捗ステップ（R-07） ----------
// その段階で人がやること（進捗ステップの下に出す）
export const STATUS_GUIDE = {
  '問い合わせ': '問い合わせの内容を確かめ、ヒアリングの日時を決める',
  'ヒアリング': '子どもの人数・年齢・部屋・アレルギーの有無などを聞き取る',
  '見積': '見積を作って送り、返事を待つ',
  '申込確認': '申込書を受け取り、内容を確かめる',
  'スタッフ手配': '必要な人数のスタッフに依頼し、確定させる',
  '最終確認': '当日の持ち物・名簿・集合時間を確かめる',
  '実施済み': '実績（人数・時間・申し送り）を登録する',
  '完了': 'この案件の対応は終わりました',
};

// 次に進める前に、人に知らせること（止めはしない。進めるかは人が決める）
export function advanceWarnings(c, { tasks = [], record = null, today } = {}) {
  const next = nextStatus(c.status);
  const w = [];
  if (!next) return w;
  if (next === 'スタッフ手配' && c.requiredStaff == null) w.push('必要スタッフ数がまだ入っていません');
  if (c.status === 'スタッフ手配') {
    const short = staffShortage(c);
    if (short > 0) w.push(`確定したスタッフがあと${short}名足りません`);
    const req = staffCounts(c).requested;
    if (req > 0) w.push(`返事待ち（依頼中）のスタッフが${req}名います`);
  }
  if (next === '実施済み' && today && c.date > today) w.push(`開催日（${formatDate(c.date)}）より前です`);
  if (next === '完了') {
    if (!record) w.push('実績がまだ登録されていません');
    const open = tasks.filter((t) => t.caseId === c.id && isOpenTask(t)).length;
    if (open) w.push(`終わっていないタスクが${open}件あります`);
  }
  return w;
}
