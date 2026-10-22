export function finalLeaders(state) {
  const high = Math.max(...state.teams.map(t => t.score));
  return state.teams.flatMap((t, i) => t.score === high ? [i] : []);
}

export function finishGame(state) {
  if (!['result', 'complete'].includes(state.phase) || state.history.length < state.totalRounds) throw Error('Score the final round first.');
  const qualifiers = finalLeaders(state);
  return { ...state, phase: 'complete', finalTiebreak: qualifiers.length > 1
    ? state.finalTiebreak || { qualifiers, representatives: {}, order: null, results: [] } : null };
}

export function selectFinalRepresentative(state, team, member) {
  const t = state.finalTiebreak;
  if (state.phase !== 'complete' || !t || t.order || !t.qualifiers.includes(team)) throw Error('Select representatives before starting the bracket.');
  if (!Number.isInteger(member) || member < 0 || member >= Math.max(1, state.teams[team].members.length)) throw Error('Choose a valid team representative.');
  return { ...state, finalTiebreak: { ...t, representatives: { ...t.representatives, [team]: member } } };
}

export function startFinalBracket(state, random = Math.random) {
  const t = state.finalTiebreak;
  if (state.phase !== 'complete' || !t) throw Error('Start the final tiebreak first.');
  if (t.order) return state; // A saved draw is never regenerated, even after reload.
  if (t.qualifiers.some(i => !Number.isInteger(t.representatives[i]))) throw Error('Choose one representative for every qualifying team.');
  const order = [...t.qualifiers];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...state, finalTiebreak: { ...t, order } };
}

// Rebuild the bracket from one saved shuffle and an append-only outcome log.
// Byes occur only in the first stage; no team plays a second time in that stage.
export function finalBracket(t) {
  if (!t?.order) return { matches: [], current: null, winner: null };
  const size = 2 ** Math.ceil(Math.log2(t.order.length));
  const pairs = t.order.length - size / 2;
  let groups = [], cursor = 0, stage = 1;
  for (let i = 0; i < pairs; i++) groups.push(t.order.slice(i * 2, i * 2 + 2));
  for (let i = pairs * 2; i < t.order.length; i++) groups.push([t.order[i]]);
  const matches = [];
  while (groups.length) {
    const advancing = []; let current = null;
    for (const teams of groups) {
      const match = { number: matches.length + 1, stage, teams, bye: teams.length === 1, draws: 0, winner: null };
      if (match.bye) match.winner = teams[0];
      else while (cursor < t.results.length && match.winner === null) {
        const { winner } = t.results[cursor++];
        if (winner === null) match.draws++;
        else if (teams.includes(winner)) match.winner = winner;
        else throw Error('Invalid knockout winner.');
      }
      matches.push(match);
      if (match.winner === null) current ||= match;
      advancing.push(match.winner);
    }
    if (current) return { matches, current, winner: null };
    if (advancing.length === 1) {
      if (cursor !== t.results.length) throw Error('The knockout is already complete.');
      return { matches, current: null, winner: advancing[0] };
    }
    groups = [];
    for (let i = 0; i < advancing.length; i += 2) groups.push(advancing.slice(i, i + 2));
    stage++;
  }
  throw Error('Invalid knockout bracket.');
}

export function recordFinalResult(state, winner) {
  if (state.phase !== 'complete') throw Error('Finish the scored rounds first.');
  const t = state.finalTiebreak, match = finalBracket(t).current;
  if (!match || (winner !== null && !match.teams.includes(winner))) throw Error('Record a draw or a winner of the current match.');
  return { ...state, finalTiebreak: { ...t, results: [...t.results, { winner }] } };
}

export function undoFinalResult(state) {
  const t = state.finalTiebreak;
  if (state.phase !== 'complete' || !t?.results.length) throw Error('There is no knockout result to undo.');
  return { ...state, finalTiebreak: { ...t, results: t.results.slice(0, -1) } };
}

export function outcome(choices, champion = null) {
  if (choices.length < 2 || choices.some(c => c !== 'red' && c !== 'blue')) {
    throw new Error('Every team must choose red or blue.');
  }
  const red = choices.filter(c => c === 'red').length;
  const blue = choices.length - red;
  if (!red || !blue) return { red, blue, winner: null, tie: false, deltas: choices.map(() => 0) };
  if (red === blue && !champion) return { red, blue, winner: null, tie: true, deltas: null };
  if (champion && champion !== 'red' && champion !== 'blue') throw new Error('Invalid champion side.');
  const winner = red === blue ? champion : red < blue ? 'red' : 'blue';
  const winners = winner === 'red' ? red : blue;
  const losers = choices.length - winners;
  return { red, blue, winner, tie: red === blue, deltas: choices.map(c => c === winner ? losers : -winners) };
}

export function applyRound(state) {
  if (state.phase !== 'preview') throw new Error('Review the result before applying points.');
  const result = outcome(state.choices, state.champion);
  if (!result.deltas) throw new Error('Record the champion result first.');
  const record = {
    round: state.history.length + 1,
    choices: [...state.choices], champion: state.champion, champions: { ...state.champions }, draws: state.draws,
    deltas: result.deltas, before: state.teams.map(t => t.score),
    after: state.teams.map((t, i) => t.score + result.deltas[i])
  };
  return { ...state, phase: 'result', teams: state.teams.map((t, i) => ({ ...t, score: record.after[i] })), history: [...state.history, record] };
}

export function undoRound(state) {
  if (!state.history.length) throw new Error('There is no scored round to undo.');
  const last = state.history.at(-1);
  return {
    ...state, phase: 'record', teams: state.teams.map((t, i) => ({ ...t, score: last.before[i] })),
    choices: [...last.choices], champion: null, champions: { red: '', blue: '' }, draws: 0,
    history: state.history.slice(0, -1), finalTiebreak: null, timer: { remaining: state.duration, deadline: null }
  };
}
