// Shared default ignore lists — loaded by the service worker (importScripts),
// the options page, and referenced by the popup's Reset button.
// Editable per-install; these are only the seed + what "Reset to defaults" restores.

const LT_DEFAULT_EXCLUDED = [
  // local & dev noise
  'localhost', '127.0.0.1', '*.local', '*.lan', '*.test',

  // auth / SSO / password managers (noisy + sensitive)
  'accounts.google.com', 'login.*', 'login.microsoftonline.com', 'signin.aws.amazon.com',
  'id.apple.com', 'id.me', '*.login.gov', '*.okta.com', '*.auth0.com', '*.duosecurity.com',
  'authy.com', '*.1password.com', 'vault.bitwarden.com', '*.lastpass.com', '*.dashlane.com',

  // banking, cards & investing
  '*.chase.com', '*.bankofamerica.com', '*.wellsfargo.com', '*.citi.com', '*.capitalone.com',
  '*.americanexpress.com', '*.discover.com', '*.paypal.com', '*.venmo.com', '*.mint.com',
  '*.fidelity.com', '*.schwab.com', '*.vanguard.com', '*.robinhood.com',
  '*.coinbase.com', '*.binance.com', '*.kraken.com', '*.metamask.io',
  'turbotax.com', '*.irs.gov',

  // health, pharmacy & insurance
  'mychart.*', '*.kaiserpermanente.org', '*.cvs.com', '*.walgreens.com', '*.goodrx.com',
  '*.zocdoc.com', '*.teladoc.com', '*.doxy.me', '*.myuhc.com', '*.cigna.com', '*.anthem.com',
  '*.aetna.com', '*.express-scripts.com', '*.labcorp.com', '*.questdiagnostics.com',

  // government / legal / identity
  '*.ssa.gov', '*.usa.gov', '*.uscis.gov',

  // email & messaging
  'mail.google.com', 'outlook.*', 'mail.proton.me', '*.protonmail.com', 'mail.yahoo.com',
  '*.icloud.com', 'web.whatsapp.com', '*.messenger.com', 'web.telegram.org', 'signal.org',
  'app.slack.com', 'discord.com', 'teams.microsoft.com',

  // private docs & cloud storage
  'drive.google.com', 'docs.google.com', '*.dropbox.com', '*.notion.so',

  // dating
  '*.tinder.com', '*.bumble.com', '*.hinge.co', '*.match.com', '*.okcupid.com', '*.grindr.com',

  // AI chats (often personal)
  'chatgpt.com', 'claude.ai', 'gemini.google.com',
];

const LT_DEFAULT_EXCLUDED_URLS = [
  // low-signal feed / home pages
  'https://www.youtube.com/',
  'https://www.youtube.com/feed/subscriptions',
  'https://twitter.com/home',
  'https://x.com/home',
  'https://www.reddit.com/',
];

// expose on the global (service worker + window) so other scripts can read them
if (typeof globalThis !== 'undefined') {
  globalThis.LT_DEFAULT_EXCLUDED = LT_DEFAULT_EXCLUDED;
  globalThis.LT_DEFAULT_EXCLUDED_URLS = LT_DEFAULT_EXCLUDED_URLS;
}
