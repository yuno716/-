// script.js — 完全統合版（学科＋11分類・保存一覧・編集・削除・検索・カテゴリフィルタ）
// 最小限のコメントで可読性を確保

/* ===== ユーティリティ ===== */
function loadData(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch (e) { console.error('loadData parse error', e); return []; }
}
function saveData(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function normalizeForCompare(s){ if (s === null || s === undefined) return ''; return String(s).trim().replace(/[oＯo〇○]/g,'○').replace(/[xX×✕]/g,'×').toLowerCase(); }
function shuffleArray(arr){ const a = arr.slice(); for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ===== ページ判定 ===== */
function isMyQuestionsPage(){ return !!document.getElementById('myQuestionForm'); }
function isQuizPage(){ return !!document.getElementById('quizArea'); }
function isResultPage(){ return !!document.getElementById('scoreText'); }

/* ===== フィードバック（簡易） ===== */
const Feedback = (function(){ let el=null; function ensure(){ if(!el){ el=document.createElement('div'); el.id='feedbackPopup'; el.style.position='fixed'; el.style.left='50%'; el.style.top='14%'; el.style.transform='translateX(-50%)'; el.style.padding='8px 12px'; el.style.borderRadius='8px'; el.style.zIndex=9999; el.style.fontWeight='700'; el.style.boxShadow='0 6px 18px rgba(0,0,0,.25)'; el.style.color='#fff'; el.style.transition='opacity .25s'; el.style.opacity=0; document.body.appendChild(el);} }
  return { show(ok, text){ ensure(); el.style.backgroundColor = ok ? '#1b7a33' : '#cc3b2f'; el.textContent = text || (ok?'正解！':'不正解…'); el.style.opacity=1; clearTimeout(el._hidetimer); el._hidetimer=setTimeout(()=>{ el.style.opacity=0; },900); } };
})();

/* ===== my-questions: 動的フォーム＋一覧 ===== */
if (isMyQuestionsPage()){
  (function(){
    const form = document.getElementById('myQuestionForm');
    const category = document.getElementById('questionCategory');
    const dynamic = document.getElementById('dynamicFields');
    const savedListContainer = document.getElementById('savedQuestionsList');

    // helper to create nodes
    function el(tag, attrs, children){ const e = document.createElement(tag); (attrs||{}); for (const k in (attrs||{})){ if(k==='text'){ e.textContent = attrs[k]; } else { e.setAttribute(k, attrs[k]); } } (children||[]).forEach(ch=>{ if(typeof ch === 'string') e.appendChild(document.createTextNode(ch)); else e.appendChild(ch); }); return e; }

    // image field with preview
    function createImageField(idPrefix){ const wrap = el('div', {class: 'field image-field'}); const label = el('label', {text: '画像（任意）'}); const input = el('input', {type:'file', id: idPrefix + '_image', accept:'image/*'}); const img = el('img', {id:idPrefix + '_preview'}); img.style.maxWidth='240px'; img.style.display='none'; img.style.marginTop='8px'; input.addEventListener('change', ()=>{ const f = input.files && input.files[0]; if(!f){ img.style.display='none'; img.src=''; return; } const r = new FileReader(); r.onload = e => { img.src = e.target.result; img.style.display = 'block'; }; r.readAsDataURL(f); }); wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(img); return wrap; }

    // choices block builder
    function createChoicesBlock(count, labelBase, letter, idPrefix, role){ const wrap = el('div', {class: 'field choices-block'}); wrap.appendChild(el('h4', {text: labelBase})); const grid = el('div', {class: 'choice-grid'}); for(let i=0;i<count;i++){ const idxLabel = letter ? String.fromCharCode(65+i) : String(i+1); const input = el('input', {type:'text', id:`${idPrefix}_${i}`, 'data-role': role, placeholder: idxLabel}); const radio = el('input', {type:'radio', name:`${idPrefix}_answer`, id:`${idPrefix}_ans_${i}`, 'data-role-answer': role}); const radioLabel = el('label', {}, [radio, document.createTextNode(' 正解')]); const row = el('div', {class:'choice-row'}); row.appendChild(el('label', {text: idxLabel + '. '})); row.appendChild(input); row.appendChild(radioLabel); grid.appendChild(row); } wrap.appendChild(grid); return wrap; }

    // select builder for pump1
    function createSelectChoices(count, labelBase, idPrefix){ const wrap = el('div', {class:'field select-choices'}); wrap.appendChild(el('h4', {text: labelBase})); const select = el('select', {id: idPrefix + '_select'}); select.appendChild(el('option', {value:'', text:'--- 選択 ---'})); for(let i=0;i<count;i++){ select.appendChild(el('option', {value:String(i), text: String(i+1)})); } wrap.appendChild(select); return wrap; }

    // generators per category
    function clearDynamic(){ dynamic.innerHTML=''; }

    function genGakka(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); const oxWrap = el('div',{class:'field ox-field'}); oxWrap.appendChild(el('h4',{text:'OX (○/×)'})); ['○','×'].forEach((v,i)=>{ const r = el('input',{type:'radio', name:'oxAnswer', id:`ox_${i}`, value:v}); oxWrap.appendChild(el('label',{},[r, document.createTextNode(' ' + v)])); }); dynamic.appendChild(oxWrap); dynamic.appendChild(createChoicesBlock(4,'4択（A〜D）', true, 'gakka_choice', 'gakka')); renderSavedList(); }

    function genJitsugiImageBasic(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('jitsugi')); dynamic.appendChild(createChoicesBlock(11,'名称（A〜K）', true, 'jb_name','nameChoices')); dynamic.appendChild(createChoicesBlock(8,'原因（1〜8）', false, 'jb_cause','causeChoices')); dynamic.appendChild(createChoicesBlock(8,'対策（a〜h）', false, 'jb_fix','fixChoices')); renderSavedList(); }

    function genPump1(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createChoicesBlock(15,'名称（A〜O）', true, 'p1_name','nameChoices')); const descBlock = el('div',{class:'field desc-block'}); descBlock.appendChild(el('h4',{text:'説明（1〜15）'})); for(let i=0;i<15;i++){ descBlock.appendChild(el('input',{type:'text', id:`p1_desc_${i}`, 'data-role':'descChoices', placeholder:String(i+1)})); } descBlock.appendChild(el('p',{text:'正解 — 説明1 を選択'})); descBlock.appendChild(createSelectChoices(15,'説明1 選択','p1_desc1')); descBlock.appendChild(el('p',{text:'正解 — 説明2 を選択'})); descBlock.appendChild(createSelectChoices(15,'説明2 選択','p1_desc2')); dynamic.appendChild(descBlock); renderSavedList(); }

    function genPump2(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createChoicesBlock(16,'原因（A〜P）', true, 'p2_cause','causeChoices')); dynamic.appendChild(createChoicesBlock(16,'対策（1〜16）', false, 'p2_fix','fixChoices')); renderSavedList(); }

    function genBroken(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('broken')); dynamic.appendChild(createChoicesBlock(6,'名称（A〜F）', true, 'b_name','nameChoices')); dynamic.appendChild(createChoicesBlock(6,'内容（1〜6）', false, 'b_detail','descChoices')); renderSavedList(); }

    function genSeal(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('seal')); dynamic.appendChild(createChoicesBlock(10,'名称（A〜J）', true, 's_name','nameChoices')); dynamic.appendChild(createChoicesBlock(10,'特徴（1〜10）', false, 's_feature','featureChoices')); dynamic.appendChild(createChoicesBlock(10,'用途（a〜j）', false, 's_usage','usageChoices')); renderSavedList(); }

    function genKeypin(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('keypin')); dynamic.appendChild(createChoicesBlock(9,'名称（A〜I）', true, 'k_name','nameChoices')); dynamic.appendChild(createChoicesBlock(9,'特徴（1〜9）', false, 'k_feature','featureChoices')); dynamic.appendChild(createChoicesBlock(9,'用途（a〜i）', false, 'k_usage','usageChoices')); renderSavedList(); }

    function genValve1(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('v1')); dynamic.appendChild(createChoicesBlock(6,'名称（A〜F）', true, 'v1_name','nameChoices')); dynamic.appendChild(createChoicesBlock(6,'特徴・用途（1〜6）', false, 'v1_detail','featureChoices')); renderSavedList(); }

    function genValve2(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('v2')); dynamic.appendChild(createChoicesBlock(5,'操作（A〜E）', true, 'v2_op','nameChoices')); renderSavedList(); }

    function genValve3(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createImageField('v3')); dynamic.appendChild(createChoicesBlock(4,'現象（A〜D）', true, 'v3_phen','phenomenonChoices')); dynamic.appendChild(createChoicesBlock(4,'原因（1〜4）', false, 'v3_cause','causeChoices')); renderSavedList(); }

    function genValve4(){ clearDynamic(); dynamic.appendChild(el('label',{text:'問題文'})); dynamic.appendChild(el('textarea',{id:'questionText', rows:3})); dynamic.appendChild(createChoicesBlock(20,'語弊（A〜T）', true, 'v4_word','nameChoices')); renderSavedList(); }

    const gens = { gakka:genGakka, jitsugi_image_basic:genJitsugiImageBasic, pump1:genPump1, pump2:genPump2, broken:genBroken, seal:genSeal, keypin:genKeypin, valve1:genValve1, valve2:genValve2, valve3:genValve3, valve4:genValve4 };

    category.addEventListener('change', ()=>{ const v = category.value; if(!v){ clearDynamic(); return; } const fn = gens[v]; if(fn) fn(); else clearDynamic(); });

    // collect form data
    function collect(){ const out = {}; const qTextEl = document.getElementById('questionText'); out.question = qTextEl ? (qTextEl.value||'').trim() : '';
      const fileInputs = dynamic.querySelectorAll('input[type=file]'); if(fileInputs.length>0){ const f = fileInputs[0].files && fileInputs[0].files[0]; out._imageFile = f || null; }
      const textInputs = Array.from(dynamic.querySelectorAll('input[type=text]'));
      textInputs.forEach(inp=>{ const role = inp.getAttribute('data-role'); if(!role) return; out[role] = out[role] || []; out[role].push((inp.value||'').trim()); });
      const radios = Array.from(dynamic.querySelectorAll('input[type=radio]'));
      radios.forEach(r=>{ if(!r.name) return; if(r.checked){ const role = r.getAttribute('data-role-answer') || r.getAttribute('data-role') || r.name; out.answers = out.answers || {}; out.answers[role] = r.id; } });
      const selects = Array.from(dynamic.querySelectorAll('select'));
      selects.forEach(s=>{ if(!s.id) return; out.selects = out.selects || {}; out.selects[s.id] = s.value; });
      const exp = document.getElementById('explanationInput'); if(exp) out.explanation = (exp.value||'').trim();
      return out;
    }

    function readFileAsDataURL(file){ return new Promise((res)=>{ if(!file) return res(null); const r = new FileReader(); r.onload = e=> res(e.target.result); r.onerror = ()=> res(null); r.readAsDataURL(file); }); }

    // save (handles new and edit)
    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault(); const editId = form.getAttribute('data-edit-id'); const type = category.value; if(!type){ alert('区分を選んでください'); return; }
      const data = collect(); if(!data.question){ alert('問題文を入力してください'); return; }
      let all = loadData('myQuestions') || [];
      const id = editId || ((crypto && crypto.randomUUID) ? crypto.randomUUID() : 'id_' + Date.now());
      const qObj = { id:id, type: (type==='gakka'?'gakka':'jitsugi'), category: (type==='jitsugi_image_basic'?'jitsugi_image_basic': type), question: data.question, explanation: data.explanation || '' };
      if(data._imageFile){ qObj.image = await readFileAsDataURL(data._imageFile); }
      if(!qObj.image && editId){ const existing = all.find(x=> x && x.id === editId); if(existing && existing.image) qObj.image = existing.image; }
      ['nameChoices','descChoices','featureChoices','usageChoices','causeChoices','fixChoices','phenomenonChoices','gakka'].forEach(k=>{ if(data[k] && data[k].length>0) qObj[k]=data[k]; });
      if(data.answers){ Object.keys(data.answers).forEach(rid=>{ const checkedId = data.answers[rid]; const elChecked = document.getElementById(checkedId); if(!elChecked) return; const m = checkedId.match(/(.+)_ans_(\d+)$/); if(m){ const prefix = m[1]; const idx = parseInt(m[2],10); if(prefix.startsWith('gakka_choice')){ qObj.answer = (idx<4? ['A','B','C','D'][idx] : null); } else if(prefix.startsWith('jb_name') || prefix.startsWith('p1_name') || prefix.startsWith('s_name') || prefix.startsWith('k_name') || prefix.startsWith('v1_name') || prefix.startsWith('v2_op') || prefix.startsWith('v3_phen') || prefix.startsWith('v4_word') || prefix.startsWith('b_name')){ qObj.answerName = String.fromCharCode(65 + idx); } else if(prefix.includes('cause')){ qObj.answerCause = String(idx+1); } else if(prefix.includes('fix') || prefix.includes('detail') || prefix.includes('feature')){ qObj.answerFix = String(idx+1); } else if(prefix.includes('s_usage') || prefix.includes('k_usage')){ qObj.answerUsage = String.fromCharCode(97 + idx); } } }); }
      if(data.selects){ Object.keys(data.selects).forEach(k=>{ const v = data.selects[k]; if(!v) return; if(k==='p1_desc1_select'){ qObj.answerDesc = qObj.answerDesc || []; qObj.answerDesc[0] = Number(v); } if(k==='p1_desc2_select'){ qObj.answerDesc = qObj.answerDesc || []; qObj.answerDesc[1] = Number(v); } }); }
      const roleMap = { 'nameChoices':'nameChoices', 'descChoices':'descChoices','featureChoices':'featureChoices','usageChoices':'usageChoices','causeChoices':'causeChoices','fixChoices':'fixChoices','phenomenonChoices':'phenomenonChoices','gakka':'choices' };
      Object.keys(roleMap).forEach(r=>{ const val = data[r]; if(val && val.length>0){ qObj[roleMap[r]] = val; } });

      if(editId){ all = all.map(x=> x && x.id===editId ? qObj : x); form.removeAttribute('data-edit-id'); } else { all.push(qObj); }
      saveData('myQuestions', all);
      alert('問題を保存しました'); form.reset(); clearDynamic(); renderSavedList();
    });

    // render saved list with search & filter
    function renderSavedList(filterText, filterCategory){ savedListContainer.innerHTML=''; filterText = (filterText||'').toLowerCase(); filterCategory = filterCategory || '';
      const all = loadData('myQuestions') || [];
      const controls = el('div',{class:'saved-controls'});
      const search = el('input',{type:'search', placeholder:'検索（問題文・選択肢）', id:'savedListSearch'});
      const cat = el('select',{id:'savedListCat'});
      cat.appendChild(el('option',{value:'', text:'全カテゴリ'})); const labels = { gakka:'学科', jitsugi_image_basic:'実技', pump1:'ポンプ1', pump2:'ポンプ2', broken:'部品破断面', seal:'密封装置', keypin:'キー・ピン', valve1:'弁1', valve2:'弁2', valve3:'弁3', valve4:'弁4' };
      Object.keys(labels).forEach(k=> cat.appendChild(el('option',{value:k, text:labels[k]})));
      if(filterCategory) cat.value = filterCategory;
      if(filterText) search.value = filterText;
      const refresh = el('button',{type:'button'},['更新']); controls.appendChild(search); controls.appendChild(cat); controls.appendChild(refresh); savedListContainer.appendChild(controls);

      const list = el('div',{class:'saved-list'});
      const filtered = all.filter(it=>{ if(!it || !it.question) return false; if(filterCategory && it.category !== filterCategory) return false; if(!filterText) return true; const hay = (it.question + ' ' + (it.nameChoices||[]).join(' ') + ' ' + (it.descChoices||[]).join(' ') + ' ' + (it.causeChoices||[]).join(' ') + ' ' + (it.fixChoices||[]).join(' ')).toLowerCase(); return hay.indexOf(filterText) !== -1; });

      if(filtered.length===0){ list.appendChild(el('p',{text:'該当する問題はありません。'})); }
      filtered.forEach(it=>{ const card = el('div',{class:'saved-card'});
        const qdiv = el('div',{class:'saved-q'}); qdiv.appendChild(el('strong',{text: labels[it.category] || it.category || 'カテゴリ'})); qdiv.appendChild(el('div',{text: it.question})); card.appendChild(qdiv);
        if(it.image){ const img = el('img',{src: it.image}); img.style.maxWidth='120px'; img.style.display='block'; img.style.marginTop='6px'; card.appendChild(img); }
        const btns = el('div',{class:'saved-btns'});
        const editBtn = el('button',{type:'button','data-id':it.id},['編集']);
        const delBtn = el('button',{type:'button','data-id':it.id},['削除']);
        btns.appendChild(editBtn); btns.appendChild(delBtn); card.appendChild(btns);
        editBtn.addEventListener('click', ()=> populateFormForEdit(it.id));
        delBtn.addEventListener('click', ()=>{ if(!confirm('この問題を削除しますか？')) return; deleteQuestion(it.id); renderSavedList(search.value.trim(), cat.value); });
        list.appendChild(card);
      });
      savedListContainer.appendChild(list);

      // events
      refresh.addEventListener('click', ()=> renderSavedList(search.value.trim(), cat.value));
      search.addEventListener('input', ()=> renderSavedList(search.value.trim(), cat.value));
      cat.addEventListener('change', ()=> renderSavedList(search.value.trim(), cat.value));
    }

    function deleteQuestion(id){ const data = loadData('myQuestions'); const nd = data.filter(x=> x && x.id !== id); saveData('myQuestions', nd); }

    // populate form for editing
    function populateFormForEdit(id){ const data = loadData('myQuestions'); const it = data.find(x=> x && x.id===id); if(!it){ alert('編集する問題が見つかりません'); return; }
      const cat = it.category || it.type || ''; if(cat && gens[cat]){ category.value = cat; gens[cat](); } else { category.value = ''; clearDynamic(); }
      // allow UI to render
      setTimeout(()=>{
        const qText = document.getElementById('questionText'); if(qText) qText.value = it.question || '';
        // image preview
        const fileInputs = dynamic.querySelectorAll('input[type=file]'); if(fileInputs.length>0 && it.image){ const inp = fileInputs[0]; const preview = document.getElementById(inp.id.replace('_image','_preview')); if(preview){ preview.src = it.image; preview.style.display='block'; } }
        // fill text fields by data-role
        const textInputs = Array.from(dynamic.querySelectorAll('input[type=text]'));
        textInputs.forEach(inp=>{ const role = inp.getAttribute('data-role'); if(!role) return; const arr = it[role] || it[ role === 'gakka' ? 'choices' : role ] || []; const m = inp.id.match(/_(\d+)$/); const idx = m ? Number(m[1]) : null; if(idx !== null && arr && arr[idx] !== undefined) inp.value = arr[idx] || ''; });
        // set radios from stored answers
        if(typeof it.answer === 'string' && it.answer.length>0){ const map = {'A':0,'B':1,'C':2,'D':3}; const pos = map[it.answer.toUpperCase()]; const r = document.getElementById('gakka_choice_ans_' + pos); if(r) r.checked = true; }
        if(it.answerName){ const idx = it.answerName.charCodeAt(0) - 65; const radios = Array.from(dynamic.querySelectorAll('input[type=radio]')).filter(r=> r.getAttribute('data-role-answer')==='nameChoices'); if(radios[idx]) radios[idx].checked = true; }
        if(it.answerCause){ const idx = Number(it.answerCause) - 1; const radios = Array.from(dynamic.querySelectorAll('input[type=radio]')).filter(r=> r.getAttribute('data-role-answer')==='causeChoices'); if(radios[idx]) radios[idx].checked = true; }
        if(it.answerFix){ const idx = Number(it.answerFix) - 1; const radios = Array.from(dynamic.querySelectorAll('input[type=radio]')).filter(r=> r.getAttribute('data-role-answer')==='fixChoices' || r.getAttribute('data-role-answer')==='featureChoices'); if(radios[idx]) radios[idx].checked = true; }
        // mark editing
        form.setAttribute('data-edit-id', it.id);
      }, 60);
    }

    // init
    clearDynamic(); renderSavedList();
  })();
}

/* ===== quiz.html / result.html は既存の処理がある想定：ここではエラーの原因となる箇所を避けるため簡潔化 ===== */
if (isQuizPage()){
    (function initQuiz(){
    const quizArea = document.getElementById('quizArea'); const timerElem = document.getElementById('timer'); const qTextElem = document.getElementById('questionText'); const choicesElem = document.getElementById('choices');

    const rawSetting = JSON.parse(localStorage.getItem('quizSetting')||'{}');
    const setting = { type: rawSetting.type, num: parseInt(rawSetting.num||rawSetting.count||10,10)||10, time: (rawSetting.time===0||rawSetting.time==='0')?0:parseInt(rawSetting.time||0,10)||0, mode: rawSetting.mode||rawSetting.answerMode||'auto' };
    if(!setting || !setting.type){ quizArea.innerHTML = '<p>出題設定が見つかりません。トップから設定してください。</p>'; return; }

    let raw = loadData('myQuestions'); raw = (Array.isArray(raw)?raw:[]).filter(q=>q && q.question && q.type);
    const all = raw.filter(q=> q.type === setting.type);
    if(all.length === 0){ quizArea.innerHTML = `<p>選択した区分（${setting.type==='gakka'?'学科':'実技'}）の問題が登録されていません。</p>`; return; }

    const need = Math.max(1, parseInt(setting.num||10,10)); let pool = [];
    while(pool.length < need) pool = pool.concat(shuffleArray(all.slice()));
    const questions = pool.slice(0,need);

    let idx=0, correctCount=0, wrongList=[], timerId=null;
    let remaining = typeof setting.time === 'number' ? setting.time : parseInt(setting.time||0,10);

    function startTimer(){ if(remaining>0){ timerElem.textContent = formatTime(remaining); timerId = setInterval(()=>{ remaining--; timerElem.textContent = formatTime(remaining); if(remaining<=0){ clearInterval(timerId); finishQuiz(); } },1000);} else timerElem.textContent='制限なし'; }
    startTimer();

    function formatTime(sec){ const m=Math.floor(sec/60).toString().padStart(2,'0'); const s=(sec%60).toString().padStart(2,'0'); return `${m}:${s}`; }

    function showQuestion(){ const q = questions[idx]; if(!q){ finishQuiz(); return; } qTextElem.textContent = q.question || '' ; choicesElem.innerHTML=''; if(q.type === 'gakka'){ renderGakka(q); } else if(q.type === 'jitsugi'){ renderJitsugiGeneric(q); } try{ if(qTextElem && typeof qTextElem.scrollIntoView==='function') qTextElem.scrollIntoView({behavior:'auto', block:'start'}); else window.scrollTo(0,0); }catch(e){}
    }

    function renderGakka(q){ const frag = document.createDocumentFragment(); const choices = q.choices && q.choices.length ? q.choices.slice() : ['○','×']; const labels = ['A','B','C','D']; choices.forEach((c,i)=>{ const btn = document.createElement('button'); btn.type='button'; btn.className='choiceBtn'; btn.textContent = `${labels[i]||i+1}. ${c}`; btn.dataset.choice = c; btn.dataset.label = labels[i]||String(i+1); btn.addEventListener('click', ()=>{ const stored = q.answer; let isCorrect = false; if(!stored){ persistAnswerForGakka(q.id, btn.dataset.label); Feedback.show(true,'正解（未設定のため保存しました）'); correctCount++; setTimeout(nextOrFinish, 800); return; } if(/^[A-D]$/i.test(String(stored))){ isCorrect = btn.dataset.label === String(stored).toUpperCase(); } else { isCorrect = normalizeForCompare(btn.dataset.choice) === normalizeForCompare(stored); } handleResult(isCorrect,q); }); frag.appendChild(btn); }); choicesElem.appendChild(frag); }

    function renderJitsugiGeneric(q){ if(q.image){ const img = document.createElement('img'); img.src = q.image; img.className='quiz-image'; img.style.maxWidth='320px'; img.style.display='block'; img.style.marginBottom='8px'; choicesElem.appendChild(img); }
      const groups = [];
      switch(q.category){
        case 'jitsugi_image_basic': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'causeChoices', label:'原因', type:'single'}); groups.push({key:'fixChoices', label:'対策', type:'single'}); break;
        case 'pump1': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'descChoices', label:'説明', type:'multi', max:2}); break;
        case 'pump2': groups.push({key:'causeChoices', label:'原因', type:'single'}); groups.push({key:'fixChoices', label:'対策', type:'single'}); break;
        case 'broken': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'descChoices', label:'内容', type:'single'}); break;
        case 'seal': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'featureChoices', label:'特徴', type:'single'}); groups.push({key:'usageChoices', label:'用途', type:'single'}); break;
        case 'keypin': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'featureChoices', label:'特徴', type:'single'}); groups.push({key:'usageChoices', label:'用途', type:'single'}); break;
        case 'valve1': groups.push({key:'nameChoices', label:'名称', type:'single'}); groups.push({key:'featureChoices', label:'特徴/用途', type:'single'}); break;
        case 'valve2': groups.push({key:'nameChoices', label:'操作', type:'single'}); break;
        case 'valve3': groups.push({key:'phenomenonChoices', label:'現象', type:'single'}); groups.push({key:'causeChoices', label:'原因', type:'single'}); break;
        case 'valve4': groups.push({key:'nameChoices', label:'語弊', type:'single'}); break;
        default:
          if(q.causeChoices) groups.push({key:'causeChoices', label:'原因', type:'single'});
          if(q.fixChoices) groups.push({key:'fixChoices', label:'対策', type:'single'});
          break;
      }

      const selections = {};
      groups.forEach(g=>{
        const arr = Array.isArray(q[g.key]) ? q[g.key].slice() : [];
        const wrap = document.createElement('div'); wrap.className='group-wrap'; const h = document.createElement('h4'); h.textContent = g.label; wrap.appendChild(h);
        arr.forEach((txt,i)=>{ if(!txt) return; const b=document.createElement('button'); b.type='button'; b.className='optBtn'; b.textContent = `${i+1}. ${txt}`; b.dataset.group = g.key; b.dataset.index = String(i); b.addEventListener('click', ()=>{
              if(g.type==='multi'){
                selections[g.key] = selections[g.key]||[]; const idx = selections[g.key].indexOf(i);
                if(idx>=0) selections[g.key].splice(idx,1);
                else { if(selections[g.key].length < (g.max||2)) selections[g.key].push(i); }
                wrap.querySelectorAll('.optBtn').forEach((btn,bi)=>{ if(selections[g.key] && selections[g.key].includes(bi)) btn.classList.add('selected'); else btn.classList.remove('selected'); });
              } else {
                selections[g.key] = [i]; wrap.querySelectorAll('.optBtn').forEach((btn,bi)=>{ btn.classList.toggle('selected', bi===i); });
              }
              const needAll = groups.every(gg=> (selections[gg.key] && selections[gg.key].length>0));
              if(needAll){ evaluateGenericSelection(selections, q); }
            }); wrap.appendChild(b); }); choicesElem.appendChild(wrap);
      });
    }

    function evaluateGenericSelection(sels, qn){
      const mapper = { nameChoices:'answerName', descChoices:'answerDesc', causeChoices:'answerCause', fixChoices:'answerFix', featureChoices:'answerFeature', usageChoices:'answerUsage', phenomenonChoices:'answerPhenomenon' };
      const missing = [];
      const expected = {};
      Object.keys(sels).forEach(gk=>{ const key = mapper[gk] || ('answer_' + gk); expected[gk] = (qn[key] !== undefined && qn[key] !== null) ? qn[key] : null; if(expected[gk]===null || expected[gk]==='' || (Array.isArray(expected[gk]) && expected[gk].length===0)) missing.push(gk); });
      if(missing.length>0){ const updates = {}; Object.keys(sels).forEach(gk=>{ const key = mapper[gk] || ('answer_' + gk); const vals = sels[gk].map(i=> (Array.isArray(qn[gk])? qn[gk][i] : '') ); updates[key] = (vals.length>1)? vals : (vals[0]||''); }); persistGenericAnswers(qn.id, updates); Feedback.show(true,'正解（未設定のため保存しました）'); correctCount++; setTimeout(nextOrFinish, setting.mode==='alert'?120:900); return; }

      let okAll = true;
      Object.keys(sels).forEach(gk=>{
        const mapped = mapper[gk] || ('answer_' + gk);
        const expectedVal = qn[mapped];
        const selVals = sels[gk].map(i=> (Array.isArray(qn[gk])? qn[gk][i] : '') );
        if(Array.isArray(expectedVal)){
          const a = expectedVal.map(x=>normalizeForCompare(x)).sort();
          const b = selVals.map(x=>normalizeForCompare(x)).sort();
          if(a.length!==b.length || a.some((v,i)=>v!==b[i])) okAll=false;
        } else {
          if(normalizeForCompare(expectedVal) !== normalizeForCompare(selVals[0]||'')) okAll=false;
        }
      });
      handleResult(okAll, qn);
    }

    function handleResult(isCorrect, qn){ if(isCorrect){ Feedback.show(true,'正解！'); correctCount++; } else { Feedback.show(false,'不正解…'); wrongList.push(qn); }
      if(setting.mode === 'alert'){ setTimeout(()=>{ alert(isCorrect?'正解！':'不正解…'); nextOrFinish(); },120); } else { setTimeout(nextOrFinish,900); } }

    function nextOrFinish(){ idx++; if(idx>=questions.length) finishQuiz(); else { choicesElem.innerHTML=''; showQuestion(); } }
    function finishQuiz(){ if(timerId) clearInterval(timerId); const result = { score: correctCount, total: questions.length, wrong: wrongList }; localStorage.setItem('quizResult', JSON.stringify(result)); window.location.href='result.html'; }

    function persistAnswerForGakka(id, answerLetter){ const data = loadData('myQuestions'); let changed=false; const nd = data.map(it=>{ if(it && it.id===id){ it.answer = answerLetter; changed=true; } return it; }); if(changed) saveData('myQuestions', nd); }
    function persistGenericAnswers(id, updates){ const data = loadData('myQuestions'); let changed=false; const nd = data.map(it=>{ if(it && it.id===id){ Object.keys(updates).forEach(k=> it[k]=updates[k]); changed=true; } return it; }); if(changed) saveData('myQuestions', nd); }

    // initial
    showQuestion();
  })();
}
if (isResultPage()){
    (function initResult(){ const resultObj = JSON.parse(localStorage.getItem('quizResult')||'{}'); const scoreText = document.getElementById('scoreText'); const wrongListElem = document.getElementById('wrongList'); if(!resultObj || !resultObj.total){ scoreText.textContent='結果データがありません。'; return; } const percent = ((resultObj.score / resultObj.total) * 100).toFixed(1); scoreText.textContent = `あなたの得点：${resultObj.total}問中 ${resultObj.score}問正解（${percent}%）`; wrongListElem.innerHTML=''; if(resultObj.wrong && resultObj.wrong.length>0){ resultObj.wrong.forEach(w=>{ const li = document.createElement('li'); li.innerHTML = `<strong>${w.question||'(問題文なし)'}</strong><br><small>正解：${w.answer || (w.answerCause? (w.answerCause+' / '+w.answerFix) : (w.answerName? (w.answerName + (w.answerDesc? ' / '+ JSON.stringify(w.answerDesc):'') ) : '―'))}</small>`; wrongListElem.appendChild(li); }); } else { wrongListElem.innerHTML = '<li>全問正解です！🎉</li>'; } })();
}
