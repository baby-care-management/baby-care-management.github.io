// シフト表（R-18・R-19）。常設託児室3か所の枠と、イベント託児の案件・スタッフの予定を、1つの表で見る
import { h, pageHead, panel, empty, icon, button, field, input, select, fieldset, openDialog, confirmDialog, toast, clear } from '../ui.js';
import { getState, update, findStaff, findRoom, nextId } from '../store.js';
import * as L from '../logic.js';
import * as SH from '../shift.js';
import { today, staffTabs } from './parts.js';

const VIEWS = [['room', '場所別'], ['staff', 'スタッフ別'], ['timeline', 'タイムライン'], ['month', '月']];
const dayLabel = (iso) => `${L.formatDateShort(iso).replace(/（.）$/, '')}（${L.weekdayJa(iso)}）`;
const timeText = (a, b) => `${a}〜${b}`;
const roomShort = (r) => (r ? r.name : '常設託児室');

let refreshView = () => {};

export function render({ query, refresh }) {
  refreshView = refresh;
  const now = today();
  const w0 = L.parseISO(query.get('w') || '') ? query.get('w') : now;
  const view = VIEWS.some(([k]) => k === query.get('view')) ? query.get('view') : 'room';
  const ws = L.startOfWeek(w0);
  // タイムラインは「日」を1つ選ぶ（d）。ほかの見かたから切り替えたときは、その週の今日（なければ週の初め）
  const day = L.parseISO(query.get('d') || '') ? query.get('d') : (now >= ws && now <= L.addDays(ws, 6) ? now : ws);
  const link = (w, v = view) => (v === 'timeline' ? `#/shifts?view=timeline&d=${w}` : `#/shifts?w=${w}&view=${v}`);
  const st = getState();

  const nav = view === 'timeline'
    ? h('div', { class: 'shift-nav' },
      h('a', { class: 'btn', href: link(L.addDays(day, -1)) }, icon('back'), '前の日'),
      h('a', { class: 'btn', href: link(now) }, '今日'),
      h('a', { class: 'btn', href: link(L.addDays(day, 1)) }, '次の日', icon('arrow')),
      h('p', { class: 'shift-period', role: 'status' }, L.formatDateLong(day)))
    : view === 'month'
    ? h('div', { class: 'shift-nav' },
      h('a', { class: 'btn', href: link(SH.addMonths(w0, -1)) }, icon('back'), '前の月'),
      h('a', { class: 'btn', href: link(now) }, '今月'),
      h('a', { class: 'btn', href: link(SH.addMonths(w0, 1)) }, '次の月', icon('arrow')),
      h('p', { class: 'shift-period', role: 'status' }, `${+w0.slice(0, 4)}年${+w0.slice(5, 7)}月`))
    : h('div', { class: 'shift-nav' },
      h('a', { class: 'btn', href: link(L.addDays(ws, -7)) }, icon('back'), '前の週'),
      h('a', { class: 'btn', href: link(now) }, '今週'),
      h('a', { class: 'btn', href: link(L.addDays(ws, 7)) }, '次の週', icon('arrow')),
      h('p', { class: 'shift-period', role: 'status' }, `${L.formatDate(ws)}〜${L.formatDate(L.addDays(ws, 6))}`));

  const tabs = h('div', { class: 'seg', role: 'group', 'aria-label': '見かた' },
    VIEWS.map(([k, label]) => h('a', { class: 'seg-btn', href: k === 'timeline' ? `#/shifts?view=timeline&d=${day}` : `#/shifts?w=${view === 'timeline' ? day : w0}&view=${k}`, 'aria-current': view === k ? 'page' : null }, label)));

  const cnt = view === 'timeline' ? SH.dayTimeline(st, day).counts : SH.weekCounts(st, ws);
  const body = view === 'room' ? roomView(st, ws, now) : view === 'staff' ? staffView(st, ws, now) : view === 'timeline' ? timelineView(st, day, now) : monthView(st, w0, now);

  return h('div', null,
    staffTabs('shifts'),
    pageHead({
      title: 'シフト表',
      lead: '常設託児室3か所の枠と、イベント託児の案件・スタッフの予定を、1つの表で見ます。枠を押すと、スタッフを手配できます。',
      actions: [
        button('この週の枠を作る', { iconName: 'plus', kind: 'primary', onClick: () => makeWeek(view === 'timeline' ? L.startOfWeek(day) : ws) }),
        button('枠を追加', { iconName: 'plus', onClick: () => openAddSlot(view === 'timeline' ? L.startOfWeek(day) : ws) }),
        button('定期シフトの設定', { iconName: 'edit', onClick: () => openPatternDialog() })],
    }),
    h('div', { class: 'shift-bar' }, nav, tabs),
    view !== 'month' ? h('p', { class: 'shift-count' },
      `${view === 'timeline' ? 'この日' : 'この週'}の常設託児室の枠: ${cnt.total}枠（確定 ${cnt.confirmed}・依頼中 ${cnt.requested}・`,
      cnt.open ? h('span', { class: 'warn' }, icon('alert'), `未手配 ${cnt.open}`) : '未手配 0', '）') : null,
    body);
}

// ---------- 枠の1つ分（押すと手配の画面） ----------
function slotButton(sl, { showRoom = false } = {}) {
  const st = getState();
  const room = findRoom(sl.roomId);
  const who = sl.staffId ? findStaff(sl.staffId)?.name || '（登録なし）' : '未手配';
  const cls = !sl.staffId ? 'is-open' : sl.state === '確定' ? 'is-ok' : 'is-req';
  const label = `${showRoom ? roomShort(room) + ' ' : ''}${dayLabel(sl.date)} ${timeText(sl.start, sl.end)} ${who}${sl.staffId ? '（' + sl.state + '）' : ''}`;
  return h('button', { type: 'button', class: 'slot ' + cls, 'aria-label': `${label}。手配の画面を開く`, onclick: () => openSlotDialog(sl.id) },
    h('span', { class: 'slot-time num' }, timeText(sl.start, sl.end)),
    h('span', { class: 'slot-who' }, !sl.staffId ? icon('alert') : null, who),
    sl.staffId ? h('span', { class: 'slot-state' }, sl.state === '確定' ? icon('check') : null, sl.state) : null);
}

const caseChip = (c) => h('a', { class: 'slot is-case', href: '#/cases/' + c.id },
  h('span', { class: 'slot-time num' }, timeText(c.start || '？', c.end || '？')),
  h('span', { class: 'slot-who' }, c.name),
  h('span', { class: 'slot-state' }, `確定 ${L.staffCounts(c).confirmed}/${c.requiredStaff ?? '？'}`));

// ---------- 場所別（行＝常設託児室3か所と案件、列＝月〜日） ----------
function roomView(st, ws, now) {
  const dates = SH.weekDates(ws);
  const casesOn = (date) => st.cases.filter((c) => c.date === date && c.status !== '完了').sort((a, b) => (a.start || '') < (b.start || '') ? -1 : 1);
  const rows = [
    ...st.rooms.map((r) => ({ key: r.id, head: [r.name, r.hours], cell: (date) => SH.slotsOf(st, { roomId: r.id, date }).map((s) => slotButton(s)) })),
    { key: 'cases', head: ['案件', 'イベント託児など'], cell: (date) => casesOn(date).map(caseChip) },
  ];
  const grid = h('div', { class: 'table-wrap shift-desktop' }, h('table', { class: 'shift-grid' },
    h('caption', { class: 'visually-hidden' }, '場所ごとの1週間のシフト'),
    h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'sg-corner' }, '場所'),
      dates.map((d) => h('th', { scope: 'col', class: d === now ? 'is-today' : (d < now ? 'is-past' : '') }, dayLabel(d), d === now ? h('span', { class: 'sg-today' }, '今日') : null)))),
    h('tbody', null, rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, h('span', { class: 'sg-name' }, r.head[0]), h('span', { class: 'sg-sub' }, r.head[1])),
      dates.map((d) => { const c = r.cell(d); return h('td', { class: d === now ? 'is-today' : '' }, c.length ? c : h('span', { class: 'cell-muted', 'aria-label': '枠なし' }, '—')); }))))));

  const days = h('ol', { class: 'shift-days' }, dates.map((d) => h('li', { class: d === now ? 'is-today' : '' },
    h('h2', { class: 'sd-head' }, dayLabel(d), d === now ? h('span', { class: 'sg-today' }, '今日') : null),
    rows.map((r) => { const c = r.cell(d); return c.length ? h('div', { class: 'sd-room' }, h('p', { class: 'sd-name' }, r.head[0]), h('div', { class: 'sd-slots' }, c)) : null; }),
    rows.every((r) => !r.cell(d).length) ? h('p', { class: 'cell-muted' }, '枠も案件もありません') : null)));
  return h('div', null, grid, h('div', { class: 'shift-mobile' }, days), emptyHint(st, ws));
}

function emptyHint(st, ws) {
  return SH.weekCounts(st, ws).total ? null
    : h('div', { class: 'notice' }, icon('alert'), h('span', null, 'この週には、常設託児室の枠がまだありません。「この週の枠を作る」を押すと、定期シフトから枠が作られます。'));
}

// ---------- スタッフ別（行＝スタッフ、列＝月〜日） ----------
function staffView(st, ws, now) {
  const dates = SH.weekDates(ws);
  const info = st.staff.map((s) => ({ s, w: SH.staffWeek(st, s.id, ws) }));
  const itemChip = (it) => it.type === 'shift'
    ? h('button', { type: 'button', class: 'slot ' + (it.state === '確定' ? 'is-ok' : 'is-req'), onclick: () => openSlotDialog(it.id), 'aria-label': `${roomShort(findRoom(it.roomId))} ${timeText(it.start, it.end)}（${it.state}）。手配の画面を開く` },
      h('span', { class: 'slot-time num' }, timeText(it.start, it.end)), h('span', { class: 'slot-who' }, roomShort(findRoom(it.roomId))), h('span', { class: 'slot-state' }, it.state))
    : h('a', { class: 'slot is-case', href: '#/cases/' + it.id },
      h('span', { class: 'slot-time num' }, timeText(it.start || '？', it.end || '？')), h('span', { class: 'slot-who' }, it.name), h('span', { class: 'slot-state' }, it.state));
  const cellFor = ({ s, w }, d) => {
    const its = w.items.filter((x) => x.date === d);
    if (s.status !== '稼働可') return h('span', { class: 'cell-muted' }, '休止中');
    if (!s.days.includes(L.weekdayJa(d))) return h('span', { class: 'off' }, '対応外');
    return its.length ? its.map(itemChip) : h('span', { class: 'cell-muted' }, `空き ${s.from}〜${s.to}`);
  };
  const grid = h('div', { class: 'table-wrap shift-desktop' }, h('table', { class: 'shift-grid' },
    h('caption', { class: 'visually-hidden' }, 'スタッフごとの1週間の予定'),
    h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'sg-corner' }, 'スタッフ'),
      dates.map((d) => h('th', { scope: 'col', class: d === now ? 'is-today' : '' }, dayLabel(d), d === now ? h('span', { class: 'sg-today' }, '今日') : null)))),
    h('tbody', null, info.map((x) => h('tr', { class: x.s.status !== '稼働可' ? 'is-off' : '' },
      h('th', { scope: 'row' }, h('a', { class: 'sg-name', href: '#/staff/' + x.s.id }, x.s.name), h('span', { class: 'sg-sub num' }, `今週 ${Math.round(x.w.hours * 10) / 10}時間`)),
      dates.map((d) => h('td', { class: d === now ? 'is-today' : '' }, cellFor(x, d))))))));
  const list = h('ul', { class: 'shift-mobile shift-staff-list' }, info.map((x) => h('li', null,
    h('p', { class: 'sd-name' }, h('a', { href: '#/staff/' + x.s.id }, x.s.name), h('span', { class: 'sg-sub num' }, `　今週 ${Math.round(x.w.hours * 10) / 10}時間${x.s.status !== '稼働可' ? '・休止中' : ''}`)),
    x.w.items.length ? h('div', { class: 'sd-slots' }, x.w.items.map((it) => h('div', { class: 'sd-item' }, h('span', { class: 'sd-date' }, dayLabel(it.date)), itemChip(it)))) : h('p', { class: 'cell-muted' }, 'この週の予定はありません'))));
  return h('div', null, grid, list);
}

// ---------- 月 ----------
function monthView(st, w0, now) {
  const weeks = SH.monthGrid(st, w0);
  const grid = h('table', { class: 'month-grid' },
    h('caption', { class: 'visually-hidden' }, '1か月のシフトの状況。日を押すと、その週の表が開く'),
    h('thead', null, h('tr', null, L.WEEKDAYS.map((d) => h('th', { scope: 'col' }, d)))),
    h('tbody', null, weeks.map((wk) => h('tr', null, wk.map((c) => {
      const label = `${dayLabel(c.date)}: 枠 ${c.counts.total}（未手配 ${c.counts.open}）・案件 ${c.cases}件。この週の表を開く`;
      return h('td', { class: (c.inMonth ? '' : 'is-out ') + (c.date === now ? 'is-today' : '') },
        h('a', { href: `#/shifts?w=${L.startOfWeek(c.date)}&view=room`, 'aria-label': label },
          h('span', { class: 'mg-date num' }, String(+c.date.slice(8))),
          c.counts.total ? h('span', { class: 'mg-line' }, `枠 ${c.counts.confirmed}/${c.counts.total}`) : null,
          c.counts.open ? h('span', { class: 'mg-line warn' }, icon('alert'), h('span', { class: 'mg-word' }, '未手配 '), String(c.counts.open)) : null,
          c.cases ? h('span', { class: 'mg-line' }, `案件 ${c.cases}`) : null));
    })))));
  return h('div', null, h('p', { class: 'hint' }, '「枠 確定/全体」と、未手配の枠の数（▲）です。日を押すと、その週の場所別の表が開きます。'), grid);
}

// ---------- 週の枠を作る ----------
function makeWeek(ws) {
  let n = 0;
  update((s) => { const made = SH.missingSlots(s, ws, (p) => nextId(p)); s.shifts.push(...made); n = made.length; });
  toast(n ? `${L.formatDate(ws)}からの週に、${n}枠を作りました。すでにある枠は、そのままです` : 'この週の枠は、定期シフトのとおり、すべてそろっています');
}

// ---------- 枠を追加 ----------
function openAddSlot(ws) {
  const st = getState();
  openDialog({
    title: '枠を追加',
    lead: '定期シフトにない枠（臨時の枠）を、1回だけ作ります。',
    submitLabel: '追加する',
    body: h('div', { class: 'form-grid' },
      field('場所', select('roomId', st.rooms.map((r) => [r.id, r.name]), st.rooms[0]?.id), { required: true, cls: 'span-2' }),
      field('日付', input('date', today() >= ws && today() <= L.addDays(ws, 6) ? today() : ws, { type: 'date' }), { required: true }),
      field('枠の数', input('count', '1', { inputmode: 'numeric' }), { hint: '同じ時間に何人必要か（1〜10）' }),
      field('開始', input('start', '10:00', { type: 'time' }), { required: true }),
      field('終了', input('end', '14:00', { type: 'time' }), { required: true })),
    onSubmit: (form) => {
      const el = form.elements;
      const v = { roomId: el.roomId.value, date: el.date.value, start: el.start.value, end: el.end.value, count: L.parseCount(el.count.value) ?? 1 };
      const errors = SH.validateSlot(v, st.rooms);
      if (Object.keys(errors).length) return errors;
      update((s) => { for (let i = 0; i < v.count; i++) s.shifts.push({ id: nextId('sh'), roomId: v.roomId, date: v.date, start: v.start, end: v.end, staffId: null, state: '依頼中', patternId: null }); });
      toast(`${v.count}枠を追加しました`);
      return null;
    },
  });
}

// ---------- 枠の手配（スタッフを選ぶ） ----------
export function openSlotDialog(slotId) {
  const st = getState();
  const sl = st.shifts.find((x) => x.id === slotId);
  if (!sl) return;
  const room = findRoom(sl.roomId);
  const r = SH.findSlotCandidates(st, sl);
  const cur = sl.staffId ? findStaff(sl.staffId) : null;
  const ws = L.startOfWeek(sl.date);
  const hrs = (s) => Math.round(SH.staffWeek(st, s.id, ws).hours * 10) / 10;
  const opts = [['', '未手配（だれも入れない）'], ...(cur ? [[cur.id, `${cur.name}（いま入っている人）`]] : []), ...r.candidates.map((s) => [s.id, `${s.name}（${s.qualification || '資格なし'}・経験${s.years ?? '?'}年・この週 ${hrs(s)}時間）`])];
  const staffSel = select('staffId', opts, sl.staffId || '');
  const stateSel = select('state', SH.SLOT_STATES, sl.state);
  const why = r.excluded.length ? h('details', { class: 'excluded' },
    h('summary', null, `入れない人 ${r.excluded.length}名（曜日・時間・休止中・ほかの予定）`),
    h('ul', null, r.excluded.map((e) => h('li', null, h('a', { href: '#/staff/' + e.staff.id }, e.staff.name), `：${L.EXCLUDE_REASONS[e.reason]}${e.detail ? `（${e.detail}）` : ''}`)))) : null;

  let dlg;
  dlg = openDialog({
    title: `${roomShort(room)}　${L.formatDate(sl.date)} ${timeText(sl.start, sl.end)}`,
    lead: r.candidates.length || cur ? '入れる人の中から選びます。「依頼中」は、連絡して返事を待っている状態です。システムは、スタッフに連絡しません。' : 'この時間に入れる人がいません。「入れない人」の理由を見て、時間の相談などをしてください。',
    submitLabel: '保存する',
    body: h('div', null,
      h('div', { class: 'form-grid' },
        field('スタッフ', staffSel, { cls: 'span-2' }),
        field('状態', stateSel, { hint: '未手配のときは使いません' })),
      why,
      h('div', { class: 'page-actions mt-3' },
        button('この枠を削除', { kind: 'danger', size: 'sm', onClick: () => confirmDialog({ title: 'この枠を削除しますか', message: `${roomShort(room)}の ${L.formatDate(sl.date)} ${timeText(sl.start, sl.end)} の枠を削除します。入っている人は外れます。元には戻せません。`, okLabel: '削除する', onOk: () => { dlg.close(); dlg.remove(); update((s) => { s.shifts = s.shifts.filter((x) => x.id !== slotId); }); toast('枠を削除しました'); } }) }))),
    onSubmit: (form) => {
      const staffId = form.elements.staffId.value || null;
      const state = form.elements.state.value;
      update((s) => { const x = s.shifts.find((y) => y.id === slotId); x.staffId = staffId; x.state = state; });
      toast(staffId ? `${findStaff(staffId).name}さんを「${state}」にしました。依頼の連絡は別に行ってください` : '未手配に戻しました');
      return null;
    },
  });
  return dlg;
}

// ---------- 定期シフトの設定 ----------
export function openPatternDialog(roomId) {
  const st = getState();
  const room = findRoom(roomId) || st.rooms[0];
  if (!room) return;
  const roomSel = select('roomId', st.rooms.map((r) => [r.id, r.name]), room.id, { id: 'pat-room' });
  let dlg;
  roomSel.addEventListener('change', () => { dlg.close(); dlg.remove(); openPatternDialog(roomSel.value); });
  const list = room.pattern.length ? h('ul', { class: 'rows pat-list' }, room.pattern.map((p) => h('li', null,
    h('div', { class: 'row-main' }, h('p', { class: 'row-title num' }, SH.patternLabel(p))),
    h('div', { class: 'row-side' }, h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': `定期シフト「${SH.patternLabel(p)}」を削除する`, onclick: () => confirmDialog({
      title: '定期シフトを削除しますか', message: `「${SH.patternLabel(p)}」を、${room.name}の定期シフトから削除します。すでに作った枠は、そのまま残ります。`, okLabel: '削除する',
      onOk: () => { dlg.close(); dlg.remove(); update((s) => { const r = s.rooms.find((x) => x.id === room.id); r.pattern = r.pattern.filter((x) => x.id !== p.id); }); toast('定期シフトを削除しました'); openPatternDialog(room.id); },
    }) }, icon('close')))))) : h('p', { class: 'cell-muted' }, 'この場所には、定期シフトがまだありません。');
  const days = h('div', { class: 'day-picks' }, L.WEEKDAYS.map((d) => h('label', { class: 'day-pick' }, h('input', { type: 'checkbox', name: 'days', value: d }), h('span', null, d))));
  dlg = openDialog({
    title: '定期シフトの設定',
    lead: '曜日・時間・人数のパターンを決めておくと、「この週の枠を作る」で、その週の枠がまとめて作られます。',
    submitLabel: 'パターンを追加する',
    wide: true,
    body: h('div', null,
      field('場所', roomSel),
      h('h3', { class: 'sub-head' }, `${room.name}の定期シフト`), list,
      h('h3', { class: 'sub-head mt-4' }, 'パターンを追加'),
      h('div', { class: 'form-grid' },
        fieldset('曜日', days, { name: 'days', cls: 'span-2' }),
        field('開始', input('start', '10:00', { type: 'time' }), { required: true }),
        field('終了', input('end', '14:00', { type: 'time' }), { required: true }),
        field('人数', input('need', '1', { inputmode: 'numeric' }), { hint: '同じ時間に必要な人数（1〜10）' }))),
    onSubmit: (form) => {
      const v = { days: [...form.querySelectorAll('input[name=days]:checked')].map((i) => i.value), start: form.elements.start.value, end: form.elements.end.value, need: L.parseCount(form.elements.need.value) };
      const errors = SH.validatePattern(v);
      if (Object.keys(errors).length) return errors;
      update((s) => { s.rooms.find((r) => r.id === room.id).pattern.push({ id: nextId('p'), ...v }); });
      toast('定期シフトを追加しました。「この週の枠を作る」で、枠が作られます');
      return null;
    },
  });
  return dlg;
}

// ---------- タイムライン（1日を横向きの時間軸で見る。R-31） ----------
// 位置と長さは、要素の style（CSSOM）で指定する。属性の style は CSP で止めているため使わない
function place(el, s, e, range) {
  el.style.left = SH.pctOf(s, range) + '%';
  el.style.width = Math.max(0.5, SH.pctOf(e, range) - SH.pctOf(s, range)) + '%';
  return el;
}
function axis(range) {
  const hours = [];
  for (let m = range.s; m <= range.e; m += 60) hours.push(m);
  return hours;
}

function bar(it, range, { label, dialog = true }) {
  const roomName = it.roomId ? roomShort(findRoom(it.roomId)) : '';
  const cls = it.type === 'case' ? 'is-case' : !it.staffId ? 'is-open' : it.state === '確定' ? 'is-ok' : 'is-req';
  const time = `${it.start}〜${it.end}`;
  const text = label || (it.type === 'case' ? it.name : roomName);
  const state = it.type === 'case' ? (it.state || '') : (it.staffId ? it.state : '未手配');
  const aria = `${text} ${time}${state ? `（${state}）` : ''}。${it.type === 'case' ? '案件の詳細を開く' : '手配の画面を開く'}`;
  const kids = [h('span', { class: 'tb-time num' }, time), h('span', { class: 'tb-text' }, !it.staffId && it.type === 'shift' ? icon('alert') : null, text)];
  const el = it.type === 'case'
    ? h('a', { class: 'tb ' + cls, href: '#/cases/' + it.id, 'aria-label': aria, title: `${text} ${time}` }, kids)
    : h('button', { type: 'button', class: 'tb ' + cls, 'aria-label': aria, title: `${text} ${time}${state ? `（${state}）` : ''}`, onclick: () => openSlotDialog(it.id) }, kids);
  return place(el, it.s, it.e, range);
}

function timelineView(st, date, now) {
  const tl = SH.dayTimeline(st, date);
  const { range } = tl;
  const hours = axis(range);
  const ticks = () => hours.map((m) => { const t = h('span', { class: 'tl-tick', 'aria-hidden': 'true' }); t.style.left = SH.pctOf(m, range) + '%'; return t; });
  const nowMin = date === now ? new Date().getHours() * 60 + new Date().getMinutes() : null;
  const nowLine = () => {
    if (nowMin == null || nowMin < range.s || nowMin > range.e) return null;
    const n = h('span', { class: 'tl-now', 'aria-hidden': 'true' }); n.style.left = SH.pctOf(nowMin, range) + '%'; return n;
  };
  const mkHead = () => h('div', { class: 'tl-row tl-head' },
    h('div', { class: 'tl-label' }, ''),
    h('div', { class: 'tl-track' }, ticks(), hours.slice(0, -1).map((m) => { const t = h('span', { class: 'tl-hour num' }, `${Math.floor(m / 60)}時`); t.style.left = SH.pctOf(m, range) + '%'; return t; })));

  // スタッフ別: だれが何時から何時まで
  const staffRows = tl.staffRows.map((r) => {
    const summary = r.items.length ? `${SH.hhmm(r.first)}〜${SH.hhmm(r.last)}・${SH.hoursText(r.minutes)}` : (r.reason || `空き ${r.staff.from}〜${r.staff.to}`);
    const track = h('div', { class: 'tl-track' }, ticks());
    if (r.avail) track.append(place(h('span', { class: 'tl-avail', 'aria-hidden': 'true' }), r.avail.s, r.avail.e, range));
    for (const it of r.items) track.append(bar(it, range, { label: it.type === 'shift' ? roomShort(findRoom(it.roomId)) : it.name }));
    const n = nowLine(); if (n) track.append(n);
    return h('div', { class: 'tl-row tl-staff' + (r.reason ? ' is-off' : '') },
      h('div', { class: 'tl-label' }, h('a', { class: 'tl-name', href: '#/staff/' + r.staff.id }, r.staff.name),
        h('span', { class: 'tl-sub num' }, summary), r.avail ? h('span', { class: 'tl-sub num' }, `稼働可 ${r.staff.from}〜${r.staff.to}`) : null),
      track);
  });

  // 場所別: 何人が何時から何時まで入るか（重なる枠は、上下に分ける）
  const laneBlock = (name, sub, lanes) => {
    const track = h('div', { class: 'tl-track tl-lanes' }, ticks());
    lanes.forEach((lane, i) => lane.forEach((it) => {
      const el = bar(it, range, { label: it.type === 'case' ? it.name : (it.staffId ? (findStaff(it.staffId)?.name || '（登録なし）') : '未手配') });
      el.style.top = (4 + i * 48) + 'px';
      track.append(el);
    }));
    track.style.minHeight = Math.max(1, lanes.length) * 48 + 8 + 'px';
    const n = nowLine(); if (n) track.append(n);
    return h('div', { class: 'tl-row' },
      h('div', { class: 'tl-label' }, h('span', { class: 'tl-name' }, name), h('span', { class: 'tl-sub' }, sub)), track);
  };
  const roomRows = tl.roomRows.map((r) => laneBlock(r.room.name, lanesSummary(r.lanes), r.lanes));
  const caseRow = laneBlock('案件', 'イベント託児など', tl.caseLanes);

  const legend = h('ul', { class: 'tl-legend', 'aria-label': '色の見かた' },
    h('li', null, h('span', { class: 'tl-key is-ok' }), '確定'), h('li', null, h('span', { class: 'tl-key is-req' }), '依頼中'),
    h('li', null, h('span', { class: 'tl-key is-open' }), '未手配'), h('li', null, h('span', { class: 'tl-key is-case' }), '案件'),
    h('li', null, h('span', { class: 'tl-key is-avail' }), '稼働できる時間'));

  const wrap = (title, sub, rows) => panel({
    title, body: [h('p', { class: 'lead-text tl-lead' }, sub),
      h('div', { class: 'tl-scroll', tabindex: '0', role: 'region', 'aria-label': `${title}のタイムライン（横にスクロールできます）` }, h('div', { class: 'tl' }, mkHead(), rows))],
  });
  return h('div', { class: 'v-stack' }, legend,
    wrap('スタッフ別（だれが、何時まで入るか）', '横の長さが、入る時間です。薄い帯は、そのスタッフが稼働できる時間です。左の名前の下に、その日の最初〜最後の時間と、合計の時間が出ます。', staffRows),
    wrap('場所別（何人が、何時に入るか）', '重なる枠は、上下に分けて出します。赤い枠は、だれも入っていない未手配の枠です。', [...roomRows, caseRow]));
}

const lanesSummary = (lanes) => (lanes.length ? `最大 ${lanes.length}名が同時に入る枠` : 'この日の枠はありません');
