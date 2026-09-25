// AI のモック（決まったきまりで文章から取り出し、ひな形で文を作る）。本物の AI API は使わない
// DOM を触らない（tests/ から直接呼べるように）
import { parseISO, weekdayJa, formatDateLong, formatDateShort, formatTimeRange, addDays, countOrUnset } from './logic.js';

const pad = (n) => String(n).padStart(2, '0');
const TODO = (what) => `〔${what}〕`;   // 人が書きかえる所の印

// ---------- 1. 問い合わせ整理 ----------
const DASH = '[〜~\\-－ー]|から';
const TIME = '(午前|午後)?\\s*(\\d{1,2})(?::(\\d{2})|時(?:(\\d{1,2})分|(半))?)';

function toHHMM(ampm, hh, mm, mm2, half) {
  let hr = Number(hh);
  if (ampm === '午後' && hr < 12) hr += 12;
  const min = mm != null ? Number(mm) : mm2 != null ? Number(mm2) : half ? 30 : 0;
  if (hr > 23 || min > 59) return '';
  return `${pad(hr)}:${pad(min)}`;
}

function findDate(t, today) {
  const y0 = Number(today.slice(0, 4));
  const pats = [
    { re: /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/, y: true },
    { re: /(\d{4})[/.](\d{1,2})[/.](\d{1,2})/, y: true },
    { re: /(\d{1,2})月\s*(\d{1,2})日/, y: false },
    { re: /(?<![\d:])(\d{1,2})\/(\d{1,2})(?![\d/])/, y: false },
  ];
  for (const p of pats) {
    const m = p.re.exec(t);
    if (!m) continue;
    let iso;
    if (p.y) iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    else {
      iso = `${y0}-${pad(m[1])}-${pad(m[2])}`;
      if (parseISO(iso) && iso < today) iso = `${y0 + 1}-${pad(m[1])}-${pad(m[2])}`;   // 年がなく過ぎた日なら来年
    }
    if (!parseISO(iso)) return { date: '', note: `日付「${m[0]}」はカレンダーにない日です` };
    const after = t.slice(m.index + m[0].length);
    const wd = /^\s*[(（]\s*([日月火水木金土])/.exec(after);
    const note = wd && wd[1] !== weekdayJa(iso) ? `曜日が日付と合いません（${formatDateShort(iso)}。文章では「${wd[1]}曜日」）` : null;
    return { date: iso, note, past: iso < today };
  }
  return { date: '', note: /来月|再来月|来週|今月|春|夏|秋|冬|頃|ごろ/.test(t) ? '開催日（はっきりした日付が書かれていません）' : null };
}

function findTimes(t) {
  const m = new RegExp(`${TIME}\\s*(?:${DASH})\\s*${TIME}`).exec(t);
  if (!m) return { start: '', end: '' };
  const start = toHHMM(m[1], m[2], m[3], m[4], m[5]);
  let end = toHHMM(m[6] || (m[1] === '午後' ? '午後' : null), m[7], m[8], m[9], m[10]);
  // 「13時〜3時」のように終わりが小さいときは午後とみなす
  if (start && end && end <= start && Number(m[7]) < 12) end = toHHMM('午後', m[7], m[8], m[9], m[10]);
  return { start, end };
}

const VENUE_WORDS = 'ホテル|ホール|センター|会館|展示場|会議室|公民館|スタジオ|モール|体育館|クリニック|ビル|集会所|式場|教室';

function findVenue(t) {
  const m = /(?:会場|場所)\s*(?:は|:)\s*([^\n。]+?)(?:です|でした|で行|にて|を予定|。|$)/m.exec(t);
  if (m) return m[1].trim();
  for (const clause of t.split(/[、。\n]/)) {
    const k = new RegExp(`(${VENUE_WORDS})`).exec(clause);
    if (!k) continue;
    const endAt = clause.slice(k.index).search(/で|にて|を|の間|に/);
    const s = (endAt >= 0 ? clause.slice(0, k.index + endAt) : clause).replace(/^.*?(?:日\s*[(（].[)）]\s*)?(?:に|は)\s*/, '').trim();
    if (s.length >= 2 && s.length <= 40) return s;
  }
  return '';
}

function findAges(t) {
  const parts = [];
  const re = /(\d{1,2})(?:\s*[〜~\-－]\s*(\d{1,2}))?\s*歳(?:児)?\s*(?:が|:)?\s*(\d{1,3})\s*(?:名|人)/g;
  let sum = 0;
  for (const m of t.matchAll(re)) {
    parts.push(`${m[1]}${m[2] ? '〜' + m[2] : ''}歳 ${m[3]}名`);
    sum += Number(m[3]);
  }
  if (parts.length) return { ages: parts.join('／'), sum };
  const range = /(\d{1,2})\s*[〜~\-－]\s*(\d{1,2})\s*歳/.exec(t);
  const words = ['乳児', '幼児', '未就学児', '小学生'].filter((w) => t.includes(w));
  const out = [range ? `${range[1]}〜${range[2]}歳` : null, ...words].filter(Boolean);
  return { ages: out.join('・'), sum: null };
}

function findChildren(t, ageSum) {
  const KID = '(?:子ども|子供|こども|お子さま|お子様|お子さん|児童|キッズ)';
  const a = new RegExp(`${KID}[^。\\n\\d]{0,12}?(\\d{1,3})\\s*(?:名|人)([^。\\n]{0,8})`).exec(t);
  const b = new RegExp(`(\\d{1,3})\\s*(?:名|人)(程度|ほど|くらい|ぐらい|前後)?の?${KID}`).exec(t);
  const approxRe = /程度|ほど|くらい|ぐらい|前後|予定|そう|見込み|約/;
  if (a) return { children: Number(a[1]), approx: approxRe.test(a[0]) };
  if (b) return { children: Number(b[1]), approx: approxRe.test(b[0]) };
  if (ageSum != null) return { children: ageSum, approx: false };
  return { children: null, approx: false };
}

function findWho(t) {
  const sentences = t.split(/[。\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  for (const s0 of sentences) {
    const s = s0.replace(/^はじめまして[、,]?\s*/, '');
    const m = /^(.+?)の(.+?)(?:です|と申します|でございます)$/.exec(s);
    if (m && m[1].length <= 30) return { company: m[1].trim(), contact: m[2].split(/[・\s]|担当/).filter(Boolean).pop() };
    const p = /^(.{1,10}?)(?:です|と申します)$/.exec(s);
    if (p) return { company: '', contact: p[1].trim() };
  }
  return { company: '', contact: '' };
}

const EVENT_WORDS = ['結婚披露宴', '披露宴', '結婚式', '説明会', 'セミナー', '講座', 'フェア', 'マルシェ', 'コンサート', '健診', '保護者会', '体験会', 'ファミリーデー', '研修', '総会', 'イベント'];

function suggestName(t, who) {
  const quoted = /「([^」]{2,30})」/.exec(t);
  const ev = quoted ? quoted[1] : EVENT_WORDS.find((w) => t.includes(w));
  const head = who.company ? who.company + ' ' : '';
  const base = ev ? `${head}${ev} 託児` : `${head}託児のご相談`;
  return !who.company && who.contact ? `${base}（${who.contact}様）` : base;
}

export function organizeInquiry(text, today) {
  const t = String(text || '').normalize('NFKC');
  const who = findWho(t);
  const d = findDate(t, today);
  const { start, end } = findTimes(t);
  const venue = findVenue(t);
  const { ages, sum } = findAges(t);
  const { children, approx } = findChildren(t, sum);

  const items = [];
  if (!d.date) items.push(d.note || '開催日（書かれていません）');
  else if (d.note) items.push(d.note);
  if (d.past) items.push('開催日がもう過ぎています。日付をお客さまに確かめる');
  if (!start || !end) items.push('開始・終了の時刻（書かれていません）');
  if (!venue) items.push('会場（書かれていません）');
  if (children == null) items.push('子どもの人数（書かれていません）');
  else if (approx) items.push(`人数が決まる時期（今は約${children}名）`);
  if (!ages) items.push('子どもの年齢構成（書かれていません）');
  if (!/アレルギー/.test(t)) items.push('アレルギー・持病のあるお子さまの有無');
  else if (!/アレルギー[^。\n]*(?:いません|ない|なし|ありません)/.test(t)) items.push('アレルギーの内容と、当日の対応のしかた');
  if (!/部屋|控室|和室|スペース|会議室|ルーム|託児室/.test(t)) items.push('託児に使う部屋の場所と広さ');
  for (const s of t.split(/[。\n]/)) {
    const q = s.trim();
    if (q && !/お願い/.test(q) && /教えて|いただけ|でしょうか|ますか|\?|？/.test(q)) {
      items.push(`お客さまからの質問: 「${q.length > 40 ? q.slice(0, 40) + '…' : q}」`);
    }
  }

  return {
    fields: { name: suggestName(t, who), company: who.company, contact: who.contact ? `${who.contact} 様` : '', date: d.date, start, end, venue, children, ages },
    found: { date: !!d.date, time: !!(start && end), venue: !!venue, children: children != null, ages: !!ages },
    approxChildren: approx,
    confirmItems: items,
  };
}

// ---------- 2〜4. 文章の下書き ----------
const bullet = (arr) => arr.filter(Boolean).map((x) => `・${x}`).join('\n');
const when = (c) => `${c.date ? formatDateLong(c.date) : TODO('開催日')} ${c.start && c.end ? formatTimeRange(c.start, c.end) : TODO('時間')}`;
const kids = (c) => `${c.children == null ? TODO('人数') : c.children + '名'}${c.ages ? `（${c.ages}）` : ''}`;

// 宛名。個人のお客さま（顧客名に担当者の名前が入っている）は、1行にする
const addressee = (c) => {
  const person = (c.contact || '').replace(/\s*様$/, '');
  return person && (c.company || '').includes(person) ? c.contact
    : [c.company || TODO('お客さまの名前'), c.contact || null].filter(Boolean).join('\n');
};
const formUrl = (c) => c.formUrl || TODO('GoogleフォームのURL');
// Googleフォームの案内（R-30）。URL は設定で入れる。未設定なら〔 〕
const FORM_ITEMS = ['会社名（お名前）・ご担当者名・電話番号・メールアドレス', 'イベント名・開催日・開始と終了の時刻・会場', 'お子さまの人数・年齢構成', 'アレルギーなど、配慮が必要なこと'];
const formGuide = (c) => `お申し込みは、次のGoogleフォームからお願いいたします。\n${formUrl(c)}\n入力していただく項目は、次のとおりです。\n${bullet(FORM_ITEMS)}\n送信していただいた内容は、こちらで確認いたします。`;

export function draftCustomerReply(c) {
  if (c.variant === 'line') return customerLine(c);
  const to = addressee(c);
  const facts = bullet([`開催日時: ${when(c)}`, `会場: ${c.venue || TODO('会場')}`, `お子さまの人数: ${kids(c)}`]);
  const asks = c.confirmItems.length ? `\n\nあわせて、次の点を確認させてください。\n${bullet(c.confirmItems)}` : '';
  let body;
  switch (c.status) {
    case '問い合わせ':
    case 'ヒアリング':
      body = `このたびは託児のお問い合わせをいただき、ありがとうございます。\nいただいた内容を、次のとおり確認いたしました。\n\n${facts}${asks}\n\n内容がそろいしだい、お見積りをお送りいたします。`;
      break;
    case '見積':
      body = `お見積書をお送りいたします。${TODO('見積書を添付')}\n次の内容でお見積りしております。\n\n${facts}\n・スタッフの人数: ${c.requiredStaff == null ? TODO('人数') : c.requiredStaff + '名'}${asks}\n\n内容をご確認いただき、よろしければ、お申し込みをお願いいたします。\n${formGuide(c)}\n\nご不明な点がございましたら、お気軽にお知らせください。`;
      break;
    case '申込確認':
      body = c.hasApplication
        ? `お申し込みをいただき、ありがとうございます。\nフォームの内容を確認し、次の内容で承りました。\n\n${facts}${asks}\n\nこのあと、当日のスタッフの手配を進めてまいります。`
        : `お申し込みについて、ご連絡いたします。\nフォームの送信がまだ確認できておりません。お手数ですが、次のフォームからご入力をお願いいたします。\n\n${formGuide(c)}\n\n現在の内容は、次のとおりです。\n${facts}${asks}`;
      break;
    case 'スタッフ手配':
      body = `ご依頼の託児について、当日のスタッフを手配しております。\n\n${facts}\n\nスタッフが確定しましたら、あらためてご連絡いたします。${asks}`;
      break;
    case '最終確認':
      body = `開催が近づいてまいりましたので、当日の内容を確認させてください。\n\n${facts}\n・スタッフ: ${c.confirmedStaff}名でうかがいます\n・受付の開始: ${TODO('受付の時刻')}\n\nお子さまの着替え・飲み物・おむつなどは、保護者の方にご用意いただくようお伝えください。${asks}`;
      break;
    default:
      body = `先日は託児をご利用いただき、ありがとうございました。\n${c.record ? `当日は${c.record.children}名のお子さまを、${c.record.staff}名のスタッフでお預かりしました。` : `当日は${kids(c)}のお子さまをお預かりしました。`}\n${TODO('当日の様子（けが・体調の変化があったかどうかも）')}\n\nまたの機会がございましたら、どうぞよろしくお願いいたします。`;
  }
  return `${to}\n\nいつもお世話になっております。\n託児運営担当の${c.ownerName}です。\n\n${body}\n\nどうぞよろしくお願いいたします。`;
}

// LINE向けの短い文（R-29）。あいさつを短くし、行を分ける
function customerLine(c) {
  const person = (c.contact || '').replace(/\s*様$/, '');
  const name = person && (c.company || '').includes(person) ? c.contact : [c.company, c.contact].filter(Boolean).join(' ') || TODO('お客さまの名前');
  const facts = [`日時: ${when(c)}`, `会場: ${c.venue || TODO('会場')}`, `人数: ${kids(c)}`];
  const asks = c.confirmItems.slice(0, 3);
  const head = [`${name}`, `託児担当の${c.ownerName}です。`];
  let body;
  switch (c.status) {
    case '問い合わせ':
    case 'ヒアリング':
      body = ['お問い合わせありがとうございます。', '次の内容で確認しました。', ...facts, ...(asks.length ? ['', '確認させてください。', ...asks.map((x) => `・${x}`)] : []), '', '内容がそろい次第、お見積りをお送りします。'];
      break;
    case '見積':
      body = ['お見積書をお送りしました。ご確認ください。', ...facts, '', 'お申し込みは、このフォームからお願いします。', formUrl(c)];
      break;
    case '申込確認':
      body = c.hasApplication ? ['お申し込み内容を確認しました。', ...facts, '', 'スタッフの手配を進めます。']
        : ['フォームのご入力がまだ確認できていません。', 'こちらからお願いします。', formUrl(c)];
      break;
    case 'スタッフ手配':
      body = ['スタッフを手配しています。', '確定したら、あらためてご連絡します。', ...facts];
      break;
    case '最終確認':
      body = ['当日のご案内です。', ...facts, `スタッフ: ${c.confirmedStaff}名`, `受付: ${TODO('受付の時刻')}から`, '', '着替え・飲み物・おむつは、保護者の方にご用意をお願いします。'];
      break;
    default:
      body = ['先日はご利用ありがとうございました。', TODO('当日の様子（けが・体調の変化があったかどうかも）')];
  }
  return [...head, '', ...body, '', 'よろしくお願いします。'].join('\n');
}

function staffLine(c, need, byWhen) {
  return [
    `【託児スタッフ${need === 0 ? 'へのご連絡' : '募集'}】${c.date ? formatDateShort(c.date) : ''}`,
    `日時: ${when(c)}`, `場所: ${c.venue || TODO('会場')}`, `集合: ${TODO('集合の時刻と場所')}`, `お子さま: ${kids(c)}`,
    need == null ? `募集: ${TODO('募集する人数')}` : need === 0 ? `人数はそろっています（${c.requiredStaff}名）` : `募集: ${need}名`,
    need === 0 ? '変更があれば、返信してください。' : `入れる方は、${byWhen}に返信してください。`,
  ].join('\n');
}

export function draftStaffRequest(c) {
  const need = c.requiredStaff == null ? null : Math.max(0, c.requiredStaff - c.confirmedStaff);
  // 乳児は「乳児」か、0歳・1歳から始まる書き方（「0〜2歳」「1歳」）。「10歳」「12歳」は当てはまらない
  const infants = /乳児|(?:^|[^\d])[01]\s*(?:[〜~\-]\s*\d{1,2}\s*)?歳/.test((c.ages || '').normalize('NFKC'));
  const head = need === 0
    ? `次の託児のお仕事について、確定したスタッフの皆さんへご連絡です。`
    : `次の託児のお仕事に入れる方を募集しています。`;
  const count = need == null
    ? `募集人数: ${TODO('募集する人数')}`
    : need === 0 ? `人数: 必要な${c.requiredStaff}名がそろっています`
      : `募集人数: ${need}名（必要${c.requiredStaff}名のうち${c.confirmedStaff}名が確定${c.requestedStaff ? `、ほかに${c.requestedStaff}名へ依頼中` : ''}）`;
  // 返事の期限: 2日後。ただし開催日の前日まで。今日より前になるなら「今日中」
  let deadline = addDays(c.today, 2);
  if (c.date && deadline >= c.date) deadline = addDays(c.date, -1);
  const byWhen = deadline <= c.today ? '今日中' : `${formatDateShort(deadline)}まで`;
  if (c.variant === 'line') return staffLine(c, need, byWhen);
  return `【託児スタッフ${need === 0 ? 'へのご連絡' : '募集'}】${c.date ? formatDateShort(c.date) : ''} ${c.venue || ''}\n\nお疲れさまです。運営担当の${c.ownerName}です。\n${head}\n\n${bullet([
    `日時: ${when(c)}`,
    `集合: ${TODO('集合の時刻と場所')}`,
    `場所: ${c.venue || TODO('会場')}`,
    `お子さま: ${kids(c)}`,
    count,
    c.careNotes ? `内容: ${c.careNotes}` : null,
  ])}${infants ? '\n\n乳児のお世話の経験がある方だと助かります。' : ''}\n\n${need === 0 ? '内容に変更があれば、このメッセージに返信してください。' : `入れる方は、${byWhen}にこのメッセージに返信してください。`}`;
}

// 見積のご案内文（R-29）。見積書に添える文と、内訳のひな形。金額は人が入れる（システムは計算しない）
export function draftQuote(c) {
  const asks = c.confirmItems.length ? `\n\n見積の内容を決めるため、次の点を教えていただけますでしょうか。\n${bullet(c.confirmItems)}` : '';
  return `${addressee(c)}\n\nいつもお世話になっております。\n託児運営担当の${c.ownerName}です。\n\n託児のお見積書をお送りいたします。${TODO('見積書を添付')}\n\n■ お見積りの内容\n${bullet([
    `内容: ${c.type}（${c.caseName}）`,
    `日時: ${when(c)}`,
    `会場: ${c.venue || TODO('会場')}`,
    `お子さまの人数: ${kids(c)}`,
    `託児スタッフ: ${c.requiredStaff == null ? TODO('人数') : c.requiredStaff + '名'}`,
    `お見積り金額: ${TODO('金額')}円（${TODO('税込・税別')}）`,
    `内訳: ${TODO('内訳。スタッフの人数 × 時間 など')}`,
    `交通費・備品費: ${TODO('ある場合は金額を書く')}`,
    `お見積りの有効期限: ${TODO('期限')}`,
  ])}${asks}\n\n内容をご確認いただき、よろしければ、お申し込みをお願いいたします。\n${formGuide(c)}\n\nご不明な点がございましたら、お気軽にお知らせください。\nどうぞよろしくお願いいたします。`;
}

// 託児申込書のひな形（R-29）。案件の情報が入り、お客さまが確かめて記入する欄がつく
export function draftApplication(c) {
  return `託児 お申込書\n（${c.caseName}）\n\n■ お申込者\n${bullet([
    `会社名（お名前）: ${c.company || TODO('会社名（お名前）')}`,
    `ご担当者名: ${c.contact || TODO('ご担当者名')}`,
    `電話番号: ${c.phone || TODO('電話番号')}`,
    `メールアドレス: ${c.email || TODO('メールアドレス')}`,
  ])}\n\n■ 託児の内容\n${bullet([
    `種類: ${c.type}`,
    `日時: ${when(c)}`,
    `会場: ${c.venue || TODO('会場')}`,
    `お子さまの人数: ${kids(c)}`,
    `託児スタッフ: ${c.requiredStaff == null ? TODO('人数') : c.requiredStaff + '名'}（弊社で手配します）`,
    `アレルギー・配慮が必要なこと: ${TODO('お客さまに確かめて書く')}`,
  ])}\n\n■ 当日のお願い\n${bullet([
    'お預かりのときに、受付名簿にご記入をお願いします。',
    'お子さまの着替え・飲み物・おむつなどは、保護者の方にご用意をお願いします。',
    'お子さまの体調が悪いときは、お預かりできない場合があります。',
    `キャンセルについて: ${TODO('キャンセルの決まり')}`,
  ])}\n\n■ お申し込み\n上の内容で、託児を申し込みます。\n\nお名前:　　　　　　　　　　　　　　日付:　　　　　　　　\n\n※ お申し込みは、Googleフォームからも受け付けています。\n${formUrl(c)}`;
}

export function draftHandoverMemo(c) {
  const staffLines = c.staff.length ? c.staff.map((s) => `${s.name}（${s.state === '依頼中' ? '依頼中・返事待ち' : '確定'}）${s.qualification}・経験${s.years ?? '?'}年`) : ['まだいません'];
  const short = c.requiredStaff == null ? '必要数は未入力' : `確定 ${c.confirmedStaff} / 必要 ${c.requiredStaff}${c.requiredStaff > c.confirmedStaff ? `、あと${c.requiredStaff - c.confirmedStaff}名` : ''}`;
  const taskLines = c.tasks.length ? c.tasks.map((t) => `${t.overdue ? '［期限切れ］' : ''}${t.title} … ${formatDateShort(t.due)} ${t.assignee}`) : ['残りのタスクはありません'];
  const notes = c.pastNotes.length ? c.pastNotes.map((r) => `${formatDateShort(r.date)} ${r.caseName}: ${r.notes}`) : ['同じお客さまの実績はまだありません'];
  return [
    `【引き継ぎメモ】${c.caseName}`,
    `作成: ${formatDateLong(c.today)}／もとにした情報: 案件・スタッフ・タスク・実績`,
    '',
    '■ 案件の要点',
    bullet([
      `ステータス: ${c.status}（今やること: ${c.guide}）`,
      `日時: ${when(c)}`,
      `会場: ${c.venue || '未入力'}`,
      `お客さま: ${[c.company, c.contact].filter(Boolean).join(' ') || '未入力'}${c.phone ? `（${c.phone}）` : ''}`,
      `お子さま: ${c.children == null ? '未入力' : countOrUnset(c.children)}${c.ages ? `（${c.ages}）` : ''}`,
      `運営の担当: ${c.ownerName}`,
    ]),
    '',
    `■ スタッフ（${short}）`,
    bullet(staffLines),
    '',
    `■ 残りのタスク（${c.tasks.length}件）`,
    bullet(taskLines),
    '',
    '■ 確認事項',
    bullet(c.confirmItems.length ? c.confirmItems : ['なし']),
    ...(c.careNotes ? ['', '■ 託児メモ', c.careNotes] : []),
    '',
    '■ 前回までの申し送り（同じお客さまの実績から）',
    bullet(notes),
  ].join('\n');
}

