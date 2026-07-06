'use strict';

const STORAGE_KEY = 'history-midyear-quiz-progress-v1';
const bank = window.HISTORY_MIDYEAR_QUESTION_BANK || { questions: [], metadata: {} };
let questions = bank.questions.slice();
let activeIndex = 0;
let state = loadState();

const els = {
  score: document.getElementById('scoreValue'),
  answered: document.getElementById('answeredValue'),
  points: document.getElementById('pointsValue'),
  streak: document.getElementById('streakValue'),
  topicFilter: document.getElementById('topicFilter'),
  modeFilter: document.getElementById('modeFilter'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  diagnosisList: document.getElementById('diagnosisList'),
  number: document.getElementById('questionNumber'),
  topic: document.getElementById('questionTopic'),
  difficulty: document.getElementById('questionDifficulty'),
  prompt: document.getElementById('questionPrompt'),
  form: document.getElementById('answerForm'),
  answerArea: document.getElementById('answerArea'),
  feedback: document.getElementById('feedbackPanel'),
  submit: document.getElementById('submitBtn'),
  prev: document.getElementById('prevBtn'),
  next: document.getElementById('nextBtn'),
  shuffle: document.getElementById('shuffleBtn'),
  reset: document.getElementById('resetBtn')
};

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { answers: {}, streak: 0 };
  } catch {
    return { answers: {}, streak: 0 };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function filteredQuestions() {
  const topic = els.topicFilter.value;
  const mode = els.modeFilter.value;
  return questions.filter((question) => {
    const record = state.answers[question.id];
    const topicMatch = topic === 'all' || question.domain === topic;
    const modeMatch =
      mode === 'all' ||
      (mode === 'unanswered' && !record) ||
      (mode === 'missed' && record && record.score < 1);
    return topicMatch && modeMatch;
  });
}

function setupFilters() {
  const topics = Array.from(new Set(questions.map((question) => question.domain)));
  els.topicFilter.innerHTML = [
    '<option value="all">Todos os temas</option>',
    ...topics.map((topic) => `<option value="${escapeHtml(topic)}">${escapeHtml(topic)}</option>`)
  ].join('');
}

function render() {
  const visible = filteredQuestions();
  if (activeIndex >= visible.length) activeIndex = Math.max(0, visible.length - 1);
  updateMetrics();
  updateDiagnosis();

  if (!visible.length) {
    els.number.textContent = 'Sem questões';
    els.topic.textContent = 'Ajuste os filtros';
    els.difficulty.textContent = 'Pronto';
    els.prompt.textContent = 'Nenhuma questão corresponde ao filtro atual.';
    els.answerArea.innerHTML = '';
    els.feedback.hidden = true;
    els.submit.disabled = true;
    els.prev.disabled = true;
    els.next.disabled = true;
    return;
  }

  const question = visible[activeIndex];
  const record = state.answers[question.id];
  els.submit.disabled = false;
  els.number.textContent = `Questão ${activeIndex + 1} de ${visible.length}`;
  els.topic.textContent = question.topic;
  els.difficulty.textContent = translateDifficulty(question.difficulty);
  els.prompt.textContent = question.prompt;
  els.prev.disabled = activeIndex === 0;
  els.next.disabled = activeIndex === visible.length - 1;

  if (question.type === 'multiple-choice') renderChoices(question, record);
  if (question.type === 'short-answer') renderShortAnswer(question, record);
  renderFeedback(question, record);
}

function renderChoices(question, record) {
  els.answerArea.innerHTML = `<div class="choice-list">${question.choices.map((choice) => `
    <label class="choice">
      <input type="radio" name="answer" value="${choice.id}" ${record?.answer === choice.id ? 'checked' : ''} />
      <span><b>${choice.id}.</b> ${escapeHtml(choice.text)}</span>
    </label>
  `).join('')}</div>`;
}

function renderShortAnswer(question, record) {
  els.answerArea.innerHTML = `
    <textarea name="answer" maxlength="900" placeholder="Escreva uma resposta completa, com contexto, causa/consequência e vocabulário histórico.">${escapeHtml(record?.answer || '')}</textarea>
  `;
}

function submitAnswer(event) {
  event.preventDefault();
  const visible = filteredQuestions();
  const question = visible[activeIndex];
  if (!question) return;

  const formData = new FormData(els.form);
  const answer = String(formData.get('answer') || '').trim();
  if (!answer) {
    els.feedback.hidden = false;
    els.feedback.className = 'feedback incorrect';
    els.feedback.innerHTML = '<h3>Resposta necessária</h3><p>Escolha uma alternativa ou escreva uma resposta antes de enviar.</p>';
    return;
  }

  const result = grade(question, answer);
  const previous = state.answers[question.id];
  state.answers[question.id] = {
    answer,
    score: result.score,
    earned: Math.round(question.points * result.score),
    max: question.points,
    submittedAt: new Date().toISOString()
  };
  state.streak = result.score >= 1 ? (previous?.score >= 1 ? state.streak : state.streak + 1) : 0;
  saveState();
  render();
}

function grade(question, answer) {
  if (question.type === 'multiple-choice') {
    return { score: answer === question.answer ? 1 : 0 };
  }

  const normalised = answer.toLowerCase();
  const hits = question.requiredKeywords.filter((keyword) => normalised.includes(keyword.toLowerCase()));
  const hasHistoryTerm = /(estado|poder|crise|revolução|guerra|imperialismo|vargas|nazismo|fascismo|oligarquia|trabalh|propaganda|democracia|direitos|causa|consequência)/i.test(answer);
  const causeEffect = /(porque|portanto|consequência|causou|resultou|favoreceu|relaciona|devido|assim|contexto)/i.test(answer);
  const enoughLength = answer.split(/\s+/).filter(Boolean).length >= 25;
  const raw = (hits.length / question.requiredKeywords.length) * 0.55 + (hasHistoryTerm ? 0.2 : 0) + (causeEffect ? 0.1 : 0) + (enoughLength ? 0.15 : 0);
  return { score: Math.min(1, raw) };
}

function renderFeedback(question, record) {
  if (!record) {
    els.feedback.hidden = true;
    return;
  }

  const level = record.score >= 1 ? 'correct' : record.score >= 0.5 ? 'partial' : 'incorrect';
  const title = record.score >= 1 ? 'Correto' : record.score >= 0.5 ? 'Parcialmente correto' : 'Precisa revisar';
  const correction = question.type === 'multiple-choice'
    ? `<p><b>Gabarito:</b> ${escapeHtml(question.correctAnswer)}</p>`
    : `<p><b>Resposta-modelo:</b> ${escapeHtml(question.sampleAnswer)}</p>`;
  const shortTip = question.type === 'short-answer'
    ? `<p><b>Correção automática:</b> Sua resposta atingiu ${Math.round(record.score * 100)}%. Inclua contexto, causa/consequência, conceito histórico e relação direta com o tema.</p>`
    : '';

  els.feedback.hidden = false;
  els.feedback.className = `feedback ${level}`;
  els.feedback.innerHTML = `
    <h3>${title} | +${record.earned}/${record.max} pts</h3>
    ${correction}
    <p><b>Correção:</b> ${escapeHtml(question.explanation)}</p>
    ${shortTip}
  `;
}

function updateMetrics() {
  const records = Object.entries(state.answers).filter(([id]) => questions.some((question) => question.id === id));
  const answered = records.length;
  const total = questions.length;
  const earned = records.reduce((sum, [, record]) => sum + record.earned, 0);
  const possible = records.reduce((sum, [, record]) => sum + record.max, 0);
  const score = possible ? Math.round((earned / possible) * 100) : 0;
  const progress = total ? Math.round((answered / total) * 100) : 0;

  els.score.textContent = `${score}%`;
  els.answered.textContent = `${answered} / ${total}`;
  els.points.textContent = String(earned);
  els.streak.textContent = String(state.streak || 0);
  els.progressFill.style.width = `${progress}%`;
  els.progressText.textContent = `${progress}% concluído. O progresso fica salvo automaticamente neste navegador.`;
}

function updateDiagnosis() {
  const byDomain = {};
  for (const question of questions) {
    const record = state.answers[question.id];
    if (!record) continue;
    byDomain[question.domain] ||= { earned: 0, max: 0, missed: 0 };
    byDomain[question.domain].earned += record.earned;
    byDomain[question.domain].max += record.max;
    if (record.score < 1) byDomain[question.domain].missed += 1;
  }

  const items = Object.entries(byDomain)
    .map(([domain, data]) => ({ domain, pct: data.max ? Math.round((data.earned / data.max) * 100) : 0, missed: data.missed }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4);

  if (!items.length) {
    els.diagnosisList.innerHTML = '<p>Envie respostas para liberar prioridades personalizadas.</p>';
    return;
  }

  els.diagnosisList.innerHTML = items.map((item) => `
    <div class="diagnosis-item">
      <strong>${escapeHtml(item.domain)}: ${item.pct}%</strong>
      <span>${diagnosisTip(item.domain, item.missed)}</span>
    </div>
  `).join('');
}

function diagnosisTip(domain, missed) {
  if (domain.includes('Imperialismo')) return `Revise imperialismo, alianças, nacionalismos, trincheiras e Versalhes. Erros: ${missed}.`;
  if (domain.includes('Revolução Russa')) return `Compare Fevereiro/Outubro, bolcheviques, Lenin, Stalin e Trotsky. Erros: ${missed}.`;
  if (domain.includes('Crise de 1929')) return `Treine superprodução, especulação, New Deal e impacto no Brasil. Erros: ${missed}.`;
  if (domain.includes('Nazifascismo')) return `Revise totalitarismo, propaganda, culto ao líder, racismo e direitos humanos. Erros: ${missed}.`;
  if (domain.includes('Oligarquias')) return `Retome café com leite, crise oligárquica, Aliança Liberal e 1930. Erros: ${missed}.`;
  if (domain.includes('Era Vargas')) return `Revise fases de Vargas, Constituição de 1934, trabalhismo e controle sindical. Erros: ${missed}.`;
  return `Estude Estado Novo, DIP, centralização, AIB, ANL e redemocratização. Erros: ${missed}.`;
}

function translateDifficulty(value) {
  if (value === 'easy') return 'Fácil';
  if (value === 'hard') return 'Difícil';
  return 'Média';
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

els.form.addEventListener('submit', submitAnswer);
els.prev.addEventListener('click', () => { activeIndex -= 1; render(); });
els.next.addEventListener('click', () => { activeIndex += 1; render(); });
els.topicFilter.addEventListener('change', () => { activeIndex = 0; render(); });
els.modeFilter.addEventListener('change', () => { activeIndex = 0; render(); });
els.shuffle.addEventListener('click', () => {
  questions = questions.map((question) => ({ question, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map((item) => item.question);
  activeIndex = 0;
  render();
});
els.reset.addEventListener('click', () => {
  if (!confirm('Reiniciar todo o progresso salvo deste quiz de História?')) return;
  state = { answers: {}, streak: 0 };
  saveState();
  render();
});

setupFilters();
render();
