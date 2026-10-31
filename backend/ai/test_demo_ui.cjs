// Runs the actual inline demo JavaScript against a small DOM/fetch harness.
// This is not a full browser rendering or accessibility test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(body, ok = true) {
  const html = fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8');
  class Element {
    constructor() { this.children=[]; this.style={}; this.value=''; this.disabled=false; this.textContent=''; }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children=[]; this.textContent=''; }
  }
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
  Object.assign(elements.mode, {value:'rubric'});
  elements.demo_practice.value='1'; elements.preset.value='partial'; elements.answer_type.value='FORMULA';
  elements.task_title.value='mock title'; elements.task_instruction.value='mock instruction';
  elements.expected_answer.value='=SUM(A1:A3)';
  const calls=[];
  const context=vm.createContext({
    document:{getElementById:id=>elements[id], createElement:()=>new Element()},
    performance:{now:()=>100},
    fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok,json:async()=>body};}
  });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  function text(element) {return [element.textContent,...element.children.map(text)].join(' ');}
  return {elements,calls,text:()=>text(elements.result)};
}

const feedback={status:'partially_correct',score:65,good_points:['함수 선택 일치'],
  improvement_points:['합계 범위 누락'],corrected_answer:'=SUMIF(A:A,"영업팀",B:B)',
  explanation:'서버 루브릭 근거',next_practice:'범위를 바꾸어 연습하세요.'};

test('input submission displays every feedback field and uses server fixture ID',async()=>{
  const h=harness(feedback);
  h.elements.learner_answer.value='=SUMIF(A:A,"영업팀")';
  await h.elements.submit.onclick();
  assert.equal(h.calls[0].url,'/api/ai/demo/feedback?mode=rubric');
  assert.deepEqual(h.calls[0].body,{practice_id:1,learner_answer:'=SUMIF(A:A,"영업팀")',answer_type:'FORMULA'});
  for(const value of ['65점',...feedback.good_points,...feedback.improvement_points,
    feedback.corrected_answer,feedback.explanation,feedback.next_practice]) assert.ok(h.text().includes(value));
  assert.equal(h.elements.state.textContent,'완료'); assert.equal(h.elements.submit.disabled,false);
});

test('needs_review displays no null or zero score',async()=>{
  const h=harness({...feedback,status:'needs_review',score:null,good_points:[],improvement_points:[],
    corrected_answer:'',explanation:'정답 미등록으로 보류'});
  h.elements.demo_practice.value='4'; await h.elements.submit.onclick();
  assert.equal(h.calls[0].body.practice_id,4);
  assert.ok(h.text().includes('평가 보류')); assert.ok(h.text().includes('정답 미등록으로 보류'));
  assert.ok(!h.text().includes('null점')); assert.ok(!h.text().includes('0점'));
  assert.equal(h.elements.state.textContent,'보류');
});

test('production live sends no client reference answer',async()=>{
  const h=harness(feedback); h.elements.mode.value='live'; h.elements.mode.onchange();
  h.elements.practice_id.value='52'; await h.elements.submit.onclick();
  assert.equal(h.calls[0].url,'/api/ai/feedback'); assert.equal(h.calls[0].body.practice_id,52);
  assert.ok(!('expected_answer' in h.calls[0].body));
});

test('mock keeps the legacy request contract',async()=>{
  const h=harness(feedback); h.elements.mode.value='mock'; h.elements.mode.onchange();
  await h.elements.submit.onclick();
  assert.equal(h.calls[0].url,'/api/ai/feedback/mock');
  assert.equal(h.calls[0].body.expected_answer,'=SUM(A1:A3)');
  assert.ok(!('practice_id' in h.calls[0].body));
});

test('Gemini demo is labelled separately and uses the demo endpoint',async()=>{
  const h=harness(feedback); h.elements.mode.value='gemini_demo'; h.elements.mode.onchange();
  await h.elements.submit.onclick();
  assert.equal(h.calls[0].url,'/api/ai/demo/feedback?mode=gemini');
  assert.ok(h.text().includes('Gemini · 고정 데모 과제'));
});

test('API errors display and re-enable submission',async()=>{
  const h=harness({detail:'Gemini 호출 실패'},false); await h.elements.submit.onclick();
  assert.ok(h.text().includes('Gemini 호출 실패')); assert.equal(h.elements.state.textContent,'오류');
  assert.equal(h.elements.submit.disabled,false);
});

test('changing task offers its SUMIFS and IF presets',()=>{
  const h=harness(feedback);
  h.elements.preset.value='correct'; h.elements.demo_practice.value='2'; h.elements.demo_practice.onchange();
  assert.ok(h.elements.learner_answer.value.startsWith('=SUMIFS('));
  h.elements.demo_practice.value='3'; h.elements.demo_practice.onchange();
  assert.ok(h.elements.learner_answer.value.startsWith('=IF('));
});
