// This prototype deliberately has no fetch(), microphone access or real login.
// Its transitions follow the alternate states in the supplied Figma file.
const app = document.querySelector('#app');
const icons = document.querySelector('#status-icons');
const PROFILE_KEY = 'aimianzheng.web-demo.voice-template.v1';
const DEMO_ACCOUNT = 'name@example.com';
const DEMO_PASSWORD = 'demo123456';
const labels = { batch: '录一段后分析', live: '边听边生成' };
const quietHeights = [5, 5, 7, 5, 9, 13, 8, 16, 10, 19, 14, 8, 12, 17, 10, 14, 7, 11, 5, 8, 5, 6, 5];
const activeHeights = [8, 13, 20, 12, 28, 40, 23, 48, 30, 57, 42, 24, 36, 50, 29, 43, 22, 32, 16, 24, 12, 18, 8];
const state = {
  screen: 'login', enrollment: 'idle', enrollStarted: 0,
  nextMode: 'batch', currentMode: 'batch', recording: false, started: 0,
  roundShown: false, generating: false, finishing: false, generationId: 0,
};

function asset(name) { return `./assets/figma/${name}.svg`; }
function clock(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function elapsed(start) { return Math.max(0, Math.floor((performance.now() - start) / 1000)); }
function brand() {
  return `<div class="brand"><div class="brand-mark" aria-hidden="true">${[8, 18, 12, 22, 8].map(h => `<span style="height:${h}px"></span>`).join('')}</div><span class="brand-name">AI免证</span></div>`;
}
function header(title, hint = 'AI免证') {
  return `<header class="header"><h1 class="page-title">${title}</h1><span class="small">${hint}</span></header>`;
}
function wave(active) {
  return `<div class="wave ${active ? 'active' : ''}" aria-hidden="true">${(active ? activeHeights : quietHeights).map(h => `<span style="height:${h}px"></span>`).join('')}</div>`;
}
function button(text, action, { disabled = false, secondary = false } = {}) {
  return `<button type="button" class="button ${secondary ? 'secondary' : ''}" data-action="${action}" ${disabled ? 'disabled' : ''}>${text}</button>`;
}
function hasProfile() {
  try { return localStorage.getItem(PROFILE_KEY) === 'ready'; } catch { return false; }
}
function show(screen) {
  state.screen = screen;
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function render() {
  const screen = state.screen;
  icons.innerHTML = ['imgIosSignal', 'imgIosWifiSignal', 'imgIosBatteryFull'].map(name => `<img alt="" src="${asset(`${screen}-${name}`)}">`).join('');
  app.setAttribute('aria-label', { login: '登录', enroll: '声线录入', record: '对话录音', result: '提醒与结果' }[screen]);
  app.dataset.screen = screen;
  app.innerHTML = { login: loginView, enroll: enrollView, record: recordView, result: resultView }[screen]();
  if (screen === 'login') bindLogin();
}
function loginView() {
  return `<div class="top-content">
    <header class="header">${brand()}</header>
    <section class="intro"><h1>先稳住，再回应。</h1><p>在高压交谈中，守住自己的本意与边界。</p></section>
    <form class="login-form" id="login-form">
      <div class="field"><label for="account">账号／邮箱</label><input id="account" name="account" placeholder="请输入账号或邮箱" autocomplete="username" maxlength="254" required></div>
      <div class="field"><label for="password">密码</label><input id="password" name="password" type="password" placeholder="请输入密码" autocomplete="current-password" maxlength="128" required></div>
      <button class="button" id="login-button" type="submit" disabled>登录</button>
      <p class="error-box" id="login-error" role="alert" hidden>账号密码不正确</p>
    </form>
  </div>
  <footer class="login-help"><p>首次登录，先录入你的声线</p><p>已有声线模板？登录后直接开始对话</p></footer>`;
}
function bindLogin() {
  const form = app.querySelector('form');
  const account = form.elements.account;
  const password = form.elements.password;
  const submit = form.querySelector('button');
  const error = form.querySelector('#login-error');
  let busy = false;
  form.addEventListener('input', () => {
    if (busy) return;
    error.hidden = true;
    account.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
    submit.disabled = !account.value.trim() || !password.value;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (busy || submit.disabled) return;
    busy = true;
    const valid = account.value.trim().toLowerCase() === DEMO_ACCOUNT && password.value === DEMO_PASSWORD;
    submit.disabled = true;
    submit.textContent = '正在登录…';
    account.disabled = password.disabled = true;
    setTimeout(() => {
      if (state.screen !== 'login') return;
      if (valid) {
        if (hasProfile()) startSegment();
        else { state.enrollment = 'idle'; show('enroll'); }
      } else {
        busy = false;
        account.disabled = password.disabled = false;
        account.setAttribute('aria-invalid', 'true');
        password.setAttribute('aria-invalid', 'true');
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = '登录';
      }
    }, 600);
  });
}
function enrollView() {
  const active = state.enrollment === 'recording';
  const bad = state.enrollment === 'short';
  const dot = active ? 'enroll_active-img' : bad ? 'enroll_bad-img' : 'enroll-img';
  return `<div class="top-content">
    <header class="header">${brand()}<span class="small">首次使用</span></header>
    <section class="intro enroll-intro"><h1>让它认出你的声音。</h1><p>在安静环境只录自己的声音，说 5—20 秒，建议约 10 秒。以后登录沿用模板。</p></section>
    <section class="enroll-area"><div class="enroll-card">
      <p class="record-status ${active ? 'active' : ''}"><img class="status-dot" alt="" src="${asset(dot)}">${active ? '正在录入你的声线' : bad ? '录入未完成' : '准备好后开始'}</p>
      ${bad ? `<div class="error-icon"><img alt="" src="${asset('enroll_bad-imgAudioLines')}"></div><p class="enroll-warning" role="alert">录入不足 5 秒，请重新录入</p>` : `${wave(active)}<p class="timer" id="enroll-timer">${active ? clock(elapsed(state.enrollStarted)) : '00:00'}</p>`}
      <p class="small">${active ? '只录自己的声音 · 5—20 秒' : bad ? '建议录入约 10 秒' : '建议约 10 秒'}</p>
    </div></section>
  </div>
  <footer class="enroll-actions">
    ${button(active ? '完成声线录入' : '开始录入声线', active ? 'finish-enroll' : 'start-enroll')}
    ${active ? button('取消本次录入', 'cancel-enroll', { secondary: true }) : ''}
    ${button('退出登录', 'logout', { secondary: true })}
  </footer>`;
}
function finishEnrollment() {
  if (state.enrollment !== 'recording') return;
  if (elapsed(state.enrollStarted) < 5) {
    state.enrollment = 'short';
    render();
    return;
  }
  // Only a demo completion flag is stored; there is no audio or voiceprint.
  try { localStorage.setItem(PROFILE_KEY, 'ready'); } catch { /* Demo still works without persistence. */ }
  state.enrollment = 'idle';
  startSegment();
}
function modeHint() {
  if (state.nextMode !== state.currentMode && state.recording) return `下一段生效 · 本段仍为${labels[state.currentMode]}`;
  return state.currentMode === 'batch' ? '结束这一段后，生成应对方案' : '对方说完一轮后，生成应对方案';
}
function recordView() {
  const time = clock(elapsed(state.started));
  const active = state.recording;
  const pending = state.nextMode !== state.currentMode && active;
  return `<div class="top-content">${header('对话辅助')}
    <section class="mode-area">
      <div class="segments" role="group" aria-label="分析模式">
        ${Object.entries(labels).map(([mode, label]) => `<button type="button" data-mode="${mode}" aria-pressed="${state.nextMode === mode}" ${state.finishing ? 'disabled' : ''}>${label}</button>`).join('')}
      </div><p class="mode-hint ${pending ? 'pending' : ''}" id="mode-hint">${modeHint()}</p>
    </section>
    <section class="recorder-area"><div class="recorder-card">
      <p class="record-status ${active ? 'active' : ''}"><img class="status-dot" alt="" src="${asset(pending ? 'record_switch-img' : 'record-img')}"><span id="record-timer">${state.finishing ? '正在收尾…' : `正在录音 · ${time}`}</span></p>
      ${wave(active)}
    </div></section>
    <section class="dialogue" aria-label="演示对话记录">
      <div class="card-heading"><h2>对话记录</h2><span class="small">演示数据</span></div>
      <article class="utterance"><div class="card-heading"><span class="speaker">本人</span><time class="small">00:02</time></div><p>我不想谈收入。</p></article>
      <article class="utterance"><div class="card-heading"><span class="speaker other">对方</span><time class="small">00:06</time></div><p>不说就是心虚。</p></article>
    </section>
  </div>
  <footer>${button(state.finishing ? '正在收尾…' : '结束录音', 'end-record', { disabled: state.finishing })}</footer>`;
}
function resultView() {
  const live = state.recording && state.currentMode === 'live';
  return `<div class="top-content">${header('提醒与结果')}
    <section class="reminder-area"><div class="reminder"><h2>先稳住。</h2><p>先停一下，不必马上解释。记住你想表达的意思和不愿透露的边界。</p></div></section>
    <section class="advice-area"><div class="advice-card" aria-live="polite" aria-busy="${state.generating}">
      <div class="card-heading"><h2>可以这样说</h2>${state.generating ? '' : '<span class="small">演示数据</span>'}</div>
      ${state.generating ? `<div class="generating" role="status"><img alt="" src="${asset('result_pending-imgLoaderCircle')}"><p>正在生成应对方案…</p></div>` : `<div class="advice-body"><p class="reply">我不想讨论收入。拒绝回答不等于心虚。</p><div class="divider"></div><div class="interpretation"><p>意图推测：对方可能在把拒绝回答等同于有问题，真实意图无法确定。</p><p>可选行为：先停一下，再重复自己的边界。</p></div></div>`}
    </div></section>
  </div>
  <footer class="result-actions">${live ? '<p class="live-hint">录音仍在继续，返回后可结束录音</p>' : ''}${button(live ? '返回对话' : '开始新一段', live ? 'return-record' : 'new-segment', { disabled: state.generating })}</footer>`;
}
function startSegment() {
  state.generationId += 1;
  state.currentMode = state.nextMode;
  state.started = performance.now();
  state.recording = true;
  state.finishing = false;
  state.roundShown = false;
  state.generating = false;
  show('record');
}
function generateResult() {
  state.generating = true;
  const requestId = ++state.generationId;
  show('result');
  setTimeout(() => {
    if (requestId !== state.generationId) return;
    state.generating = false;
    if (state.screen === 'result') render();
  }, 1400);
}
function endSegment() {
  if (!state.recording || state.finishing) return;
  state.recording = false;
  state.finishing = true;
  const segmentId = state.generationId;
  render();
  setTimeout(() => {
    if (segmentId !== state.generationId) return;
    state.finishing = false;
    generateResult();
  }, 500);
}
app.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.mode) {
    state.nextMode = target.dataset.mode;
    render();
    return;
  }
  switch (target.dataset.action) {
    case 'start-enroll': state.enrollment = 'recording'; state.enrollStarted = performance.now(); render(); break;
    case 'cancel-enroll': state.enrollment = 'idle'; render(); break;
    case 'finish-enroll': finishEnrollment(); break;
    case 'logout': state.enrollment = 'idle'; state.recording = false; state.generationId += 1; show('login'); break;
    case 'end-record': endSegment(); break;
    case 'new-segment': startSegment(); break;
    case 'return-record': show('record'); break;
  }
});

// One ticker updates the two clocks. A live demo has one fixed opponent round;
// returning from its result keeps the same segment running instead of restarting.
setInterval(() => {
  if (state.enrollment === 'recording') {
    const time = elapsed(state.enrollStarted);
    const timer = document.querySelector('#enroll-timer');
    if (timer) timer.textContent = clock(time);
    if (time >= 20) finishEnrollment();
  }
  if (!state.recording) return;
  const time = elapsed(state.started);
  const timer = document.querySelector('#record-timer');
  if (timer) timer.textContent = `正在录音 · ${clock(time)}`;
  if (state.currentMode === 'live' && !state.roundShown && time >= 8) {
    state.roundShown = true;
    generateResult();
  }
}, 200);
render();
