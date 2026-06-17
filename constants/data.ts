// constants/data.ts

/** Shared neon accent used for transfers */
export const NEON_BLUE = '#00D4FF';

/** Canonical type → color mapping — use everywhere instead of re-declaring locally */
export const TX_TYPE_COLOR: Record<string, string> = {
  income:   '#10b981',
  expense:  '#ef4444',
  debt:     '#f97316',
  lent:     '#3b82f6',
  transfer: NEON_BLUE,
};

export const EXPENSE_CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Bills', 'Health',
  'Education', 'Entertainment', 'Subscriptions', 'Travel',
  'Business', 'Other',
];

export const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Business',
  'Gift', 'Bonus', 'Other',
];

export const ALL_CATEGORIES = [
  ...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]),
];

export const CATEGORY_ICONS: Record<string, string> = {
  Food: '🍕', Transport: '🚗', Shopping: '🛍️', Bills: '⚡',
  Health: '💊', Education: '📚', Entertainment: '🎬',
  Subscriptions: '📺', Travel: '✈️', Business: '💼',
  Salary: '💰', Freelance: '💻', Investment: '📈',
  Gift: '🎁', Bonus: '🎯', Other: '📦',
};

export const CATEGORY_COLORS: Record<string, string> = {
  Food: '#ef4444', Transport: '#f97316', Shopping: '#a855f7',
  Bills: '#eab308', Health: '#ec4899', Education: '#06b6d4',
  Entertainment: '#8b5cf6', Subscriptions: '#3b82f6',
  Travel: '#14b8a6', Business: '#10b981', Salary: '#10b981',
  Freelance: '#10b981', Investment: '#f59e0b', Gift: '#f43f5e',
  Bonus: '#8b5cf6', Other: '#94a3b8',
};

export const WALLET_EMOJI: Record<string, string> = {
  cash: '💵', mobile: '📱', bank: '🏦',
  card: '💳', savings: '🏧', other: '💼',
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BDT: '৳', USD: '$', EUR: '€', GBP: '£', INR: '₹',
  AED: 'د.إ', SAR: '﷼', MYR: 'RM', SGD: 'S$',
  CAD: 'C$', AUD: 'A$', JPY: '¥',
};

export const RATES_TO_BDT: Record<string, number> = {
  BDT: 1, USD: 110, EUR: 120, GBP: 140, INR: 1.33,
  AED: 30, SAR: 29.3, MYR: 24.5, SGD: 82,
  CAD: 81, AUD: 72, JPY: 0.74,
};

export const CURRENCIES = [
  { value: 'BDT', label: '৳ BDT – Bangladeshi Taka' },
  { value: 'USD', label: '$ USD – US Dollar' },
  { value: 'EUR', label: '€ EUR – Euro' },
  { value: 'GBP', label: '£ GBP – British Pound' },
  { value: 'INR', label: '₹ INR – Indian Rupee' },
  { value: 'AED', label: 'د.إ AED – UAE Dirham' },
  { value: 'SAR', label: '﷼ SAR – Saudi Riyal' },
  { value: 'MYR', label: 'RM MYR – Malaysian Ringgit' },
  { value: 'SGD', label: 'S$ SGD – Singapore Dollar' },
  { value: 'CAD', label: 'C$ CAD – Canadian Dollar' },
  { value: 'AUD', label: 'A$ AUD – Australian Dollar' },
  { value: 'JPY', label: '¥ JPY – Japanese Yen' },
];

export const WALLET_TYPES = [
  { value: 'cash',    label: '💵 Cash' },
  { value: 'bank',    label: '🏦 Bank' },
  { value: 'card',    label: '💳 Card' },
  { value: 'mobile',  label: '📱 Mobile Banking' },
  { value: 'savings', label: '🏧 Savings' },
  { value: 'other',   label: '💼 Other' },
];