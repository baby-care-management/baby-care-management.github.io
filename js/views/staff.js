// スタッフ（一覧・詳細・登録・編集。R-09）
import { h, pageHead, panel, empty, field, input, select, textarea, fieldset, button, openDialog, toast, statusBadge, assignBadge, clear } from '../ui.js';
import { getState, update, findStaff, nextId } from '../store.js';
import * as L from '../logic.js';
import { today, staffTabs } from './parts.js';

const filters = { status: '', day: '' };

export function render({ params }) {
  return params[0] ? renderDetail(params[0]) : renderList();
}

function staffStatusBadge(status) {
  return h('span', { class: 'badge ' + (status === '稼働可' ? 'tone-plan' : 'tone-closed') }, status);
}

function upcomingCount(s, staffId, now) {
  return L.casesOfStaff(s.cases, staffId).filter((c) => c.date >= now && L.isOpenCase(c)).length;
}

function renderList() {
  const results = h('div');
  const countEl = h('p', { class: 'result-count', role: 'status' });
  const redraw = () => renderResults(results, countEl);
  const box = h('div', null,
    staffTabs('list'),
    pageHead({
      title: 'スタッフ',
      lead: '対応できる曜日・時間は、案件詳細の「スタッフ候補を探す」で使います。',
      actions: [button('スタッフを登録', { kind: 'primary', iconName: 'plus', onClick: () => openStaffDialog() })],
    }),
    panel({
      id: 'staff',
      body: [
        h('div', { class: 'filters' },
          field('ステータス', select('status', [['', 'すべて'], ...L.STAFF_STATUSES], filters.status, { onchange: (e) => { filters.status = e.target.value; redraw(); } })),
          field('対応できる曜日', select('day', [['', 'すべての曜日'], ...L.WEEKDAYS.map((d) => [d, d + '曜日'])], filters.day, { onchange: (e) => { filters.day = e.target.value; redraw(); } })),
          countEl),
        results,
      ],
    }));
  redraw();
  return box;
}

function renderResults(container, countEl) {
  const s = getState();
  const now = today();
  const list = s.staff.filter((x) => (!filters.status || x.status === filters.status) && (!filters.day || x.days.includes(filters.day)));
  countEl.textContent = `${list.length}名 / 全${s.staff.length}名`;
  clear(container);
  if (!list.length) {
    container.append(empty('条件に合うスタッフはいません', '絞り込みを「すべて」に戻してください。'));
    return;
  }
  container.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack' },
    h('caption', { class: 'visually-hidden' }, 'スタッフの一覧'),
    h('thead', null, h('tr', null, ['名前', '対応できる曜日', '時間', '対応経験', 'ステータス', 'これからの担当', '備考'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', null, list.map((x) => h('tr', null,
      h('td', { class: 'cell-title' }, h('a', { class: 'row-link', href: '#/staff/' + x.id }, x.name), h('span', { class: 'cell-sub' }, x.qualification || '資格は未入力')),
      h('td', { 'data-label': '対応できる曜日' }, L.formatDays(x.days)),
      h('td', { 'data-label': '時間', class: 'nowrap num' }, L.formatTimeRange(x.from, x.to)),
      h('td', { 'data-label': '対応経験' }, x.years == null ? '' : `経験${x.years}年`, h('span', { class: 'cell-sub' }, x.experience || '')),
      h('td', { 'data-label': 'ステータス' }, staffStatusBadge(x.status)),
      h('td', { 'data-label': 'これからの担当', class: 'num' }, `${upcomingCount(s, x.id, now)}件`),
      h('td', { 'data-label': '備考' }, x.notes || h('span', { class: 'cell-muted' }, 'なし'))))))));
}

function renderDetail(id) {
  const x = findStaff(id);
  if (!x) {
    return h('div', null,
      pageHead({ title: 'スタッフが見つかりません', crumb: { href: '#/staff', label: 'スタッフの一覧へ' } }),
      empty('このスタッフは登録されていません', '一覧から選び直してください。'));
  }
  const s = getState();
  const now = today();
  const assigned = L.casesOfStaff(s.cases, x.id);
  const dl = (rows) => h('dl', { class: 'props' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));

  return h('div', null,
    pageHead({
      title: x.name,
      lead: `${x.qualification || '資格は未入力'}・${x.years == null ? '経験年数は未入力' : `経験${x.years}年`}`,
      crumb: { href: '#/staff', label: 'スタッフの一覧へ' },
      actions: [button('編集する', { iconName: 'edit', onClick: () => openStaffDialog(x) })],
    }),
    h('div', { class: 'grid-main-side' },
      panel({
        id: 'staff-cases', title: '担当する案件', count: `${assigned.length}件`,
        body: assigned.length
          ? h('ul', { class: 'rows' }, assigned.map((c) => {
            const a = c.assignments.find((y) => y.staffId === x.id);
            return h('li', null,
              h('div', { class: 'row-main' },
                h('p', { class: 'row-title' }, h('a', { href: '#/cases/' + c.id }, c.name)),
                h('p', { class: 'row-meta' }, h('span', null, `${L.formatDate(c.date)} ${L.formatTimeRange(c.start, c.end)}`), h('span', null, c.date < now ? '終了' : ''))),
              h('div', { class: 'row-side' }, assignBadge(a.state), statusBadge(c.status)));
          }))
          : h('div', { class: 'empty' }, h('strong', null, 'まだ担当する案件はありません'), h('span', null, '案件詳細の「スタッフ候補を探す」から割り当てられます。')),
      }),
      panel({
        id: 'staff-info', title: '登録内容',
        body: h('div', { class: 'panel-body' }, dl([
          ['ステータス', staffStatusBadge(x.status)],
          ['対応できる曜日', L.formatDays(x.days)],
          ['対応できる時間', L.formatTimeRange(x.from, x.to)],
          ['資格', x.qualification || '未入力'],
          ['経験年数', x.years == null ? '未入力' : `${x.years}年`],
          ['対応経験', x.experience || '未入力'],
          ['備考', x.notes || 'なし'],
        ])),
      })));
}

// 登録・編集
export function openStaffDialog(x) {
  const isNew = !x;
  const v0 = x || { name: '', days: [], from: '09:00', to: '17:00', qualification: '', years: null, experience: '', status: '稼働可', notes: '' };
  const dayPicks = h('div', { class: 'day-picks' }, L.WEEKDAYS.map((d) =>
    h('label', { class: 'day-pick' }, h('input', { type: 'checkbox', name: 'days', value: d, checked: v0.days.includes(d) }), h('span', null, d))));
  openDialog({
    title: isNew ? 'スタッフを登録' : `${x.name}さんを編集`,
    submitLabel: isNew ? '登録する' : '保存する',
    wide: true,
    body: h('div', { class: 'form-grid' },
      field('名前', input('name', v0.name, { maxlength: 30, placeholder: '例: 山田 花子' }), { required: true }),
      field('ステータス', select('status', L.STAFF_STATUSES, v0.status), { hint: '休止中の人は、スタッフ候補に出ません' }),
      fieldset('対応できる曜日', dayPicks, { name: 'days', cls: 'span-2' }),
      field('対応できる時間（から）', input('from', v0.from, { type: 'time' }), { required: true }),
      field('対応できる時間（まで）', input('to', v0.to, { type: 'time' }), { required: true }),
      field('資格', input('qualification', v0.qualification, { maxlength: L.LIMITS.text, placeholder: '例: 保育士' })),
      field('経験年数', input('years', v0.years ?? '', { inputmode: 'numeric', placeholder: '例: 3' }), { hint: '分からなければ空のまま（未入力）' }),
      field('対応経験', textarea('experience', v0.experience, { maxlength: 200, rows: 2, placeholder: '例: 乳児対応・イベント託児のリーダー' }), { cls: 'span-2' }),
      field('備考', textarea('notes', v0.notes, { maxlength: 300, rows: 2 }), { cls: 'span-2' })),
    onSubmit: (form) => {
      const el = form.elements;
      const v = {
        name: el.name.value.trim(),
        status: el.status.value,
        days: [...form.querySelectorAll('input[name=days]:checked')].map((i) => i.value),
        from: el.from.value,
        to: el.to.value,
        qualification: el.qualification.value.trim(),
        years: L.parseCount(el.years.value),
        experience: el.experience.value.trim(),
        notes: el.notes.value.trim(),
      };
      const errors = L.validateStaff(v);
      if (Object.keys(errors).length) return errors;
      update((st) => {
        if (isNew) st.staff.push({ id: nextId('s'), ...v });
        else Object.assign(st.staff.find((y) => y.id === x.id), v);
      });
      toast(isNew ? `${v.name}さんを登録しました` : `${v.name}さんの内容を保存しました`);
      return null;
    },
  });
}
