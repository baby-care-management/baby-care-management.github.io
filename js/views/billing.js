// 請求準備（R-27）。請求額は計算しない。実績・交通費・人数をまとめて、経理へ引き継ぐ
import { h, icon, roleTag, button, field, select, openDialog, toast, empty } from '../ui.js';
import { getState, update, findCase } from '../store.js';
import * as L from '../logic.js';
import { BILLING_STATES, BILLING_HEADERS, billingRows, billingIssues, billingTargets, billingOf, fareTotal, formatYen, toCSV, toTSV, MAX_EXPORT_ROWS } from '../billing.js';
import { today, downloadText, copyText } from './parts.js';

const stateBadge = (state) => h('span', { class: 'badge ' + ({ 未着手: 'tone-intake', 準備できた: 'tone-plan', 経理へ引き継ぎ済み: 'tone-closed' }[state]) }, state === '経理へ引き継ぎ済み' ? icon('check') : null, state);

function allRows(st, cases) {
  return cases.flatMap((c) => billingRows(st, c));
}

function exportCSV(name, rows) {
  if (!rows.length) { toast('書き出す行がありません（確定したスタッフがいる案件が対象です）'); return; }
  if (rows.length > MAX_EXPORT_ROWS) { toast(`行が多すぎます（${rows.length}行。上限は ${MAX_EXPORT_ROWS}行）。案件を分けて書き出してください`); return; }
  downloadText(`${today().replace(/-/g, '')}_${name}.csv`, toCSV(BILLING_HEADERS, rows));
}

// 実績の画面に出す「請求準備」の欄
export function billingPanelBody() {
  const st = getState();
  const targets = L.sortCases(billingTargets(st)).reverse();
  if (!targets.length) return empty('請求の準備ができる案件はありません', '実施したあと（「実施済み」「完了」）の案件が、ここに並びます。');
  const pending = targets.filter((c) => billingOf(c).state !== '経理へ引き継ぎ済み');
  return h('div', null,
    h('div', { class: 'billing-tools' },
      h('p', { class: 'hint' }, '請求額は計算しません。実施日・時間・人数・スタッフ・交通費を、経理が使える形にまとめます。'),
      h('div', { class: 'page-actions' },
        button(`引き継ぎ前の${pending.length}件をCSVで書き出す`, { size: 'sm', iconName: 'copy', onClick: () => exportCSV('請求準備_引き継ぎ前', allRows(st, pending)) }),
        button('表をコピー', { size: 'sm', onClick: () => copyText(toTSV(BILLING_HEADERS, allRows(st, pending)), '引き継ぎ前の表をコピーしました。スプレッドシートに貼り付けられます') }))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack' },
      h('caption', { class: 'visually-hidden' }, '請求準備の一覧'),
      h('thead', null, h('tr', null, ['案件', '実施日', '交通費の合計', '状態', '足りないこと', ''].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, targets.map((c) => {
        const issues = billingIssues(st, c);
        const rec = st.records.find((r) => r.caseId === c.id);
        const b = billingOf(c);
        return h('tr', null,
          h('td', { class: 'cell-title' }, h('a', { class: 'row-link', href: '#/cases/' + c.id }, c.name), h('span', { class: 'cell-sub' }, c.customer?.company || '顧客名は未入力')),
          h('td', { 'data-label': '実施日', class: 'nowrap' }, L.formatDate(rec ? rec.date : c.date)),
          h('td', { 'data-label': '交通費の合計', class: 'nowrap num' }, formatYen(fareTotal(c))),
          h('td', { 'data-label': '状態' }, stateBadge(b.state), b.handedOverAt ? h('span', { class: 'cell-sub' }, `引き継ぎ ${L.formatDate(b.handedOverAt)}`) : null),
          h('td', { 'data-label': '足りないこと' }, issues.length ? h('span', { class: 'warn' }, icon('alert'), `${issues.length}件`) : h('span', { class: 'cell-muted' }, 'なし')),
          h('td', { class: 'nowrap' }, button('まとめを見る', { size: 'sm', ariaLabel: `「${c.name}」の請求情報のまとめを見る`, onClick: () => openBillingDialog(c.id) })));
      })))));
}

export function openBillingDialog(caseId) {
  const st = getState();
  const c = findCase(caseId);
  if (!c) return;
  const rows = billingRows(st, c);
  const issues = billingIssues(st, c);
  const b = billingOf(c);
  const stateSel = select('state', BILLING_STATES, b.state, { id: 'bill-state' });
  const ack = h('input', { type: 'checkbox', name: 'ack', id: 'bill-ack' });
  const total = fareTotal(c);
  openDialog({
    title: '請求に必要な情報のまとめ',
    lead: c.name,
    submitLabel: '状態を保存する',
    wide: true,
    body: h('div', null,
      issues.length
        ? h('div', { class: 'notice is-danger' }, icon('alert'), h('div', null, h('b', null, '足りないこと（経理へ引き継ぐ前に確かめてください）'), h('ul', { class: 'dots' }, issues.map((x) => h('li', null, x)))))
        : h('p', { class: 'notice' }, icon('check'), h('span', null, '必要な情報がそろっています。')),
      rows.length
        ? h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack' },
          h('caption', { class: 'visually-hidden' }, '確定したスタッフごとの請求情報'),
          h('thead', null, h('tr', null, ['スタッフ', '実施日', '実施時間', '子ども', '交通費', '状態', '経路のメモ'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, rows.map((r) => h('tr', null,
            h('td', { class: 'k cell-title' }, r[6]), h('td', { 'data-label': '実施日', class: 'nowrap' }, L.formatDate(r[1])),
            h('td', { 'data-label': '実施時間', class: 'nowrap num' }, r[4]), h('td', { 'data-label': '子ども', class: 'num' }, r[5] === '' ? '未入力' : `${r[5]}名`),
            h('td', { 'data-label': '交通費', class: 'nowrap num' }, r[7] === '' ? '未入力' : formatYen(r[7])),
            h('td', { 'data-label': '状態' }, r[8]), h('td', { 'data-label': '経路のメモ' }, r[9] || h('span', { class: 'cell-muted' }, 'なし')))))))
        : empty('確定したスタッフがいません', '案件の詳細で、スタッフを「確定」にしてください。'),
      h('p', { class: 'bill-total' }, '交通費の合計（単純な合計）: ', h('b', { class: 'num' }, formatYen(total))),
      h('p', { class: 'hint' }, '請求額の計算はしません。'),
      h('div', { class: 'page-actions' },
        button('CSVで書き出す', { size: 'sm', iconName: 'copy', onClick: () => exportCSV(`請求準備_${c.name}`, rows) }),
        button('表をコピー', { size: 'sm', onClick: () => copyText(toTSV(BILLING_HEADERS, rows), '表をコピーしました。スプレッドシートに貼り付けられます') })),
      h('div', { class: 'form-grid mt-4' },
        field('経理への引き継ぎの状態', stateSel),
        issues.length ? h('label', { class: 'check-line human-check', for: 'bill-ack' }, ack, roleTag('human'), h('span', null, '足りないことを承知のうえで、引き継ぎ済みにする')) : null)),
    onSubmit: () => {
      const state = stateSel.value;
      if (state === '経理へ引き継ぎ済み' && issues.length && !ack.checked) return { ack: '足りないことがあります。確かめたうえで引き継ぐときは、「承知のうえで」に印をつけてください' };
      update((s) => {
        const x = s.cases.find((y) => y.id === caseId);
        x.billing = { state, handedOverAt: state === '経理へ引き継ぎ済み' ? (x.billing?.handedOverAt || today()) : '' };
        if (state === '経理へ引き継ぎ済み') for (const t of s.tasks) if (t.caseId === caseId && t.title === '経理へ引き継ぐ' && L.isOpenTask(t)) t.status = '完了';
      });
      toast(`請求準備の状態を「${state}」にしました`);
      return null;
    },
  });
}

