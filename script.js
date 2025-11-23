// script.js — 完全版リファクタ（互換対応・ランダム出題修正版）
// -------------------------------------------------------------
// 改善点の要約:
// - 関数分割で可読性向上
// - 実技（原因/対策）は1つずつ選択（トグル）で色が変わる
// - イベントデリゲーションを利用して再描画コスト低減
// - シャッフル・プール作成の偏りを修正
// - 保存/比較は正規化して行う（大文字化/trim）
// - 新規問題表示時に常に画面上部（問題テキスト上部）から表示されるようスクロールをリセット

/* ===== ユーティリティ ===== */
function loadData(key) {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch (e) { console.error("loadData parse error", e); return []; }
}
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
function normalizeForCompare(s) {
  if (s === null || s === undefined) return "";
  return String(s).trim().replace(/[oＯo〇○]/g, "○").replace(/[xX×✕]/g, "×").toLowerCase();
}
function up(s){ return (s||"").toString().trim().toUpperCase(); }

/* 非破壊シャッフル（Fisher-Yates） */
function shuffleArray(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===== 問題整形（小さい専関数に分割） ===== */
function normalizeImageField(q){
  q._image = q.image || q.img || q.imageData || q._image || null;
  q.image = q.image || q._image || null;
}
function normalizeGakka(q){ if (!Array.isArray(q.choices)) q.choices = []; }
function normalizeJitsugi(q){
  if (!Array.isArray(q.causeChoices) && q.choices && Array.isArray(q.choices.cause)) q.causeChoices = q.choices.cause.slice();
  if (!Array.isArray(q.fixChoices) && q.choices && Array.isArray(q.choices.fix)) q.fixChoices = q.choices.fix.slice();
  if ((!q.answerCause || !q.answerFix) && q.answer && typeof q.answer === 'object'){
    if (!q.answerCause && q.answer.cause) q.answerCause = q.answer.cause;
    if (!q.answerFix && q.answer.fix) q.answerFix = q.answer.fix;
  }
  if (q.answerCause && typeof q.answerCause === 'string') q.answerCause = q.answerCause.toUpperCase();
}
function normalizeQuestionShape(q){
  if (!q || typeof q !== 'object') return null;
  const copy = Object.assign({}, q);
  normalizeImageField(copy);
  if (copy.type === 'gakka') normalizeGakka(copy);
  if (copy.type === 'jitsugi') normalizeJitsugi(copy);
  return copy;
}

/* ===== ページ判定 ===== */
function isIndexPage(){ return !!document.getElementById('startForm'); }
function isQuizPage(){ return !!document.getElementById('quizArea'); }
function isMyQuestionsPage(){ return !!document.getElementById('addQuestionForm'); }
function isResultPage(){ return !!document.getElementById('scoreText'); }

/* ===== シングルトン風フィードバック（再利用） ===== */
const Feedback = (function(){
  let el = null;
  function ensure(){
    if (!el){ el = document.createElement('div'); el.className = 'result-popup';
      el.style.position = 'fixed'; el.style.left='50%'; el.style.top='18%'; el.style.transform='translateX(-50%)';
      el.style.padding='12px 18px'; el.style.borderRadius='8px'; el.style.zIndex = 9999; el.style.fontWeight = '700';
      el.style.boxShadow = '0 6px 18px rgba(0,0,0,.25)'; el.style.color = '#fff';
      document.body.appendChild(el);
    }
  }
  return {
    show: function(ok, text){ ensure(); el.style.backgroundColor = ok ? '#1b7a33' : '#cc3b2f'; el.textContent = text || (ok? '正解！' : '不正解…');
      el.style.opacity = '1'; clearTimeout(el._hidetimer); el._hidetimer = setTimeout(()=>{ el.style.opacity = '0'; }, 900);
    }
  };
})();

/* ========== quiz.html ロジック ========== */
if (isQuizPage()){
  (function initQuiz(){
    const quizArea = document.getElementById('quizArea');
    const timerElem = document.getElementById('timer');
    const qTextElem = document.getElementById('questionText');
    const choicesElem = document.getElementById('choices');

    // 設定
    const rawSetting = JSON.parse(localStorage.getItem('quizSetting') || '{}');
    const setting = {
      type: rawSetting.type,
      num: parseInt(rawSetting.num || rawSetting.count || 10, 10) || 10,
      time: (rawSetting.time === 0 || rawSetting.time === '0') ? 0 : parseInt(rawSetting.time || 0, 10) || 0,
      mode: rawSetting.mode || rawSetting.answerMode || 'auto'
    };
    if (!setting || !setting.type){ quizArea.innerHTML = '<p>出題設定が見つかりません。トップから設定してください。</p>'; return; }

    // load & normalize
    let raw = loadData('myQuestions');
    raw = (Array.isArray(raw) ? raw : []).map(q => normalizeQuestionShape(q)).filter(q => q && q.question);
    const all = raw.filter(q => q.type === setting.type);
    if (all.length === 0){ quizArea.innerHTML = `<p>選択した区分（${setting.type==='gakka'?'学科':'実技'}）の問題が登録されていません。</p>`; return; }

    // プール作成: each iteration shuffle a fresh copy to avoid bias
    const need = Math.max(1, parseInt(setting.num || 10, 10));
    let pool = [];
    while (pool.length < need){ pool = pool.concat(shuffleArray(all.slice())); }
    const questions = pool.slice(0, need);

    // state
    let idx = 0, correctCount = 0, wrongList = [], timerId = null;
    let remaining = (typeof setting.time === 'number') ? setting.time : parseInt(setting.time || 0, 10);

    // timer
    function startTimer(){
      if (remaining > 0){ timerElem.textContent = formatTime(remaining); timerId = setInterval(()=>{ remaining--; timerElem.textContent = formatTime(remaining); if (remaining <= 0){ clearInterval(timerId); finishQuiz(); } }, 1000); }
      else timerElem.textContent = '制限なし';
    }
    startTimer();

    // show
    function showQuestion(){
      const q = questions[idx]; if (!q){ finishQuiz(); return; }
      const qn = normalizeQuestionShape(q); qn.image = qn.image || qn._image || null;
      qTextElem.textContent = qn.question || '';
      choicesElem.innerHTML = '';
      if (qn.type === 'gakka') renderGakka(qn); else renderJitsugi(qn);

      // === ここが今回の修正箇所: 新しい問題表示時に常に上から始める処理 ===
      // 問題テキストを画面上部に揃える（ページスクロール）
      try {
        // 優先して問題テキストを先頭に持ってくる
        if (qTextElem && typeof qTextElem.scrollIntoView === 'function') {
          qTextElem.scrollIntoView({ behavior: 'auto', block: 'start' });
        } else {
          // フォールバックでページトップへ移動
          window.scrollTo(0, 0);
        }
      } catch (e) { /* ignore */ }
      // 選択肢コンテナの縦スクロールをリセット（もし選択肢領域がスクロール可能なら先頭へ）
      try { if (choicesElem) { choicesElem.scrollTop = 0; } } catch(e){ /* ignore */ }
      // ==================================================================
    }

    /* ---- 学科 ---- */
    function renderGakka(qn){
      const choices = (Array.isArray(qn.choices) && qn.choices.length > 0) ? qn.choices.slice() : ['○','×'];
      const labels = ['A','B','C','D'];
      const frag = document.createDocumentFragment();
      choices.forEach((c,i)=>{
        const btn = document.createElement('button'); btn.className='choiceBtn'; btn.type='button';
        btn.textContent = `${labels[i]}. ${c}`; btn.dataset.label = labels[i]; btn.dataset.choiceText = c; btn.dataset.role = 'gakka';
        frag.appendChild(btn);
      });
      choicesElem.appendChild(frag);
    }

    /* ---- 実技 ---- */
    function renderJitsugi(qn){
      const causeLabels = ['A','B','C','D','E','F','G','H'];
      const fixLabels = ['1','2','3','4','5','6','7','8'];

      // prepare wrappers
      const imgFrag = document.createDocumentFragment();
      if (qn.image){ const img = document.createElement('img'); img.src = qn.image; img.className='quiz-image'; imgFrag.appendChild(img); }

      const causeWrap = document.createElement('div'); causeWrap.className='jitsugi-cause-wrap'; causeWrap.innerHTML = '<h4>原因（A〜H）</h4>';
      const fixWrap = document.createElement('div'); fixWrap.className='jitsugi-fix-wrap'; fixWrap.innerHTML = '<h4>対策（1〜8）</h4>';

      // ensure indexes match label mapping: keep positions (empty entries allowed)
      const causeArr = Array.isArray(qn.causeChoices) ? qn.causeChoices.slice() : [];
      const fixArr = Array.isArray(qn.fixChoices) ? qn.fixChoices.slice() : [];

      for (let i=0;i<causeLabels.length;i++){
        const txt = (causeArr[i]!==undefined) ? causeArr[i] : '';
        if (!txt){
          continue;
        }
        const b = document.createElement('button'); b.type='button'; b.className='causeBtn';
        b.textContent = `${causeLabels[i]}. ${txt}`; b.dataset.label = causeLabels[i]; b.dataset.text = txt; b.dataset.role='cause';
        causeWrap.appendChild(b);
      }

      for (let i=0;i<fixLabels.length;i++){
        const txt = (fixArr[i]!==undefined) ? fixArr[i] : '';
        if (!txt) continue;
        const b = document.createElement('button'); b.type='button'; b.className='fixBtn';
        b.textContent = `${fixLabels[i]}. ${txt}`; b.dataset.label = fixLabels[i]; b.dataset.text = txt; b.dataset.role='fix';
        fixWrap.appendChild(b);
      }

      // append in order: image -> cause -> fix
      choicesElem.appendChild(imgFrag);
      choicesElem.appendChild(causeWrap);
      choicesElem.appendChild(fixWrap);

      // initialize selection state on wrapper for delegation
      causeWrap._selected = null; fixWrap._selected = null;
    }

    /* ---- 共通: デリゲーションでクリック制御 ---- */
    choicesElem.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button'); if (!btn) return;
      const role = btn.dataset.role;
      if (!role) return;

      const q = questions[idx]; const qn = normalizeQuestionShape(q);

      if (role === 'gakka'){
        // find label
        const label = btn.dataset.label;
        const stored = qn.answer; const answerMissing = (stored===null||stored===undefined||stored==='');
        if (answerMissing){ persistAnswerForGakka(q.id, label); Feedback.show(true,'正解（未設定だったため、あなたの答えを保存しました）'); correctCount++; setTimeout(nextOrFinish, setting.mode==='alert'?100:1200); return; }
        // compare
        let isCorrect = false; const storedStr = String(stored).trim();
        if (/^[A-D]$/i.test(storedStr)) isCorrect = label.toUpperCase() === storedStr.toUpperCase();
        else isCorrect = normalizeForCompare(btn.dataset.choiceText) === normalizeForCompare(storedStr);
        handleResult(isCorrect, qn);
        return;
      }

      // 実技: ボタンは cause または fix
      // 親ラップを見つけ、トグル処理・選択保持
      if (role === 'cause' || role === 'fix'){
        // find wrapper
        const wrapper = btn.closest('.jitsugi-cause-wrap') || btn.closest('.jitsugi-fix-wrap');
        if (!wrapper) return; // safety

        // determine separate causeWrap and fixWrap
        const causeWrap = choicesElem.querySelector('.jitsugi-cause-wrap');
        const fixWrap = choicesElem.querySelector('.jitsugi-fix-wrap');

        if (role === 'cause'){
          const prev = causeWrap.querySelector('.causeBtn.selected');
          if (prev === btn){ btn.classList.remove('selected'); causeWrap._selected = null; } else { if (prev) prev.classList.remove('selected'); btn.classList.add('selected'); causeWrap._selected = btn; }
        } else {
          const prev = fixWrap.querySelector('.fixBtn.selected');
          if (prev === btn){ btn.classList.remove('selected'); fixWrap._selected = null; } else { if (prev) prev.classList.remove('selected'); btn.classList.add('selected'); fixWrap._selected = btn; }
        }

        // if both selected -> evaluate
        const selCauseBtn = causeWrap.querySelector('.causeBtn.selected');
        const selFixBtn = fixWrap.querySelector('.fixBtn.selected');
        if (selCauseBtn && selFixBtn){
          const sel = { causeLabel: selCauseBtn.dataset.label, fixLabel: selFixBtn.dataset.label };
          evaluateJitsugi(sel, qn);
        }
      }
    });

    /* ---- 実技採点（自動保存含む） ---- */
    function evaluateJitsugi(sel, qn){
      const storedCause = (qn.answerCause !== undefined && qn.answerCause !== null) ? String(qn.answerCause).trim().toUpperCase() : '';
      const storedFix = (qn.answerFix !== undefined && qn.answerFix !== null) ? String(qn.answerFix).trim() : '';
      const answerMissing = (!storedCause || !storedFix);
      if (answerMissing){ // save normalized
        persistAnswerForJitsugi(qn.id, String(sel.causeLabel).toUpperCase(), String(sel.fixLabel));
        Feedback.show(true, '正解（未設定だったため、あなたの組合せを保存しました）'); correctCount++; setTimeout(nextOrFinish, setting.mode==='alert'?100:1200); return;
      }
      const ok = (String(sel.causeLabel).toUpperCase() === String(storedCause).toUpperCase()) && (String(sel.fixLabel) === String(storedFix));
      handleResult(ok, qn);
    }

    /* ---- 結果共通 ---- */
    function handleResult(isCorrect, qn){ if (isCorrect){ Feedback.show(true,'正解！'); correctCount++; } else { Feedback.show(false,'不正解…'); wrongList.push(qn); }
      if (setting.mode === 'alert'){ setTimeout(()=>{ alert(isCorrect ? '正解！' : '不正解…'); nextOrFinish(); }, 120); } else { setTimeout(nextOrFinish, 1200); }
    }

    function nextOrFinish(){ idx++; if (idx >= questions.length) finishQuiz(); else showQuestion(); }
    function finishQuiz(){ if (timerId) clearInterval(timerId); const result = { score: correctCount, total: questions.length, wrong: wrongList }; localStorage.setItem('quizResult', JSON.stringify(result)); window.location.href = 'result.html'; }
    function formatTime(sec){ const m = Math.floor(sec/60).toString().padStart(2,'0'); const s = (sec%60).toString().padStart(2,'0'); return `${m}:${s}`; }

    /* ---- 永続化ヘルパ ---- */
    function persistAnswerForGakka(id, answerLetterOrMark){
      const data = loadData('myQuestions'); let changed = false; const newData = data.map(item => { if (item && item.id === id){ item.answer = answerLetterOrMark; changed = true; } return item; }); if (changed) saveData('myQuestions', newData);
    }
    function persistAnswerForJitsugi(id, answerCauseLabel, answerFixLabel){
      const data = loadData('myQuestions'); let changed = false; const newData = data.map(item => { if (item && item.id === id){ item.answerCause = String(answerCauseLabel).toUpperCase(); item.answerFix = String(answerFixLabel); changed = true; } return item; }); if (changed) saveData('myQuestions', newData);
    }

    // init
    showQuestion();
  })();
}

/* ===== my-questions.html（保存・リスト処理） ===== */
if (isMyQuestionsPage()){
  (function initMyQuestions(){
    const form = document.getElementById('addQuestionForm');
    const questionType = document.getElementById('questionType');
    const previewImage = document.getElementById('previewImage');
    const questionList = document.getElementById('questionList');

    function syncTypeDisplay(){ if (!questionType) return; const choicesContainer = document.getElementById('choicesContainer'); const jitsugiContainer = document.getElementById('jitsugiContainer'); if (questionType.value === 'gakka'){ if (choicesContainer) choicesContainer.style.display='block'; if (jitsugiContainer) jitsugiContainer.style.display='none'; } else { if (choicesContainer) choicesContainer.style.display='none'; if (jitsugiContainer) jitsugiContainer.style.display='block'; } }
    syncTypeDisplay(); if (questionType) questionType.addEventListener('change', syncTypeDisplay);

    const imageInput = document.getElementById('imageInput');
    if (imageInput){ imageInput.addEventListener('change', ()=>{ const f = imageInput.files[0]; if (!f){ if (previewImage) previewImage.style.display='none'; return; } const r = new FileReader(); r.onload = e => { if (previewImage){ previewImage.src = e.target.result; previewImage.style.display='block'; } }; r.readAsDataURL(f); }); }

    if (form){ form.addEventListener('submit', (e)=>{ e.preventDefault(); const type = (questionType && questionType.value) || 'gakka'; const questionText = (document.getElementById('questionText').value||'').trim(); const explanation = (document.getElementById('explanationInput').value||'').trim(); if (!questionText){ alert('問題文を入力してください'); return; }
      let data = loadData('myQuestions');
      if (type === 'gakka'){
        const A = (document.getElementById('choiceA').value||'').trim(); const B = (document.getElementById('choiceB').value||'').trim(); const C = (document.getElementById('choiceC').value||'').trim(); const D = (document.getElementById('choiceD').value||'').trim(); const choices = [A,B,C,D].filter(x=>x);
        const savedAnswer = ((document.getElementById('answerInput').value||'').trim() || null);
        const newQ = { id: crypto.randomUUID(), type: 'gakka', question: questionText, choices, answer: savedAnswer, explanation };
        data.push(newQ); saveData('myQuestions', data); alert('学科問題を追加しました'); form.reset(); if (previewImage) previewImage.style.display='none'; renderList(); return;
      }

      // jitsugi 保存
      const f = (document.getElementById('imageInput').files && document.getElementById('imageInput').files[0]) || null;
      const doSaveJitsugi = (imageData)=>{
        const causeKeys = ['causeA','causeB','causeC','causeD','causeE','causeF','causeG','causeH'];
        const fixKeys = ['fix1','fix2','fix3','fix4','fix5','fix6','fix7','fix8'];
        const causeElemsExist = causeKeys.some(k => !!document.getElementById(k));
        const fixElemsExist = fixKeys.some(k => !!document.getElementById(k));
        let causeChoices = [], fixChoices = [];
        if (causeElemsExist){ causeChoices = causeKeys.map(k => (document.getElementById(k) && document.getElementById(k).value) ? document.getElementById(k).value.trim() : '').filter(s=>s); }
        else if (document.getElementById('causeChoicesInput')){ const raw = (document.getElementById('causeChoicesInput').value||'').trim(); causeChoices = raw.length ? raw.split(/[\r\n,]+/).map(s=>s.trim()).filter(s=>s) : []; }
        if (fixElemsExist){ fixChoices = fixKeys.map(k => (document.getElementById(k) && document.getElementById(k).value) ? document.getElementById(k).value.trim() : '').filter(s=>s); }
        else if (document.getElementById('fixChoicesInput')){ const raw = (document.getElementById('fixChoicesInput').value||'').trim(); fixChoices = raw.length ? raw.split(/[\r\n,]+/).map(s=>s.trim()).filter(s=>s) : []; }
        const answerCause = (document.getElementById('answerInputCause').value||'').trim().toUpperCase() || null;
        const answerFix = (document.getElementById('answerInputFix').value||'').trim() || null;
        const newQ = { id: crypto.randomUUID(), type: 'jitsugi', question: questionText, image: imageData||null, causeChoices, fixChoices, answerCause, answerFix, explanation };
        data.push(newQ); saveData('myQuestions', data); alert('実技問題を追加しました'); form.reset(); if (previewImage) previewImage.style.display='none'; renderList();
      };
      if (f){ const reader = new FileReader(); reader.onload = (ev)=>{ const imageData = ev.target ? ev.target.result : null; doSaveJitsugi(imageData); }; reader.readAsDataURL(f); }
      else doSaveJitsugi(null);
    }); }

    function renderList(){ let data = loadData('myQuestions') || []; const valid = data.filter(item => item && item.id && item.question); if (valid.length !== data.length){ saveData('myQuestions', valid); data = valid; }
      const filterType = document.getElementById('filterType'); const keyword = (document.getElementById('searchInput').value||'').trim().toLowerCase(); const filtered = data.filter(q => { if (!q) return false; const ft = filterType ? filterType.value : 'all'; if (ft !== 'all' && q.type !== ft) return false; if (!keyword) return true; return (q.question && q.question.toLowerCase().includes(keyword)) || (q.explanation && q.explanation.toLowerCase().includes(keyword)); });
      questionList.innerHTML = '';
      if (!filtered.length){ questionList.innerHTML = '<li>登録された問題はありません。</li>'; return; }
      const frag = document.createDocumentFragment(); filtered.forEach(q =>{ const li = document.createElement('li'); li.className='question-item'; li.innerHTML = `<div><strong>${q.question}</strong><br><small>${q.type==='gakka'?'学科':'実技'}</small></div><button class="deleteBtn" data-id="${q.id}">削除</button>`; frag.appendChild(li); }); questionList.appendChild(frag);
      questionList.querySelectorAll('.deleteBtn').forEach(btn => { btn.addEventListener('click', ()=>{ const id = btn.dataset.id; const newData = (loadData('myQuestions')||[]).filter(x => x.id !== id); saveData('myQuestions', newData); renderList(); }); });
    }

    const filterTypeElem = document.getElementById('filterType'); const searchInput = document.getElementById('searchInput'); if (filterTypeElem) filterTypeElem.addEventListener('change', renderList); if (searchInput) searchInput.addEventListener('input', renderList);
    renderList();
  })();
}

/* ===== result.html ===== */
if (isResultPage()){
  (function initResult(){ const resultObj = JSON.parse(localStorage.getItem('quizResult') || '{}'); const scoreText = document.getElementById('scoreText'); const wrongListElem = document.getElementById('wrongList'); if (!resultObj || !resultObj.total){ scoreText.textContent = '結果データがありません。'; return; } const percent = ((resultObj.score / resultObj.total) * 100).toFixed(1); scoreText.textContent = `あなたの得点：${resultObj.total}問中 ${resultObj.score}問正解（${percent}%）`; wrongListElem.innerHTML = ''; if (resultObj.wrong && resultObj.wrong.length > 0){ resultObj.wrong.forEach(w => { const li = document.createElement('li'); li.innerHTML = `<strong>${w.question || '(問題文なし)'}</strong><br><small>正解：${w.answer || (w.answerCause ? (w.answerCause + ' / ' + w.answerFix) : '―')}</small>`; wrongListElem.appendChild(li); }); } else { wrongListElem.innerHTML = '<li>全問正解です！🎉</li>'; } })();
}

document.getElementById("exportJsonBtn").addEventListener("click", () => {
    const data = JSON.parse(localStorage.getItem("myQuestions") || "[]");

    if (data.length === 0) {
        alert("エクスポートできる問題データがありません！");
        return;
    }

    const jsonStr = JSON.stringify(data, null, 2);

    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "myquestions.json";
    a.click();

    URL.revokeObjectURL(url);
});

// JSON 読み込み（インポート）
document.getElementById("importJsonBtn")?.addEventListener("click", () => {
    document.getElementById("importJsonInput").click();
});

document.getElementById("importJsonInput")?.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const json = JSON.parse(e.target.result);
            localStorage.setItem("myQuestions", JSON.stringify(json));
            alert("JSONを読み込みました！");
            location.reload(); // リロードして反映
        } catch (err) {
            alert("JSONの読み込みに失敗しました");
        }
    };
    reader.readAsText(file);
});

// 🔽 GitHub の JSON を読み込んで localStorage に保存する機能
async function loadMyQuestionsFromGitHub() {
    const url = "https://yuno716.github.io/-/myquestions.json";

    try {
        const response = await fetch(url + "?t=" + Date.now()); 
        const data = await response.json();

        // JSON を localStorage に保存
        localStorage.setItem("myQuestions", JSON.stringify(data));

        console.log("GitHub の JSON を読み込みました！");
    } catch (err) {
        console.error("JSON読み込みエラー：", err);
    }
}
