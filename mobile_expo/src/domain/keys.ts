// The seven Web storage keys by role (values identical to app.js).

export const FF_KEYS = {
  data: 'family_finance_data',
  categoryConfig: 'family_finance_cat_config',
  settings: 'family_finance_settings',
  activityLog: 'family_finance_activity_log',
  goals: 'family_finance_goals',
  categoryTileOrder: 'family_finance_category_tile_order',
  loanBalanceView: 'family_finance_loan_balance_view',
} as const;

/** app.js ACTIVITY_LOG_MAX. */
export const ACTIVITY_LOG_MAX = 200;
