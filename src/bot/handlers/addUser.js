const { withAuth, isAuthorized } = require('../middleware/auth');
const userService = require('../../services/userService');

// Conversation state per chat
const sessions = new Map();

const STEPS = [
  { key: 'customerName', prompt: 'Enter customer name:' },
  { key: 'phone', prompt: 'Enter phone number (or "skip"):' },
  { key: 'telegramUser', prompt: 'Enter Telegram username (or "skip"):' },
  { key: 'xtreamUsername', prompt: 'Enter Xtream username to create:' },
  { key: 'xtreamPassword', prompt: 'Enter Xtream password:' },
  { key: 'pkg', prompt: 'Enter package name (e.g. "1 Month", "3 Month", "12 Month"):' },
  { key: 'expDays', prompt: 'Enter subscription length in days (e.g. 30, 90, 365):' },
  { key: 'maxConnections', prompt: 'Max connections (default 1):' },
  { key: 'bouquet', prompt: 'Bouquet IDs comma-separated (or "skip"):' },
  { key: 'notes', prompt: 'Any notes (or "skip"):' },
];

function register(bot) {
  bot.onText(/\/adduser/, withAuth(bot, async (msg) => {
    const chatId = msg.chat.id;
    sessions.set(chatId, { step: 0, data: {} });
    await bot.sendMessage(chatId, `Adding new subscriber (type /cancel to abort).\n\n${STEPS[0].prompt}`);
  }));

  bot.onText(/\/cancel/, withAuth(bot, async (msg) => {
    if (sessions.has(msg.chat.id)) {
      sessions.delete(msg.chat.id);
      await bot.sendMessage(msg.chat.id, 'Add user cancelled.');
    }
  }));

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!sessions.has(chatId)) return;
    if (!isAuthorized(chatId)) return;
    if (!msg.text || msg.text.startsWith('/')) return;

    const session = sessions.get(chatId);
    const currentStep = STEPS[session.step];
    const value = msg.text.trim();

    // Handle "skip" for optional fields
    const skippable = ['phone', 'telegramUser', 'bouquet', 'notes'];
    if (value.toLowerCase() === 'skip' && skippable.includes(currentStep.key)) {
      session.data[currentStep.key] = null;
    } else if (currentStep.key === 'maxConnections') {
      session.data[currentStep.key] = parseInt(value, 10) || 1;
    } else if (currentStep.key === 'expDays') {
      const days = parseInt(value, 10);
      if (isNaN(days) || days <= 0) {
        await bot.sendMessage(chatId, 'Please enter a valid number of days.');
        return;
      }
      session.data[currentStep.key] = days;
    } else {
      session.data[currentStep.key] = value;
    }

    session.step++;

    // More steps to go
    if (session.step < STEPS.length) {
      await bot.sendMessage(chatId, STEPS[session.step].prompt);
      return;
    }

    // All data collected — confirm
    const d = session.data;
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + (d.expDays || 30));
    const expDateStr = expDate.toISOString().split('T')[0];

    const summary = [
      'Confirm new subscriber:\n',
      `Name: ${d.customerName}`,
      `Phone: ${d.phone || 'N/A'}`,
      `Telegram: ${d.telegramUser || 'N/A'}`,
      `Username: ${d.xtreamUsername}`,
      `Password: ${d.xtreamPassword}`,
      `Package: ${d.pkg}`,
      `Expiry: ${expDateStr} (${d.expDays} days)`,
      `Max connections: ${d.maxConnections || 1}`,
      `Bouquet: ${d.bouquet || 'N/A'}`,
      `Notes: ${d.notes || 'N/A'}`,
      '\nType YES to confirm or anything else to cancel.',
    ].join('\n');

    session.step = 'confirm';
    session.expDateStr = expDateStr;
    await bot.sendMessage(chatId, summary);
  });

  // Confirmation listener
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const session = sessions.get(chatId);
    if (!session || session.step !== 'confirm') return;
    if (!isAuthorized(chatId)) return;
    if (!msg.text) return;

    sessions.delete(chatId);

    if (msg.text.toUpperCase() !== 'YES') {
      await bot.sendMessage(chatId, 'Add user cancelled.');
      return;
    }

    const d = session.data;
    try {
      await userService.createUser({
        customerName: d.customerName,
        phone: d.phone,
        telegramUser: d.telegramUser,
        xtreamUsername: d.xtreamUsername,
        xtreamPassword: d.xtreamPassword,
        pkg: d.pkg,
        maxConnections: d.maxConnections || 1,
        bouquet: d.bouquet,
        expDate: session.expDateStr,
        notes: d.notes,
      });

      await bot.sendMessage(
        chatId,
        `Subscriber created!\n\nUsername: ${d.xtreamUsername}\nPassword: ${d.xtreamPassword}\nExpiry: ${session.expDateStr}`
      );
    } catch (err) {
      await bot.sendMessage(chatId, `Failed to create subscriber: ${err.message}`);
    }
  });
}

module.exports = { register };
