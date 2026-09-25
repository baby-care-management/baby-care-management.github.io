// 案件一覧（R-04）
import { h, pageHead, panel, empty, icon, statusBadge, field, input, select, clear, button } from '../ui.js';
import { getState, memberName } from '../store.js';
import * as L from '../logic.js';
import { today, nextTaskCell } from './parts.js';
import { openCaseDialog } from './case-form.js';
import { openImportDialog, openFormSettings } from './applications.js';

// 検索の文字は URL に入れず、ここに持つ（S-12）
const filters = { q: '', status: '', period: '', stage: '' };

function syncUrl() {
  const p = new URLSearchParams();
  for (const k of ['status', 'period', 'stage']) if (filters[k]) p.set(k, filters[k]);
  const qs = p.toString();
  history.replaceState(null, '', '#/cases' + (qs ? '?' + qs : ''));
}

export function render({ query, isNew, refresh }) {
  if (isNew) filters.q = '';
  filters.status = query.get('status') || '';
  filters.period = query.get('period') || '';
  filters.stage = query.get('stage') || '';

  const results = h('div', { id: 'case-results' });
  const countEl = h('p', { class: 'result-count', role: 'status' });

  const update = () => { renderResults(results, countEl); };

  const q = input('q', filters.q, { type: 'search', id: 'case-q', placeholder: '案件名・会場・顧客名', maxlength: 60, oninput: (e) => { filters.q = e.target.value; update(); } });
  const statusSel = select('status', [['', 'すべてのステータス'], ['active', '対応中（完了以外）'], ...L.STATUSES], filters.status,
    { id: 'case-status', onchange: (e) => { filters.status = e.target.value; syncUrl(); update(); } });
  const periodSel = select('period', L.PERIODS.map((p) => [p.key, p.label]), filters.period,
    { id: 'case-period', onchange: (e) => { filters.period = e.target.value; syncUrl(); update(); } });

  const stage = L.STAGES.find((s) => s.key === filters.stage);
  const stageChip = stage ? h('div', { class: 'field' },
    h('span', { class: 'chip-label' }, '業務の段階'),
    button(`${stage.label}（${stage.statuses.join('・')}）`, { size: 'sm', iconName: 'close', ariaLabel: `段階「${stage.label}」の絞り込みを外す`,
      onClick: () => { filters.stage = ''; syncUrl(); refresh(); } })) : null;

  const box = h('div', null,
    pageHead({
      title: '案件',
      lead: '問い合わせから完了まで、すべての案件を1つの一覧で管理します。',
      actions: newCaseAction(),
    }),
    panel({
      id: 'cases',
      body: [
        h('div', { class: 'filters', role: 'search' },
          field('検索', h('div', { class: 'search-box' }, icon('search'), q), { cls: 'grow', forId: 'case-q' }),
          field('ステータス', statusSel),
          field('開催日', periodSel),
          stageChip,
          countEl),
        results,
      ],
    }));
  update();
  return box;
}

function newCaseAction() {
  return [
    button('案件を登録', { kind: 'primary', iconName: 'plus', onClick: () => openCaseDialog() }),
    button('申込フォームの回答を取り込む', { iconName: 'plus', onClick: () => openImportDialog() }),
    button('Googleフォームの設定', { iconName: 'edit', onClick: () => openFormSettings() })];
}

function renderResults(container, countEl) {
  const s = getState();
  const now = today();
  const list = L.sortCases(L.filterCases(s.cases, filters, now));
  countEl.textContent = `${list.length}件 / 全${s.cases.length}件`;
  clear(container);
  if (!list.length) {
    container.append(empty('条件に合う案件はありません', '検索の文字を短くするか、ステータス・開催日の絞り込みを「すべて」に戻してください。'));
    return;
  }
  const th = (label, cls) => h('th', { scope: 'col', class: cls }, label);
  container.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack table-min' },
    h('caption', { class: 'visually-hidden' }, '案件の一覧'),
    h('thead', null, h('tr', null,
      th('案件名'), th('開催日'), th('開催時間'), th('会場'), th('子ども', 'num'), th('必要', 'num'), th('確定', 'num'),
      th('ステータス'), th('担当者'), th('次のタスク'))),
    h('tbody', null, list.map((c) => {
      const { confirmed } = L.staffCounts(c);
      const short = L.staffShortage(c);
      return h('tr', null,
        h('td', { class: 'cell-title' }, h('a', { class: 'row-link', href: '#/cases/' + c.id }, c.name), h('span', { class: 'cell-sub' }, c.type)),
        h('td', { 'data-label': '開催日', class: 'nowrap' }, L.formatDate(c.date), c.date === now ? h('span', { class: 'cell-sub' }, '今日') : null),
        h('td', { 'data-label': '開催時間', class: 'nowrap num' }, L.formatTimeRange(c.start, c.end)),
        h('td', { 'data-label': '会場' }, c.venue || h('span', { class: 'cell-muted' }, '未入力')),
        h('td', { 'data-label': '子ども人数', class: 'num' }, L.countOrUnset(c.children)),
        h('td', { 'data-label': '必要スタッフ', class: 'num' }, L.countOrUnset(c.requiredStaff)),
        h('td', { 'data-label': 'スタッフ確定', class: 'num' }, `${confirmed}名`,
          short > 0 && L.isOpenCase(c) ? h('span', { class: 'cell-sub warn' }, icon('alert'), `不足${short}`) : null),
        h('td', { 'data-label': 'ステータス' }, statusBadge(c.status)),
        h('td', { 'data-label': '担当者', class: 'nowrap' }, memberName(c.ownerId)),
        h('td', { 'data-label': '次のタスク' }, nextTaskCell(c.id)));
    })))));
}

