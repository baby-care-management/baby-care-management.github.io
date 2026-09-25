// 申込フォーム（Googleフォーム）の回答の取り込み（R-17）
// システムが案件と突き合わせ、人が確かめて「案件に反映」する。AI ではなく、決まった規則の突き合わせ
import { h, icon, roleTag, button, field, select, textarea, openDialog, toast, clear } from '../ui.js';
import { getState, update, nextId } from '../store.js';
import * as L from '../logic.js';
import { LIMITS, readApplications, matchCase, nearCase, compareApplication, patchFromApplication, caseFromApplication, applicationIssues } from '../forms.js';
import { sampleFormText } from '../seed.js';
import { today, addTemplateTasks } from './parts.js';
import { emptyCase } from './case-form.js';

const NEW = '__new__';
const FORM_TASK = '申込フォームの回答を確認する';
const clip = (v, n = 300) => (typeof v === 'string' ? v.slice(0, n) : v);

const keyOf = (v) => [v.timestamp, v.company, v.date].join('|');
const alreadyImported = (st, v) => st.applications.some((a) => keyOf({ timestamp: a.values.receivedAt, company: a.values.company, date: a.values.date }) === keyOf(v));

// ---------- 取り込みの画面（ダイアログ） ----------
export function openImportDialog({ caseId = '' } = {}) {
  const text = textarea('formText', '', { rows: 6, placeholder: 'Googleフォームの回答（スプレッドシート）で、見出しの行から回答の行までをコピーして、ここに貼り付けてください' });
  const results = h('div', { class: 'imp-results' });
  const items = [];   // { v, select, table, boxes, check, done }
  let dlg;

  const load = () => {
    clear(results); items.length = 0;
    const r = readApplications(text.value, today());
    if (!r.ok) { results.append(h('p', { class: 'notice is-danger', role: 'alert' }, icon('alert'), h('span', null, r.error))); setSubmit(); return; }
    results.append(h('p', { class: 'hint' }, `${r.items.length}件の回答を読み込みました。1件ずつ、案件と突き合わせた結果を確かめてください。`
      + (r.unmapped.length ? `（読み取らなかった項目: ${r.unmapped.join('・')}）` : '')));
    r.items.forEach((v, i) => results.append(itemCard(v, i)));
    setSubmit();
  };

  function targetOptions(v) {
    const open = getState().cases.filter((c) => c.status !== '完了');
    return [[NEW, '新しい案件として登録する'], ...L.sortCases(open).map((c) => [c.id, `${L.formatDateShort(c.date)} ${c.name}（${c.status}）`])];
  }

  function itemCard(v, i) {
    const st = getState();
    const issues = applicationIssues(v);
    const dup = alreadyImported(st, v);
    const best = matchCase(st.cases, v);
    const near = best ? null : nearCase(st.cases, v);
    const item = { v, done: false, boxes: new Map(), issues, dup };
    // 初期値: 見つかった案件／案件詳細から開いたときはその案件／それ以外は「新しい案件」
    const initial = best ? best.caseId : (caseId && st.cases.some((c) => c.id === caseId) ? caseId : NEW);
    const sel = select(`target${i}`, targetOptions(v), initial, { id: `imp-target-${i}`, onchange: () => draw() });
    const table = h('div', { class: 'imp-table' });
    const check = h('input', { type: 'checkbox', id: `imp-ok-${i}`, disabled: !!issues.length || dup, onchange: (e) => { item.done = e.target.checked; setSubmit(); } });
    item.select = sel; item.check = check;

    function draw() {
      clear(table); item.boxes.clear();
      const target = sel.value;
      if (target === NEW) {
        table.append(h('p', { class: 'hint' }, `回答の内容で、新しい案件（ステータス「申込確認」）を作ります。案件名: 「${caseFromApplication(v).name}」`));
        return;
      }
      const c = st.cases.find((x) => x.id === target);
      const rows = compareApplication(c, v);
      table.append(h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack imp-compare' },
        h('caption', { class: 'visually-hidden' }, '案件の登録内容と、フォームの回答の比べ'),
        h('thead', null, h('tr', null, ['項目', '案件の登録', 'フォームの回答', '結果', '案件に反映'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows.map((r) => {
          const can = r.status === '相違' || r.status === '案件にない';
          const box = h('input', { type: 'checkbox', id: `imp-${i}-${r.key}`, checked: r.status === '案件にない', disabled: !can, 'aria-label': `${r.label}を案件に反映する` });
          item.boxes.set(r.key, box);
          return h('tr', { class: r.status === '相違' ? 'is-diff' : '' },
            h('td', { class: 'k cell-title' }, r.label),
            h('td', { 'data-label': '案件の登録' }, r.caseValue || h('span', { class: 'cell-muted' }, '未入力')),
            h('td', { 'data-label': 'フォームの回答' }, r.formValue || h('span', { class: 'cell-muted' }, '未入力')),
            h('td', { 'data-label': '結果' }, h('span', { class: 'badge ' + ({ 一致: 'tone-plan', 相違: 'tone-danger', 案件にない: 'tone-intake', 未入力: 'tone-closed' }[r.status]) }, r.status === '相違' ? icon('alert') : null, r.status)),
            h('td', { 'data-label': '反映', class: 'cell-check' }, can ? h('label', null, box) : h('span', { class: 'cell-muted' }, '—')));
        })))));
      const diff = rows.filter((r) => r.status === '相違').length;
      table.append(h('p', { class: 'hint' }, diff ? `${diff}か所、案件の登録とちがいます。どちらが正しいかは、お客さまに確かめて決めてください（「相違」は、初めは反映しない設定です）。` : 'ちがう所はありません。'));
    }
    draw();

    const head = h('div', { class: 'imp-head' },
      h('p', { class: 'row-title' }, `${i + 1}. ${v.company || '（顧客名なし）'}`,
        h('span', { class: 'row-note' }, `${v.eventName || 'イベント名なし'}・${v.date ? L.formatDate(v.date) : '開催日なし'}${v.timestamp ? `・回答 ${v.timestamp}` : ''}`)),
      best ? h('span', { class: 'badge tone-plan' }, icon('check'), '案件が見つかりました')
        : near ? h('span', { class: 'badge tone-intake' }, icon('alert'), '近い案件があります')
          : h('span', { class: 'badge tone-intake' }, '一致する案件がありません'));
    items.push(item);
    return h('section', { class: 'imp-card' + (dup ? ' is-done' : ''), 'aria-label': `回答${i + 1}` },
      head,
      dup ? h('p', { class: 'notice' }, icon('check'), h('span', null, 'この回答は、取り込み済みです（もう一度は取り込みません）。')) : null,
      issues.length ? h('p', { class: 'notice is-danger', role: 'alert' }, icon('alert'), h('span', null, issues.join('。') + '。フォームの回答を見直してください。')) : null,
      near ? h('p', { class: 'notice' }, icon('alert'), h('span', null, `近い案件があります: 「${st.cases.find((c) => c.id === near.caseId)?.name}」（${near.why}）。開催日と顧客名の両方は合っていません。${initial === NEW ? '初めは「新しい案件」にしています。' : `初めは、いま開いている案件「${st.cases.find((c) => c.id === initial)?.name}」にしています。`}同じお客さまの案件かを確かめて、下の「取り込む案件」から選んでください。`)) : null,
      field('取り込む案件', sel),
      table,
      h('label', { class: 'check-line human-check', for: `imp-ok-${i}` }, check, roleTag('human'), h('span', null, '内容を確かめました（この回答を確認済みにする）')));
  }

  const setSubmit = () => {
    const btn = dlg?.querySelector('[type=submit]');
    if (!btn) return;
    const n = items.filter((x) => x.done).length;
    btn.disabled = n === 0;
    btn.textContent = n ? `${n}件を確認済みにする` : '確認済みにする';
  };

  const body = h('div', null,
    h('ol', { class: 'how-steps' },
      h('li', null, roleTag('human'), '回答の表を貼り付ける'),
      h('li', null, roleTag('system'), '案件と自動で突き合わせる'),
      h('li', null, roleTag('human'), '確かめて、案件に反映する'),
      h('li', null, roleTag('system'), 'タスクを完了にして記録する')),
    field('Googleフォームの回答', text, { hint: `見出しの行を含めます。${LIMITS.rows}件・${LIMITS.chars / 1024}KBまで。実際のお客さまの情報は入れず、このデモでは架空の回答だけを使ってください` }),
    h('div', { class: 'page-actions' },
      button('サンプルの回答を入れる', { size: 'sm', kind: 'ghost', onClick: () => { text.value = sampleFormText(getState(), today()); load(); } }),
      button('読み込む', { kind: 'primary', size: 'sm', iconName: 'search', onClick: load })),
    results);

  dlg = openDialog({
    title: 'Googleフォームの回答を取り込む',
    submitLabel: '確認済みにする',
    wide: true,
    body,
    onSubmit: (form) => {
      const chosen = items.filter((x) => x.done);
      if (!chosen.length) return { apps: '確かめた回答がありません。「内容を確かめました」に印をつけてください' };
      let made = 0, updated = 0, tasksDone = 0, tasksMade = 0, lastId = '';
      update((s) => {
        for (const it of chosen) {
          const v = it.v;
          const target = it.select.value;
          const values = { receivedAt: clip(v.timestamp, 40), company: clip(v.company), contact: clip(v.contact), phone: clip(v.phone, 40), email: clip(v.email), eventName: clip(v.eventName), date: v.date, start: v.start, end: v.end, venue: clip(v.venue), children: v.children, ages: clip(v.ages), care: clip(v.care, 500), note: clip(v.note, 500) };
          let cid = target, applied = [];
          if (target === NEW) {
            cid = nextId('c');
            const base = caseFromApplication(v);
            const c = { ...emptyCase(), ...base, id: cid, status: '申込確認', ownerId: s.members[0].id, inquiry: '', billing: { state: '未着手', handedOverAt: '' } };
            c.name = clip(c.name, L.LIMITS.name); c.venue = clip(c.venue, L.LIMITS.text);
            s.cases.push(c);
            tasksMade += addTemplateTasks(s, c);
            made++;
          } else {
            const c = s.cases.find((x) => x.id === target);
            applied = [...it.boxes.entries()].filter(([, b]) => b.checked && !b.disabled).map(([k]) => k);
            Object.assign(c, patchFromApplication(c, v, applied));
            updated++;
          }
          s.applications.push({ id: nextId('ap'), caseId: cid, status: '確認済み', confirmedAt: today(), values, appliedKeys: applied });
          for (const t of s.tasks) if (t.caseId === cid && t.title === FORM_TASK && L.isOpenTask(t)) { t.status = '完了'; tasksDone++; }
          lastId = cid;
        }
      });
      toast(`${chosen.length}件の回答を確認済みにしました${made ? `（新しい案件 ${made}件）` : ''}${updated ? `（案件を更新 ${updated}件）` : ''}${tasksDone ? `。「${FORM_TASK}」を完了にしました` : ''}`);
      if (chosen.length === 1 && lastId) location.hash = '#/cases/' + lastId;
      return null;
    },
  });
  setSubmit();
  return dlg;
}

// ---------- 案件詳細の「申込フォーム」欄 ----------
export function applicationsPanelBody(c) {
  const list = getState().applications.filter((a) => a.caseId === c.id);
  if (!list.length) {
    return h('div', { class: 'empty' }, h('strong', null, 'まだ回答を取り込んでいません'),
      h('span', null, 'Googleフォームの回答を貼り付けると、この案件と突き合わせて確認できます。'),
      h('p', { class: 'empty-action' }, button('回答を取り込む', { kind: 'primary', iconName: 'plus', onClick: () => openImportDialog({ caseId: c.id }) })));
  }
  return h('ul', { class: 'rows' }, list.map((a) => h('li', null,
    h('div', { class: 'row-main' },
      h('p', { class: 'row-title' }, `回答 ${a.values.receivedAt || '（日時なし）'}`, h('span', { class: 'badge tone-plan ml-2' }, icon('check'), a.status)),
      h('p', { class: 'row-meta' }, h('span', null, `確認日 ${L.formatDate(a.confirmedAt)}`),
        a.appliedKeys.length ? h('span', null, `案件に反映した項目: ${a.appliedKeys.length}か所`) : h('span', null, '案件への反映はなし'))),
    h('div', { class: 'row-side' }, button('回答を見る', { size: 'sm', onClick: () => openApplicationView(a, c) })))));
}

function openApplicationView(a, c) {
  const rows = compareApplication(c, a.values);
  openDialog({
    title: `申込フォームの回答（${a.values.receivedAt || '日時なし'}）`,
    lead: '取り込んだ回答と、いまの案件の登録内容を比べています。',
    submitLabel: '閉じる',
    wide: true,
    body: h('div', null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'data-table stack imp-compare' },
        h('thead', null, h('tr', null, ['項目', '案件の登録（いま）', 'フォームの回答', '結果'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, rows.map((r) => h('tr', null,
          h('td', { class: 'k cell-title' }, r.label),
          h('td', { 'data-label': '案件の登録' }, r.caseValue || h('span', { class: 'cell-muted' }, '未入力')),
          h('td', { 'data-label': 'フォームの回答' }, r.formValue || h('span', { class: 'cell-muted' }, '未入力')),
          h('td', { 'data-label': '結果' }, r.status)))))),
      a.values.care ? h('p', null, h('b', null, '配慮が必要なこと: '), a.values.care) : null,
      a.values.note ? h('p', null, h('b', null, 'ご質問・ご要望: '), a.values.note) : null),
    onSubmit: () => null,
  });
}

// ---------- Googleフォームの設定（案内に入れる URL） ----------
export function openFormSettings() {
  const st = getState();
  const input = h('input', { type: 'text', name: 'formUrl', autocomplete: 'off', inputmode: 'url', maxlength: 200, placeholder: 'https://forms.gle/…' });
  input.value = st.settings.formUrl || '';
  openDialog({
    title: 'Googleフォームの設定',
    lead: '返信文・見積のご案内文・申込書の下書きに入れる、フォームの URL です。外へは送らず、文の中に入れるだけです。',
    submitLabel: '保存する',
    body: h('div', null, field('フォームの URL', input, { hint: 'https:// で始まる URL だけ入れられます。空にすると、下書きには〔GoogleフォームのURL〕と出ます' })),
    onSubmit: (form) => {
      const v = form.elements.formUrl.value.trim();
      if (v && !/^https:\/\/[^\s<>"']+$/i.test(v)) return { formUrl: 'https:// で始まる URL を入れてください（空にする場合は、空のままにします）' };
      update((s) => { s.settings.formUrl = v; });
      toast(v ? 'フォームの URL を保存しました' : 'フォームの URL を空にしました');
      return null;
    },
  });
}

