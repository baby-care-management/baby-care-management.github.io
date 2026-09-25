// ダッシュボード（R-01〜R-03）
import { h, pageHead, panel, empty, icon, statusBadge, roleTag, linkButton } from '../ui.js';
import { getState, memberName } from '../store.js';
import * as L from '../logic.js';
import { today, staffFill, nextTaskInline, taskRow } from './parts.js';
import { weekCounts } from '../shift.js';

export function render() {
  const s = getState();
  const now = today();
  const k = L.kpis(s, now);

  const kpi = (label, value, unit, href, note, alert) =>
    h('a', { class: 'kpi' + (alert ? ' is-alert' : ''), href },
      h('span', { class: 'kpi-label' }, label),
      h('span', { class: 'kpi-value' }, alert ? icon('alert') : null, String(value), h('small', null, unit)),
      h('span', { class: 'kpi-note' }, note));

  const kpis = h('div', { class: 'kpis' },
    kpi('対応中の案件', k.activeCases, '件', '#/cases?status=active', '完了していない案件'),
    kpi('今日が期限のタスク', k.todayTasks, '件', '#/tasks?due=today', '終わっていないもの'),
    kpi('期限切れのタスク', k.overdueTasks, '件', '#/tasks?due=overdue', k.overdueTasks ? '先に片づける' : 'ありません', k.overdueTasks > 0),
    kpi('今週の案件', k.weekCases, '件', '#/cases?period=week', `${L.formatDateShort(L.startOfWeek(now))}〜${L.formatDateShort(L.addDays(L.startOfWeek(now), 6))}`));

  return h('div', null,
    pageHead({
      title: 'ダッシュボード',
      lead: `今日は ${L.formatDateLong(now)}`,
      actions: [linkButton('問い合わせを整理する', '#/assistant', { kind: 'primary', iconName: 'assistant' }),
        linkButton(`今週のシフト表（未手配 ${weekCounts(s, L.startOfWeek(now)).open}枠）`, '#/shifts', { iconName: 'staff' })],
    }),
    kpis,
    h('div', { class: 'v-stack' },
      flowPanel(s),
      h('div', { class: 'dash-grid' },
        todayPanel(s, now),
        casesPanel(s))));
}

// 業務の流れと役割分担（R-02）。PC は「段階 × 役割」の表（スイムレーン）、スマホは段階ごとの並び
const ROLES = [['ai', 'AI', '整理・下書き・要約'], ['system', 'システム', '記録・進み具合・タスク'], ['human', '人', '最終確認・判断・例外への対応']];

function flowPanel(s) {
  const counts = L.stageCounts(s);
  const stageLink = (st, cls) => {
    const isTasks = st.key === 'tasks';
    return h('a', { class: cls, href: isTasks ? '#/tasks' : '#/cases?stage=' + st.key },
      h('span', { class: 'flow-name' }, st.label),
      h('span', { class: 'flow-count' }, String(counts[st.key]), h('small', null, isTasks ? '件のタスク' : '件の案件')),
      h('span', { class: 'flow-statuses' }, isTasks ? 'すべての段階で使う' : st.statuses.join('・')));
  };
  const roleText = (st, r) => (st.roles[r] === '—'
    ? [h('span', { class: 'cell-muted', 'aria-hidden': 'true' }, '—'), h('span', { class: 'visually-hidden' }, 'なし')]
    : st.roles[r]);

  const lanes = h('table', { class: 'lanes' },
    h('caption', { class: 'visually-hidden' }, '業務の流れと、段階ごとの AI・システム・人の役割'),
    h('thead', null, h('tr', null,
      h('td', { class: 'lane-corner' }),
      L.STAGES.map((st) => h('th', { scope: 'col' }, stageLink(st, 'flow-step'))))),
    h('tbody', null, ROLES.map(([r, label]) => h('tr', { class: 'lane-' + r },
      h('th', { scope: 'row' }, roleTag(r)),
      L.STAGES.map((st) => h('td', null, roleText(st, r)))))));

  const stacked = h('ol', { class: 'flow-list' }, L.STAGES.map((st) => h('li', null,
    stageLink(st, 'flow-step'),
    h('ul', { class: 'flow-roles' }, ROLES.filter(([r]) => st.roles[r] !== '—').map(([r]) =>
      h('li', null, roleTag(r), h('span', null, st.roles[r])))))));

  return panel({
    id: 'flow', title: '業務の流れ',
    actions: [h('ul', { class: 'role-legend', 'aria-label': '役割の見方' },
      ROLES.map(([r, , text]) => h('li', null, roleTag(r), text)))],
    body: [h('div', { class: 'lanes-wrap' }, lanes), stacked],
  });
}

// 今日対応するタスク（期限切れ＋今日。R-03）
function todayPanel(s, now) {
  const list = L.todaysTasks(s.tasks, now);
  const overdue = list.filter((t) => t.due < now).length;
  return panel({
    id: 'today-tasks', cls: 'dash-tasks', title: '今日対応するタスク', count: `${list.length}件` + (overdue ? `（うち期限切れ ${overdue}件）` : ''),
    body: list.length
      ? h('ul', { class: 'rows' }, list.map((t) => taskRow(t)))
      : empty('今日対応するタスクはありません', '明日以降のタスクは「タスク」で見られます。'),
    foot: h('a', { href: '#/tasks' }, 'すべてのタスクを見る'),
  });
}

// これからの案件（今日以降・完了以外を近い順。R-03）
function casesPanel(s) {
  const now = today();
  const upcoming = L.sortCases(s.cases.filter((c) => L.isOpenCase(c) && c.date >= now));
  const list = upcoming.slice(0, 8);
  const rows = h('ul', { class: 'rows case-rows' }, list.map((c) => h('li', null,
    h('div', { class: 'date-block' + (c.date === now ? ' is-today' : '') },
      h('span', { class: 'date-md num' }, L.formatDateShort(c.date).replace(/（.）$/, '')),
      h('span', { class: 'date-sub' }, `${L.weekdayJa(c.date)}曜・${L.dueLabel(c.date, now)}`)),
    h('div', { class: 'row-main' },
      h('p', { class: 'row-title' }, h('a', { href: '#/cases/' + c.id }, c.name)),
      h('p', { class: 'row-meta' },
        h('span', { class: 'num' }, L.formatTimeRange(c.start, c.end)),
        h('span', null, c.venue || '会場は未入力'),
        h('span', null, '担当 ' + memberName(c.ownerId))),
      h('p', { class: 'row-meta' }, nextTaskInline(c.id))),
    h('div', { class: 'row-side is-col' }, statusBadge(c.status), staffFill(c)))));
  return panel({
    id: 'dash-cases', cls: 'dash-cases', title: 'これからの案件', count: `${upcoming.length}件`,
    body: list.length ? rows : empty('これからの案件はありません', '問い合わせを整理すると、案件として登録できます。'),
    foot: h('a', { href: '#/cases' }, `すべての案件を見る（${s.cases.length}件）`),
  });
}
