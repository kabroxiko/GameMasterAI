const { generateResponse } = require('./openai-api');
const GameState = require('./models/GameState');
const { composeSystemMessages, loadPrompt } = require('./promptManager');

async function generateSummaryForGame(gameId) {
  try {
    const gs = await GameState.findOne({ gameId }).select('+conversation +summary +gameSetup');
    if (!gs) return null;

    const language = (gs.gameSetup && gs.gameSetup.language) || 'English';

    // Build inbound messages (exclude system)
    const inbound = (gs.conversation || []).filter(m => m.role !== 'system');

    // Compose system messages to guide summarization
    const systemMsgs = composeSystemMessages({ mode: 'exploration', sessionSummary: gs.summary || '', includeFullSkill: false, language });
    const summaryInstruction = language && language.toLowerCase().startsWith('span')
      ? '*Todo lo anterior fue una transcripción de una partida de rol. Resume los eventos descritos en esta transcripción. Sé conciso (menos de 75 palabras) y objetivo. Toma nota de personajes, lugares y objetos importantes. Usa tercera persona.*'
      : '*Everything above is a transcript of a TTRPG session. Summarize the events concisely (under 75 words), noting important NPCs, locations, and unresolved threads. Use third person.*';
    systemMsgs.push({ role: 'system', content: summaryInstruction });

    const messagesToSend = [...systemMsgs, ...inbound];

    const aiSummary = await generateResponse({ messages: messagesToSend }, { max_tokens: 150, temperature: 0.8, gameId });
    if (!aiSummary) return null;

    // Persist summary and timestamp
    await GameState.findOneAndUpdate({ gameId }, { $set: { summary: String(aiSummary), summaryUpdatedAt: new Date().toISOString() } }, { upsert: true });
    return String(aiSummary);
  } catch (e) {
    console.error('summaryWorker: failed to generate summary for', gameId, e);
    return null;
  }
}

function triggerSummaryForGame(gameId) {
  if (!gameId) return;
  setImmediate(() => generateSummaryForGame(gameId).catch(err => console.warn('triggerSummaryForGame error', err)));
}

function schedulePeriodicSummaries(intervalMs = 60000) {
  const batch = 20;
  setInterval(async () => {
    try {
      const candidates = await GameState.find({ userAndAssistantMessageCount: { $gt: 0 } }).select('gameId').limit(batch).lean();
      for (const c of candidates) {
        triggerSummaryForGame(c.gameId);
      }
    } catch (e) {
      console.warn('schedulePeriodicSummaries error', e);
    }
  }, intervalMs);
}

module.exports = { generateSummaryForGame, triggerSummaryForGame, schedulePeriodicSummaries };

