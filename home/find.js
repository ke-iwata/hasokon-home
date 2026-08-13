/**
 * トップの一覧をキーワードで絞り込む。
 *
 * ツールとゲームが31件まで増え、スマホでは全体が8画面ぶんある。
 * 分類への近道（.quicknav）で「だいたいの場所」へは飛べるので、
 * ここは「名前が分かっているものに一発で辿り着く」ほうを担当する。
 *
 * 入力欄はこのスクリプトが差し込む。JSが動かない環境に
 * 何も起きない入力欄を見せないため（一覧は素のHTMLなので全件見える）。
 *
 * カードを増やしたときにここを直す必要はない。DOMを走査して対象を決めている。
 */
(function () {
  'use strict';

  var nav = document.querySelector('.quicknav');
  if (!nav) return;

  /** 絞り込みの対象。カード（ツール・ゲーム・アプリ）すべて */
  var cards = [].slice.call(document.querySelectorAll('.card, .app-card'));
  if (cards.length === 0) return;

  // 「このサイトについて」は説明文であって一覧ではないので触らない
  var sections = [].slice.call(document.querySelectorAll('main section')).filter(function (s) {
    return s.querySelector('.card, .app-card');
  });

  // 検索対象の文字列はカードごとに一度だけ作る（入力のたびに読み直さない）。
  // 属する分類の見出しも混ぜているので、「ゲーム」「お金」のような
  // 分類名だけでもそのまとまりを引ける
  var haystacks = cards.map(function (card) {
    var section = card.closest('section');
    var heading = section ? section.querySelector('h2') : null;
    return normalize(
      card.textContent +
        ' ' +
        (card.getAttribute('href') || '') +
        ' ' +
        (heading ? heading.textContent : ''),
    );
  });

  /**
   * 比較用に文字列をならす。
   * 全角英数を半角に、カタカナをひらがなに寄せることで、
   * 「ふりーせる」「フリーセル」「ｉＤｅＣｏ」のどれでも当たるようにする。
   */
  function normalize(text) {
    return text
      .toLowerCase()
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xfee0);
      })
      .replace(/[ァ-ヶ]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0x60);
      })
      .replace(/\s+/g, ' ');
  }

  var box = document.createElement('div');
  box.className = 'finder';
  var input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'ツール・ゲームを絞り込む（例: 年金、ソリティア）';
  input.setAttribute('aria-label', 'ツール・ゲームを絞り込む');
  box.appendChild(input);
  nav.parentNode.insertBefore(box, nav.nextSibling);

  var empty = document.createElement('p');
  empty.className = 'finder-empty';
  empty.hidden = true;
  empty.textContent =
    '一致するものがありませんでした。別の言葉でお試しください。';
  box.appendChild(empty);

  function apply() {
    // 空白区切りの語をすべて含むものを残す（絞り込みなのでAND）
    var words = normalize(input.value).trim().split(' ').filter(Boolean);
    var hits = 0;

    cards.forEach(function (card, i) {
      var match =
        words.length === 0 ||
        words.every(function (w) {
          return haystacks[i].indexOf(w) !== -1;
        });
      card.hidden = !match;
      if (match) hits += 1;
    });

    // 中身が全部消えた分類は見出しごと畳む（空の見出しだけが並ぶのを防ぐ）
    sections.forEach(function (section) {
      var visible = [].slice.call(section.querySelectorAll('.card, .app-card')).some(function (c) {
        return !c.hidden;
      });
      section.hidden = !visible;
    });

    // 分類への近道は、絞り込み中は飛び先が畳まれていることがあるので隠す
    nav.hidden = words.length > 0;
    empty.hidden = hits > 0;
  }

  // 日本語入力の変換中は絞り込まない。
  // 「年金」を打つ途中の「ねんきん」で0件になり、「一致しません」が
  // 変換のたびに点滅するため。確定した時点で1回だけ走らせる
  var composing = false;
  input.addEventListener('compositionstart', function () {
    composing = true;
  });
  input.addEventListener('compositionend', function () {
    composing = false;
    apply();
  });

  input.addEventListener('input', function () {
    if (!composing) apply();
  });

  // Escでクリア（スマホのソフトキーボードには無いが、PCでは素直な操作）
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      apply();
    }
  });
})();
