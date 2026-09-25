// サンプルデータ（すべて架空。実在の企業・人とは関係ない。S-88）
// 日付は「開いた日」からの差で作る。いつ開いても、今日のタスク・期限切れ・今週の案件がある状態になる
import { addDays, onOrAfter, findCandidates, parseISO, weekdayJa, startOfWeek, busyReason } from './logic.js';
import { missingSlots, findSlotCandidates } from './shift.js';

// 結婚披露宴の問い合わせ文（案件 c06 の原文と、AIアシスタントの例文で使う）
function weddingInquiry(iso) {
  const d = parseISO(iso);
  return `はじめまして。川口と申します。
${d.getMonth() + 1}月${d.getDate()}日（${weekdayJa(iso)}）に、ホテル・ベイサイド港で結婚披露宴を予定しています。
ゲストのお子さまが5名ほど来る予定で、披露宴の間（11:00〜15:30）託児をお願いできないでしょうか。
年齢は2歳が1名、4歳が2名、7歳が2名です。控室を1つ使えると聞いています。
料金の目安も教えていただけると助かります。`;
}

// AIアシスタントの例文。日付は「開いた日」からの差で作る（いつ開いても、過去や曜日ちがいの注意が出ない）
export function sampleInquiries(today) {
  const lecture = parseISO(onOrAfter(today, 70, [6]));
  return [
    { label: '結婚披露宴の託児', text: weddingInquiry(onOrAfter(today, 50, [6])) },
    {
      label: '企業の説明会（情報が少ない）',
      text: `株式会社みらい住建の広報担当・上田です。
来月、住宅購入を考えている方向けの説明会を開くことになり、会場内に託児スペースを設けたいと考えています。
お子さまは20名くらいになりそうです。対応していただけるか、まずはご相談させてください。`,
    },
    {
      label: '自治体の講座',
      text: `みどり市 子育て支援センターの高木です。
${lecture.getFullYear()}年${lecture.getMonth() + 1}月${lecture.getDate()}日 10時〜12時に「はじめての離乳食講座」を行います。会場は子育て支援センター 2階 和室です。
受講者のお子さま（0歳 6名、1歳 3名）の一時託児をお願いしたいです。
アレルギーのあるお子さまはいません。見積書をいただけますか。`,
    },
  ];
}

const WEEKEND = [0, 6];
const WEEKDAY = [1, 2, 3, 4, 5];

export function buildSeed(today) {
  const d = (n) => addDays(today, n);

  const members = [
    { id: 'm1', name: '高橋 美咲' },
    { id: 'm2', name: '中村 健太' },
    { id: 'm3', name: '小林 由紀' },
  ];

  const staff = [
    { id: 's01', name: '佐藤 陽子', days: ['土', '日'], from: '09:00', to: '18:00', qualification: '保育士', years: 8, experience: '乳児対応・イベント託児のリーダー', status: '稼働可', notes: '当日のリーダーを任せられる' },
    { id: 's02', name: '鈴木 花', days: ['月', '火', '水', '木', '金', '土'], from: '08:30', to: '17:00', qualification: '幼稚園教諭', years: 5, experience: '3〜6歳の集団あそび・工作', status: '稼働可', notes: '' },
    { id: 's03', name: '田中 里美', days: ['月', '火', '水', '木', '金'], from: '09:00', to: '16:00', qualification: '保育士', years: 12, experience: '乳児対応・配慮が必要な子の対応', status: '稼働可', notes: '平日の午前が入りやすい' },
    { id: 's04', name: '伊藤 真由', days: ['土', '日'], from: '10:00', to: '20:00', qualification: '子育て支援員', years: 3, experience: 'イベント託児（受付・見守り）', status: '稼働可', notes: '' },
    { id: 's05', name: '渡辺 拓也', days: ['金', '土', '日'], from: '09:00', to: '18:00', qualification: '保育士', years: 4, experience: '体を使うあそび・小学生の見守り', status: '稼働可', notes: '' },
    { id: 's06', name: '山本 彩', days: ['月', '火', '水', '木', '金', '土', '日'], from: '09:00', to: '15:00', qualification: '幼稚園教諭', years: 2, experience: '3〜6歳の見守り', status: '稼働可', notes: '15時までなら毎日入れる' },
    { id: 's07', name: '中島 恵', days: ['月', '水', '金'], from: '09:00', to: '17:00', qualification: '保育士', years: 15, experience: '乳児対応・常設託児室の運営', status: '稼働可', notes: '新人スタッフの付き添いができる' },
    { id: 's08', name: '松本 さくら', days: ['土', '日'], from: '12:00', to: '20:00', qualification: '子育て支援員', years: 1, experience: '見守り（研修済み）', status: '稼働可', notes: '経験者と一緒に配置する' },
    { id: 's09', name: '井上 和子', days: ['火', '木'], from: '09:00', to: '14:00', qualification: '保育士', years: 20, experience: '乳児対応・保護者対応', status: '休止中', notes: '11月末まで休止' },
    { id: 's10', name: '木村 亜希', days: ['月', '火', '水', '木', '金', '土', '日'], from: '12:00', to: '21:00', qualification: 'ベビーシッター', years: 6, experience: '夕方・夜の託児・英語での対応', status: '稼働可', notes: '' },
  ];

  const customer = (company, contact, phone, email) => ({ company, contact, phone, email });

  // assign: [確定の人数, 依頼中の人数]（条件に合う候補から、経験の長い順に割り当てる）
  const cases = [
    { id: 'c01', name: '青葉ハウジング 秋の住宅フェア キッズスペース', type: 'イベント託児', date: onOrAfter(today, 2, WEEKEND), start: '10:00', end: '16:00',
      venue: '青葉ハウジング 港北展示場 1F 多目的室', customer: customer('青葉ハウジング株式会社 営業企画部', '森田 様', '03-0000-1101', 'morita@aoba-housing.example'),
      children: 12, ages: '0〜2歳 3名／3〜6歳 7名／小学生 2名', requiredStaff: 4, ownerId: 'm1', status: 'スタッフ手配',
      confirmItems: 'おむつ替えができる場所の有無', careNotes: '保護者が展示場を見学している間に預かる（1組2時間まで）。おやつは出さない。', assign: [2, 1] },
    { id: 'c02', name: 'みなと証券 保護者向けマネーセミナー 託児', type: 'イベント託児', date: d(1), start: '13:30', end: '16:00',
      venue: 'みなと証券 横浜ビル 5F 会議室B', customer: customer('みなと証券株式会社 人事部', '石田 様', '045-000-2202', 'ishida@minato-sec.example'),
      children: 8, ages: '1〜2歳 2名／3〜5歳 6名', requiredStaff: 3, ownerId: 'm2', status: '最終確認',
      confirmItems: '', careNotes: 'セミナー会場の隣の会議室を使う。受付は13:15から。', assign: [3, 0] },
    { id: 'c03', name: 'さくら通り商店街 秋マルシェ 託児ブース', type: 'イベント託児', date: onOrAfter(today, 9, WEEKEND), start: '11:00', end: '17:00',
      venue: 'さくら通り商店街 集会所', customer: customer('さくら通り商店街振興組合', '大野 様', '03-0000-3303', 'info@sakura-dori.example'),
      children: 15, ages: '3〜6歳が中心（事前予約制）', requiredStaff: 4, ownerId: 'm1', status: '申込確認',
      confirmItems: '申込書を送っていただく時期／雨の日の託児の場所', careNotes: '', assign: [0, 0] },
    { id: 'c04', name: 'ひだまり歯科 小児健診日の託児', type: 'イベント託児', date: onOrAfter(today, 15, WEEKDAY), start: '09:30', end: '12:30',
      venue: 'ひだまり歯科クリニック 2F キッズルーム', customer: customer('医療法人ひだまり会', '事務長 岡田 様', '03-0000-4404', 'okada@hidamari-dc.example'),
      children: 6, ages: '0〜3歳（健診を受ける子のきょうだい）', requiredStaff: 2, ownerId: 'm3', status: '見積',
      confirmItems: 'お送りした見積の内容で進めてよいか', careNotes: '', assign: [0, 0] },
    { id: 'c05', name: 'みどり市民文化ホール 親子で聴くコンサート 託児室', type: 'イベント託児', date: onOrAfter(today, 22, WEEKEND), start: '14:00', end: '16:30',
      venue: 'みどり市民文化ホール 楽屋3', customer: customer('みどり市民文化ホール 事業課', '西村 様', '042-000-5505', 'nishimura@midori-hall.example'),
      children: null, ages: '', requiredStaff: null, ownerId: 'm2', status: 'ヒアリング',
      confirmItems: 'お子さまの人数と年齢／楽屋の広さ', careNotes: '', assign: [0, 0] },
    { id: 'c06', name: '結婚披露宴 ゲストのお子さま託児（川口様）', type: 'イベント託児', date: onOrAfter(today, 30, WEEKEND), start: '11:00', end: '15:30',
      venue: 'ホテル・ベイサイド港 2F 控室', customer: customer('川口 様（個人）', '川口 様', '090-0000-6606', 'kawaguchi@mail.example'),
      children: 5, ages: '2歳 1名／4歳 2名／7歳 2名', requiredStaff: null, ownerId: 'm3', status: '問い合わせ',
      confirmItems: '控室の広さと場所／アレルギーのあるお子さまの有無', careNotes: '', assign: [0, 0], wedding: true },
    { id: 'c07', name: 'モールみなみ 夏休みキッズフェス 託児', type: 'イベント託児', date: today, start: '10:00', end: '15:00',
      venue: 'ショッピングモールみなみ 1F イベント広場', customer: customer('株式会社みなみ商業開発', '浅野 様', '045-000-7707', 'asano@minami-mall.example'),
      children: 10, ages: '1〜6歳（予約6名＋当日受付）', requiredStaff: 3, ownerId: 'm1', status: '最終確認',
      confirmItems: '', careNotes: '当日受付は1時間単位。定員12名を超えたら受付を止める。', assign: [3, 0] },
    { id: 'c08', name: 'こもれびヨガ 親子ヨガ体験会 託児', type: 'イベント託児', date: d(-2), start: '10:00', end: '12:00',
      venue: 'こもれびヨガスタジオ 大スタジオ', customer: customer('こもれびヨガスタジオ', '佐々木 様', '03-0000-8808', 'sasaki@komorebi-yoga.example'),
      children: 4, ages: '0〜2歳 4名', requiredStaff: 2, ownerId: 'm2', status: '実施済み',
      confirmItems: '', careNotes: '', assign: [2, 0], anyDay: true },
    { id: 'c09', name: 'ひかり学習塾 保護者会 託児', type: 'イベント託児', date: d(-6), start: '18:00', end: '20:00',
      venue: 'ひかり学習塾 本校 2F 教室', customer: customer('ひかり学習塾', '塾長 前田 様', '03-0000-9909', 'maeda@hikari-juku.example'),
      children: 7, ages: '2〜8歳', requiredStaff: 2, ownerId: 'm2', status: '完了', confirmItems: '', careNotes: '', assign: [2, 0], anyDay: true },
    { id: 'c10', name: 'モールみなみ 秋のスタンプラリー 託児', type: 'イベント託児', date: d(-11), start: '10:00', end: '18:00',
      venue: 'ショッピングモールみなみ 1F イベント広場', customer: customer('株式会社みなみ商業開発', '浅野 様', '045-000-7707', 'asano@minami-mall.example'),
      children: 12, ages: '1〜6歳', requiredStaff: 4, ownerId: 'm1', status: '完了', confirmItems: '', careNotes: '', assign: [4, 0], anyDay: true },
    { id: 'c11', name: 'みどり市 子育て講座 一時託児', type: 'イベント託児', date: onOrAfter(today, 5, WEEKDAY), start: '10:00', end: '12:00',
      venue: 'みどり市 子育て支援センター 和室', customer: customer('みどり市 こども未来課', '高木 様', '042-000-1111', 'takagi@city-midori.example'),
      children: 9, ages: '0〜1歳 5名／2〜3歳 4名', requiredStaff: 4, ownerId: 'm3', status: 'スタッフ手配',
      confirmItems: 'お子さまの月齢（離乳食を始めているか）', careNotes: '乳児が多いため、乳児対応の経験者を2名以上配置する。', assign: [1, 1] },
    { id: 'c12', name: 'ファミリースポーツクラブ 体験会 託児', type: 'イベント託児', date: onOrAfter(today, 40, WEEKEND), start: '09:30', end: '12:00',
      venue: 'ファミリースポーツクラブ 港南店', customer: customer('株式会社ファミリースポーツ', '営業部 近藤 様', '045-000-1212', 'kondo@family-sports.example'),
      children: null, ages: '', requiredStaff: null, ownerId: 'm2', status: '問い合わせ',
      confirmItems: 'お子さまの人数と年齢／託児に使う場所', careNotes: '', assign: [0, 0] },
    { id: 'c13', name: '青葉ハウジング 夏の住宅フェア キッズスペース', type: 'イベント託児', date: d(-25), start: '10:00', end: '16:00',
      venue: '青葉ハウジング 港北展示場 1F 多目的室', customer: customer('青葉ハウジング株式会社 営業企画部', '森田 様', '03-0000-1101', 'morita@aoba-housing.example'),
      children: 15, ages: '0〜6歳', requiredStaff: 5, ownerId: 'm1', status: '完了', confirmItems: '', careNotes: '', assign: [5, 0], anyDay: true },
    { id: 'c14', name: 'みなと証券 社員向けファミリーデー', type: 'イベント託児', date: d(-18), start: '10:00', end: '15:00',
      venue: 'みなと証券 横浜ビル 1F ホール', customer: customer('みなと証券株式会社 人事部', '石田 様', '045-000-2202', 'ishida@minato-sec.example'),
      children: 20, ages: '0〜10歳', requiredStaff: 6, ownerId: 'm2', status: '完了', confirmItems: '', careNotes: '', assign: [6, 0], anyDay: true },
  ];

  const state = { cases: [], staff, members, tasks: [], records: [], rooms: [], shifts: [], applications: [], settings: { formUrl: '', templatesOff: [] } };

  // 割り当て: 条件に合う人から順に。過去の案件（anyDay）は、条件を見ずに経験の長い順で埋める
  for (const src of cases) {
    const { assign, anyDay, wedding, ...c } = src;
    c.inquiry = wedding ? weddingInquiry(c.date) : '';
    c.assignments = [];
    const [nConfirmed, nRequested] = assign;
    const pool = anyDay
      ? staff.filter((s) => s.status === '稼働可').sort((a, b) => b.years - a.years)
      : findCandidates({ ...state, cases: state.cases }, c).candidates;
    pool.slice(0, nConfirmed + nRequested).forEach((s, i) => {
      c.assignments.push({ staffId: s.id, state: i < nConfirmed ? '確定' : '依頼中', fare: null, fareConfirmed: false, route: '' });
    });
    c.billing = { state: '未着手', handedOverAt: '' };
    state.cases.push(c);
  }

  const T = (id, caseId, title, dueOffset, status, assigneeId) => ({ id, caseId, title, due: d(dueOffset), status, assigneeId });
  state.tasks = [
    T('t01', 'c01', 'スタッフ依頼（残り1名）の返事を確認', -1, '進行中', 'm1'),
    T('t02', 'c04', '見積書を送る', -2, '未着手', 'm3'),
    T('t03', 'c11', '乳児対応のできるスタッフを探す', -1, '進行中', 'm3'),
    T('t04', 'c02', '当日の持ち物と名簿を最終確認', 0, '進行中', 'm2'),
    T('t05', 'c07', '当日の受付名簿を印刷', 0, '完了', 'm1'),
    T('t06', 'c08', '実績を登録する', 0, '未着手', 'm2'),
    T('t07', 'c03', '申込フォームの回答を確認する', 0, '未着手', 'm1'),
    T('t08', 'c05', 'ヒアリング（子どもの人数・年齢）', 0, '未着手', 'm2'),
    T('t09', 'c01', '会場の下見（おむつ替えスペース）', 1, '未着手', 'm1'),
    T('t10', 'c02', 'スタッフへ集合時間を連絡', -1, '完了', 'm2'),
    T('t11', 'c06', '問い合わせへの一次返信', 1, '未着手', 'm3'),
    T('t12', 'c03', 'スタッフ手配を始める', 3, '未着手', 'm1'),
    T('t13', 'c04', '見積の返事を確認', 4, '未着手', 'm3'),
    T('t14', 'c11', '保育室の配置を先方と確認', 2, '未着手', 'm3'),
    T('t15', 'c01', '当日の配置表を作る', 2, '未着手', 'm1'),
    T('t16', 'c05', '見積を作る', 5, '未着手', 'm2'),
    T('t17', 'c12', '問い合わせへの一次返信', 2, '未着手', 'm2'),
    T('t18', 'c07', '日報をまとめる', 1, '未着手', 'm1'),
    T('t19', 'c09', '実績を登録する', -5, '完了', 'm2'),
    T('t20', 'c10', '先方へ実施報告を送る', -9, '完了', 'm1'),
    T('t21', 'c13', '先方へ実施報告を送る', -23, '完了', 'm1'),
    T('t22', 'c14', '先方へ実施報告を送る', -16, '完了', 'm2'),
    T('t23', 'c02', '見積書を送る', -10, '完了', 'm2'),
    T('t24', 'c01', '申込フォームの回答を確認する', -7, '完了', 'm1'),
    T('t25', 'c08', '先方へ実施報告を送る', 1, '未着手', 'm2'),
  ];

  const R = (id, caseId, dateOffset, children, staffN, start, end, notes) => ({ id, caseId, date: d(dateOffset), children, staff: staffN, start, end, notes });
  state.records = [
    R('r01', 'c09', -6, 6, 2, '18:00', '20:10', '保護者会が10分延びた。次回は延びそうかを前日に確かめる。きょうだい2組は同じ部屋で問題なし。'),
    R('r02', 'c10', -11, 14, 4, '10:00', '18:00', '午後に当日受付が集中した。15時台だけスタッフを1名増やすと安心。'),
    R('r03', 'c13', -25, 18, 5, '10:00', '16:00', '水分をとる時間を決めておくと声をかけやすい。受付の名札は前日に用意すると早い。'),
    R('r04', 'c14', -18, 22, 6, '10:00', '15:00', '年齢ごとに部屋を分けたのがよかった。アレルギーの申告は受付でもう一度確認した。'),
  ];

  // 交通費（R-20）と、請求準備の状態（R-27）
  const FARES = [600, 800, 1100, 1400, 500, 900];
  const byId = (id) => state.cases.find((c) => c.id === id);
  for (const id of ['c09', 'c10', 'c13', 'c14']) {
    byId(id).assignments.forEach((a, i) => { a.fare = FARES[(i + id.length) % 6]; a.fareConfirmed = true; a.route = i % 2 ? '自宅から会場（電車）' : '自宅から会場（バス）'; });
  }
  byId('c09').assignments[1].fareConfirmed = false;                                   // 請求準備の「足りないこと」の例
  byId('c08').assignments[0].fare = 500; byId('c08').assignments[0].fareConfirmed = true; byId('c08').assignments[0].route = '自宅から会場（電車）';
  byId('c01').assignments[0].fare = 1200; byId('c01').assignments[0].route = '自宅から展示場（電車・バス）';
  byId('c02').assignments.forEach((a) => { a.fare = 700; a.fareConfirmed = true; a.route = '自宅から会場（電車）'; });
  byId('c07').assignments.forEach((a) => { a.fare = 0; a.fareConfirmed = true; a.route = '近隣のため不要'; });
  byId('c13').billing = { state: '経理へ引き継ぎ済み', handedOverAt: d(-22) };
  byId('c14').billing = { state: '経理へ引き継ぎ済み', handedOverAt: d(-15) };
  byId('c10').billing = { state: '準備できた', handedOverAt: '' };

  // 常設託児室3か所と、定期シフト（R-18・R-19）
  state.rooms = [
    { id: 'rm1', name: 'モールみなみ キッズルーム', hours: '10:00〜18:00', pattern: [
      { id: 'p1', days: ['月', '火', '水', '木', '金'], start: '10:00', end: '14:00', need: 2 },
      { id: 'p2', days: ['月', '火', '水', '木', '金'], start: '14:00', end: '18:00', need: 1 },
      { id: 'p3', days: ['土', '日'], start: '10:00', end: '18:00', need: 3 }] },
    { id: 'rm2', name: 'こもれびヨガ 託児室', hours: '10:00〜12:00', pattern: [{ id: 'p4', days: ['火', '木', '土'], start: '10:00', end: '12:00', need: 1 }] },
    { id: 'rm3', name: '青空クリニック 院内託児室', hours: '9:00〜13:00', pattern: [{ id: 'p5', days: ['月', '火', '水', '木', '金'], start: '09:00', end: '13:00', need: 1 }] },
  ];
  let slotNo = 0, k = 0;
  const ws = startOfWeek(today);
  for (const w of [addDays(ws, -7), ws, addDays(ws, 7)]) {
    const made = missingSlots(state, w, () => 'sh' + String(++slotNo).padStart(3, '0'));
    for (const slot of made) {
      state.shifts.push(slot);
      const cand = findSlotCandidates(state, slot).candidates;
      let pick = cand.length ? cand[k % cand.length] : null;
      const past = slot.date <= today;
      if (!pick && past) pick = staff.filter((x) => x.status === '稼働可' && !busyReason(state, x.id, slot.date, slot.start, slot.end)).sort((a, b) => b.years - a.years)[0] || null;
      k++;
      if (!pick || (!past && k % 6 === 0)) continue;                                  // 未手配のまま（未来の枠だけ）
      slot.staffId = pick.id;
      slot.state = past || k % 4 !== 1 ? '確定' : '依頼中';
    }
  }

  // 取り込み済みの申込フォームの回答（R-17）。まだ取り込んでいない回答は、sampleFormText で練習できる
  const fromCase = (c, at) => ({
    receivedAt: at, company: c.customer.company, contact: c.customer.contact, phone: c.customer.phone, email: c.customer.email,
    eventName: c.name, date: c.date, start: c.start, end: c.end, venue: c.venue, children: c.children, ages: c.ages, care: '', note: '',
  });
  state.applications = [
    { id: 'ap01', caseId: 'c01', status: '確認済み', confirmedAt: d(-6), values: fromCase(byId('c01'), `${d(-7)} 14:20`), appliedKeys: [] },
    { id: 'ap02', caseId: 'c02', status: '確認済み', confirmedAt: d(-12), values: fromCase(byId('c02'), `${d(-13)} 09:05`), appliedKeys: [] },
  ];

  return state;
}

// 取り込みの練習用の回答（スプレッドシートからコピーした表の形）。1件目は人数がちがい、3件目は新しいお客さま
export function sampleFormText(state, today) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const slash = (iso) => { const [y, m, dd] = iso.split('-'); return `${y}/${+m}/${+dd}`; };
  const c3 = state.cases.find((c) => c.id === 'c03');
  const c4 = state.cases.find((c) => c.id === 'c04');
  const header = ['タイムスタンプ', '会社名・お名前', 'ご担当者名', '電話番号', 'メールアドレス', 'イベント名', '開催日', '開始時刻', '終了時刻', '会場', 'お子さまの人数', '年齢構成', 'アレルギー・配慮が必要なこと', 'ご質問・ご要望'];
  const row = (c, ts, count, care, note) => [`${slash(today)} ${ts}`, c.customer.company, c.customer.contact, c.customer.phone, c.customer.email, c.name, slash(c.date), c.start, c.end, c.venue, count, c.ages, care, note];
  const rows = [];
  if (c3) rows.push(row(c3, '10:12:05', '18名', '卵アレルギーのお子さまが1名います', '雨の場合は屋内に移せますか？'));
  if (c4) rows.push(row(c4, '11:40:31', `${c4.children}名`, 'なし', ''));
  rows.push([`${slash(today)} 13:02:47`, 'ひまわり保育室ネットワーク', '斎藤 様', '03-0000-7777', 'saito@himawari.example', '家族の日 親子フェス', slash(onOrAfter(today, 45, WEEKEND)), '10:00', '15:00', '市民体育館 サブアリーナ', '25名', '0〜6歳 20名／小学生 5名', 'なし', '']);
  return [header, ...rows].map((r) => r.map(q).join(',')).join('\n');
}
