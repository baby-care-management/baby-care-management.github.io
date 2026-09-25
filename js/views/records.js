// 実績（R-15）
import { h, pageHead, panel, empty, button, field, input, select, textarea, openDialog, toast, statusBadge } from '../ui.js';
import { getState, update, findCase, recordOf, nextId } from '../store.js';
import * as L from '../logic.js';
import { today, addTemplateTasks } from './parts.js';
import { billingPanelBody } from './billing.js';

export function render() {
  const s = getState();
  const now = today();
  const waiting = waitingCases(s, now);
  const list = [...s.records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const totalKids = list.reduce((n, r) => n + (r.children || 0), 0);

  return h('div', null,
    pageHead({
      title: '実績',
      lead: '実施した託児の人数・時間・申し送りを残します。申し送りは、同じお客さまの次の案件の引き継ぎメモにも入ります。',
      actions: [button('実績を登録', { kind: 'primary', iconName: 'plus', onClick: () => openRecordDialog() })],
    }),
    h('div', { class: 'v-stack' },
      waiting.length ? panel({
        id: 'rec-waiting', title: '実績の登録待ち', count: `${waiting.length}件`,
        body: h('ul', { class: 'rows' }, waiting.map((c) => h('li', null,
          h('div', { class: 'row-main' },
            h('p', { class: 'row-title' }, h('a', { href: '#/cases/' + c.id }, c.name)),
            h('p', { class: 'row-meta' }, h('span', null, `${L.formatDate(c.date)} ${L.formatTimeRange(c.start, c.end)}`), statusBadge(c.status))),
          h('div', { class: 'row-side' }, button('実績を登録', { size: 'sm', ariaLabel: `「${c.name}」の実績を登録`, onClick: () => openRecordDialog({ caseId: c.id }) }))))),
      }) : null,
      panel({
        id: 'billing', title: '請求準備（経理への引き継ぎ）', count: '交通費・人数・実績をまとめる',
        body: billingPanelBody(),
      }),
      panel({
        id: 'records', title: '登録した実績', count: `${list.length}件・お預かりした子ども 合計${totalKids}名`,
        body: list.length ? recordTable(list) : empty('まだ実績はありません', '託児を実施したら「実績を登録」で人数・時間・申し送りを残します。'),
      })));
}

// 開催日を過ぎた（または実施済みの）案件で、実績がまだないもの
export function waitingCases(s, now) {
  return L.sortCases(s.cases.filter((c) => !recordOf(c.id) && (c.status === '実施済み' || (c.date && c.date <= now && L.statusIndex(c.status) >= L.statusIndex('最終確認')))));
}

function diffCell(planned, actual) {
  const d = L.diffLabel(planned, actual);
  return h('span', null, `${actual}名`, h('span', { class: 'cell-sub' }, planned == null ? '予定は未入力' : `予定 ${planned}名・${d}`));
}

function recordTable(list) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack' },
    h('caption', { class: 'visually-hidden' }, '登録した実績の一覧'),
    h('thead', null, h('tr', null, ['実施日', '案件', '子ども（実際）', 'スタッフ（実際）', '実施時間', '申し送り事項'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', null, list.map((r) => {
      const c = findCase(r.caseId);
      return h('tr', null,
        h('td', { 'data-label': '実施日', class: 'nowrap' }, L.formatDate(r.date)),
        h('td', { class: 'cell-title' }, c ? h('a', { class: 'row-link', href: '#/cases/' + c.id }, c.name) : '（消えた案件）'),
        h('td', { 'data-label': '子ども', class: 'nowrap' }, diffCell(c?.children ?? null, r.children)),
        h('td', { 'data-label': 'スタッフ', class: 'nowrap' }, diffCell(c?.requiredStaff ?? null, r.staff)),
        h('td', { 'data-label': '実施時間', class: 'nowrap num' }, L.formatTimeRange(r.start, r.end), h('span', { class: 'cell-sub' }, L.formatDuration(r.start, r.end) || '')),
        h('td', { 'data-label': '申し送り', class: 'cell-notes' }, r.notes || h('span', { class: 'cell-muted' }, 'なし')));
    }))));
}

export const RECORD_TASK = '実績を登録する';

// 実績の登録・編集。案件詳細からは caseId を決めて開く
export function openRecordDialog({ caseId = '' } = {}) {
  const s = getState();
  const now = today();
  const existing = caseId ? recordOf(caseId) : null;
  const choices = caseId ? [findCase(caseId)] : waitingCases(s, now);
  if (!choices.length || !choices[0]) {
    toast('実績を登録できる案件がありません（開催日を過ぎた案件か、「実施済み」の案件が対象です）');
    return;
  }
  const first = choices[0];
  const r0 = existing || {
    caseId: first.id, date: first.date && first.date <= now ? first.date : now, children: null,
    staff: L.staffCounts(first).confirmed || null, start: first.start, end: first.end, notes: '',
  };
  const n = (x) => (x == null ? '' : String(x));
  const planned = h('p', { class: 'hint', id: 'rec-planned' });
  const caseSel = select('caseId', choices.map((c) => [c.id, `${L.formatDateShort(c.date)} ${c.name}`]), r0.caseId, { disabled: !!caseId || !!existing });
  const showPlanned = () => {
    const c = findCase(caseSel.value);
    planned.textContent = c ? `予定: 子ども ${L.countOrUnset(c.children)}・必要スタッフ ${L.countOrUnset(c.requiredStaff)}・${L.formatTimeRange(c.start, c.end)}` : '';
  };
  caseSel.addEventListener('change', () => {
    const c = findCase(caseSel.value);
    const f = caseSel.form;
    if (c && f) {
      f.elements.date.value = c.date && c.date <= now ? c.date : now;
      f.elements.start.value = c.start; f.elements.end.value = c.end;
      f.elements.staff.value = n(L.staffCounts(c).confirmed || null);
    }
    showPlanned();
  });
  showPlanned();
  const toDone = h('input', { type: 'checkbox', name: 'toDone', id: 'rec-done' });

  openDialog({
    title: existing ? '実績を編集' : '実績を登録',
    submitLabel: existing ? '保存する' : '登録する',
    wide: true,
    body: h('div', { class: 'form-grid' },
      field('案件', caseSel, { cls: 'span-2' }),
      h('div', { class: 'span-2' }, planned),
      field('実施日', input('date', r0.date, { type: 'date', max: now }), { required: true }),
      h('div', { class: 'time-pair' },
        field('開始', input('start', r0.start, { type: 'time' }), { required: true }),
        field('終了', input('end', r0.end, { type: 'time' }), { required: true })),
      field('実際の子ども人数', input('children', n(r0.children), { inputmode: 'numeric', placeholder: '例: 10' }), { required: true, hint: '0人のときは 0' }),
      field('実際のスタッフ人数', input('staff', n(r0.staff), { inputmode: 'numeric' }), { required: true }),
      field('申し送り事項', textarea('notes', r0.notes, { maxlength: L.LIMITS.long, rows: 4, placeholder: '次に同じお客さまの託児をする人へ（よかったこと・困ったこと・次に気をつけること）' }), { cls: 'span-2' }),
      existing ? null : h('label', { class: 'check-line span-2', for: 'rec-done' }, toDone, h('span', null, 'あわせて案件を「完了」にする'))),
    onSubmit: (form) => {
      const el = form.elements;
      const v = {
        caseId: caseSel.value, date: el.date.value, children: L.parseCount(el.children.value), staff: L.parseCount(el.staff.value),
        start: el.start.value, end: el.end.value, notes: el.notes.value.trim(),
      };
      const errors = L.validateRecord(v, now);
      if (Object.keys(errors).length) return errors;
      const done = !existing && toDone.checked;
      let moved = null;
      let closedTask = false;
      update((st) => {
        if (existing) Object.assign(st.records.find((x) => x.id === existing.id), v);
        else st.records.push({ id: nextId('r'), ...v });
        const c = st.cases.find((x) => x.id === v.caseId);
        // 実績がある＝実施した。まだ「実施済み」より前なら進める（完了は人が選んだときだけ）
        if (done) { c.status = '完了'; moved = '完了'; }
        else if (L.statusIndex(c.status) < L.statusIndex('実施済み')) { c.status = '実施済み'; moved = '実施済み'; if (!existing) addTemplateTasks(st, c, { skip: ['record'] }); }
        // 「実績を登録する」のタスクは、登録できたので完了にする（システムのタスク管理）
        for (const t of st.tasks) if (!existing && t.caseId === v.caseId && L.isOpenTask(t) && t.title === RECORD_TASK) { t.status = '完了'; closedTask = true; }
      });
      const also = [moved ? `案件を「${moved}」に` : null, closedTask ? '「実績を登録する」のタスクを完了に' : null].filter(Boolean);
      toast(existing ? '実績を保存しました' : `実績を登録しました${also.length ? `。${also.join('、')}しました` : ''}`);
      return null;
    },
  });
}

