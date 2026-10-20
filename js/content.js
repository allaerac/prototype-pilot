// Team-editable content: setup defaults, deals, tips and consent wording.
// Deals come from pilot/deals-research.md (only rows posted on the venue's own site).
// Someone on the team must confirm each deal before the pilot starts, then set `checked` to that date.

export const APP_NAME = 'Prototype';

// Miami's fall 2026 finals look like Dec 7–11. Confirm on the registrar's page before launch.
export const SEMESTER_END_DEFAULT = '2026-12-11';

export const CATEGORIES = [
  { id: 'food', name: 'Food', color: '#6474FF' },
  { id: 'shopping', name: 'Shopping', color: '#3BCFBF' },
  { id: 'transport', name: 'Getting around', color: '#FF9FBD' },
  { id: 'fun', name: 'Fun', color: '#FFC46B' }
];

export const SOURCES = [
  { id: 'family', name: 'Family', freq: 'monthly' },
  { id: 'job', name: 'Job', freq: 'biweekly' },
  { id: 'loans', name: 'Loans, aid or refund', freq: 'once' }
];

export const FREQS = [
  { id: 'once', name: 'One time' },
  { id: 'weekly', name: 'Weekly' },
  { id: 'biweekly', name: 'Every 2 weeks' },
  { id: 'monthly', name: 'Monthly' }
];

export const BILLS = [
  { id: 'rent', name: 'Rent' },
  { id: 'phone', name: 'Phone' },
  { id: 'car', name: 'Car' },
  { id: 'subs', name: 'Subscriptions' },
  { id: 'other', name: 'Other' }
];

export const CONSENT = {
  version: 2,
  title: 'Help us test this app',
  points: [
    'We collect how you use the app (screens opened, purchases logged, survey answers), tied to a random ID, not your name.',
    'We never connect to your bank, and nothing you log is shared outside the ESP201 team.',
    'You can turn off any part of it, or all of it, in Settings, and the app keeps working on your phone.'
  ]
};

// What the pilot collects, in groups the student can switch off one by one (Settings → What we collect).
// `events` are the event names in each group; anything not listed here (consent, sharing on/off, surveys and
// feedback the student chooses to send) always goes through while sharing is on.
export const TRACKING = [
  {
    id: 'setup', name: 'Your setup answers',
    what: 'The kinds of income and bills you pick (not how much), your weekly number and how you split it up.',
    why: 'We want to see if setup actually makes sense and if the number we give you feels right, or if people end up changing it. Helps us make setup quicker and the math better.',
    events: ['setup_start', 'setup_step', 'setup_complete', 'setup_redo_start', 'setup_redo_complete']
  },
  {
    id: 'purchases', name: 'Purchases you log',
    what: 'The amount, category and day of each purchase you add or remove. Never where you bought it or what you typed in the note.',
    why: "This is the big one. It shows us if logging is quick enough that people actually keep doing it, and which categories go over the most so we know what to focus on.",
    events: ['log_open', 'tx_add', 'tx_delete']
  },
  {
    id: 'weeks', name: 'How your weeks go',
    what: 'If you stayed under your number each week, and when the 75% and 100% alerts popped up.',
    why: "The whole point is helping you stay on track week to week, so this is how we tell if the app is actually working or not.",
    events: ['week_closed', 'alert_shown']
  },
  {
    id: 'stress', name: 'Money stress check-ins',
    what: 'Your 1–5 answer from setup and from each weekly recap.',
    why: "We want money to feel less stressful, not more. This lets us see if that's actually happening over the 4 weeks.",
    events: ['stress_checkin']
  },
  {
    id: 'usage', name: 'When and how you use the app',
    what: 'When you open it, which tabs you look at, and if you added it to your Home Screen.',
    why: 'Just so we can see which parts people actually use and which ones nobody looks at, so we know what to keep and what to cut.',
    events: ['app_open', 'screen_view', 'recap_view', 'survey_open', 'install_prompt', 'installed']
  },
  {
    id: 'deals', name: 'Deals you check out',
    what: 'Which deals you tap on and if you turn on 21+ deals.',
    why: "We want to know if the deals are actually worth it to people or just kinda there. If nobody taps them we'll swap in better ones.",
    events: ['deal_open', 'deal_source', 'deals_21_toggle']
  }
];

// days: 0 = Sunday … 6 = Saturday. cat: food | drinks | free | national. age21: hide unless the student opts in.
export const DEALS = [
  { id: 'mj-lunch', venue: "Mac & Joe's", title: 'Half sub, fries and a soft drink', price: '$8.29', days: [1, 2, 3, 4, 5], time: '11am–4pm', cat: 'food', source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'mj-wings', venue: "Mac & Joe's", title: 'Wings for 75¢ each', price: '75¢', days: [1], time: '4–10pm', cat: 'food', source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'sk-mon', venue: "Skipper's", title: 'Burger special with a side and drink', price: 'Special', days: [1], time: '', cat: 'food', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'sk-tue', venue: "Skipper's", title: 'Gyro special with a side and drink', price: 'Special', days: [2], time: '', cat: 'food', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'sk-wed', venue: "Skipper's", title: 'Chicken sandwich special with a side and drink', price: 'Special', days: [3], time: '', cat: 'food', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'sk-thu', venue: "Skipper's", title: 'Italian beef or hot dog special with a side and drink', price: 'Special', days: [4], time: '', cat: 'food', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'sk-fri', venue: "Skipper's", title: 'Reuben special with a side and drink', price: 'Special', days: [5], time: '', cat: 'food', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'st-wed', venue: 'Steinkeller', title: '12oz NY strip with potato, onion ring and salad', price: '$23.95', days: [3], time: 'Dine-in', cat: 'food', source: 'https://www.steinkellercircle.com/', checked: '' },
  { id: 'st-thu', venue: 'Steinkeller', title: '$10 off schnitzels', price: '$10 off', days: [4], time: 'Dine-in', cat: 'food', source: 'https://www.steinkellercircle.com/', checked: '' },
  { id: 'st-sun', venue: 'Steinkeller', title: 'Prime rib with potato and salad', price: '$28', days: [0], time: 'Dine-in', cat: 'food', source: 'https://www.steinkellercircle.com/', checked: '' },

  { id: 'op-trivia', venue: "O'Pub", title: 'Trivia night', price: 'Free', days: [2], time: 'Evening', cat: 'free', source: 'https://opuboxford.com/', checked: '' },
  { id: 'sk-trivia', venue: "Skipper's", title: 'Trivia night', price: 'Free', days: [3], time: 'Evening', cat: 'free', source: 'https://www.skipperstopdeck.com/menu', checked: '' },
  { id: 'op-music', venue: "O'Pub", title: 'Live music', price: 'Free', days: [4], time: 'Evening', cat: 'free', source: 'https://opuboxford.com/', checked: '' },
  { id: 'farmers', venue: 'Oxford Farmers Market', title: 'Market behind Memorial Park', price: 'Free', days: [6], time: '9am–noon', cat: 'free', source: 'https://www.miamistudent.net/article/2026/09/farmers-market-oxford-ohio-fall-2026', checked: '' },

  { id: 'co-mon', venue: 'Corner', title: '$2 Mich Ultra drafts, $14 wine bottles', price: '$2', days: [1], time: '', cat: 'drinks', age21: true, source: 'https://oxfordcornerbar.com/', checked: '' },
  { id: 'co-tue', venue: 'Corner', title: '$5 double wells, Bud Light bottles 2 for $8', price: '$5', days: [2], time: '', cat: 'drinks', age21: true, source: 'https://oxfordcornerbar.com/', checked: '' },
  { id: 'co-wed', venue: 'Corner', title: '$5.50 drafts, $5 Sun Cruiser', price: '$5', days: [3], time: '', cat: 'drinks', age21: true, source: 'https://oxfordcornerbar.com/', checked: '' },
  { id: 'co-hh', venue: 'Corner', title: 'Happy hour: $3 double wells', price: '$3', days: [4, 5], time: '5–8pm', cat: 'drinks', age21: true, source: 'https://oxfordcornerbar.com/', checked: '' },
  { id: 'co-sat', venue: 'Corner', title: '$14 mimosa bottles, $3 double wells', price: '$3', days: [6], time: '12–2pm', cat: 'drinks', age21: true, source: 'https://oxfordcornerbar.com/', checked: '' },
  { id: 'mj-mon', venue: "Mac & Joe's", title: 'All 60oz pitchers', price: '$15', days: [1], time: '4–10pm', cat: 'drinks', age21: true, source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'mj-tue', venue: "Mac & Joe's", title: 'All cans', price: '$4', days: [2], time: '4–10pm', cat: 'drinks', age21: true, source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'mj-wed', venue: "Mac & Joe's", title: 'Pint night: $3.75 domestic, $4.75 craft', price: '$3.75', days: [3], time: '4–10pm', cat: 'drinks', age21: true, source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'mj-thu', venue: "Mac & Joe's", title: '$4 off all cocktails', price: '$4 off', days: [4], time: '4–10pm', cat: 'drinks', age21: true, source: 'https://www.macandjoes.com/', checked: '' },
  { id: 'b1-wed', venue: 'Bar 1868', title: 'Half off wine and cider', price: '½ off', days: [3], time: '', cat: 'drinks', age21: true, source: 'https://bar1868.com/', checked: '' },
  { id: 'b1-thu', venue: 'Bar 1868', title: '$2 off well and Long Island pitchers', price: '$2 off', days: [4], time: '', cat: 'drinks', age21: true, source: 'https://bar1868.com/', checked: '' },
  { id: 'b1-fri', venue: 'Bar 1868', title: '$2 off all Long Islands', price: '$2 off', days: [5], time: '', cat: 'drinks', age21: true, source: 'https://bar1868.com/', checked: '' },
  { id: 'b1-sat', venue: 'Bar 1868', title: 'Half off seltzers and seltzer cocktails', price: '½ off', days: [6], time: '', cat: 'drinks', age21: true, source: 'https://bar1868.com/', checked: '' },
  { id: 'st-liter', venue: 'Steinkeller', title: '$10 liters', price: '$10', days: [4], time: 'Dine-in', cat: 'drinks', age21: true, source: 'https://www.steinkellercircle.com/', checked: '' },

  { id: 'spotify', venue: 'Spotify Premium Student', title: 'Student plan. Check whether Hulu is still included.', price: '$6.99/mo', days: [0, 1, 2, 3, 4, 5, 6], time: '', cat: 'national', source: 'https://www.spotify.com/us/student/', checked: '' },
  { id: 'prime', venue: 'Prime for Young Adults', title: '6 months free, then half price', price: '$7.49/mo', days: [0, 1, 2, 3, 4, 5, 6], time: '', cat: 'national', source: 'https://www.amazon.com/amazonprime', checked: '' }
];

// Short, plain-English, never preachy. General education, not personalized financial advice. Team reviews tone.
export const TIPS = [
  'Packing lunch twice a week instead of buying it saves about $15. Over a semester, that\'s $240.',
  'Before buying something over $30, wait a day. If you still want it tomorrow, it\'s probably worth it.',
  'Check your subscriptions once a month. A forgotten $10 one costs $120 a year.',
  'Splitting a grocery run with a roommate usually beats two people eating out.',
  'Your student ID is a discount card. It\'s worth asking "do you have a student price?" anywhere.',
  'A slow week isn\'t a failure. Next week starts fresh on Monday.',
  'Logging a purchase right away takes 5 seconds. Remembering it on Sunday takes much longer.',
  'Keep a little cushion. Surprise costs, like a copay or a ride home, are easier when they\'re planned for.',
  'If something is $5 a day, it\'s about $35 a week. Daily habits are where weekly money goes.',
  'Free events count as fun too. Trivia nights and campus events cost nothing.',
  'Under budget this week? Moving even $5 into savings starts the habit.',
  'Money stress is common. Talking about it with someone you trust usually makes it smaller.'
];
