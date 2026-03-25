const config = require('./config');
const { initialize } = require('./db/schema');
const { createBot } = require('./bot');
const scheduler = require('./scheduler/cron');

// Initialize database tables
initialize();
console.log('Database initialized.');

// Start Telegram bot
const bot = createBot();

// Start scheduled tasks
scheduler.start(bot);

console.log('IPTV Access Killer is running.');
