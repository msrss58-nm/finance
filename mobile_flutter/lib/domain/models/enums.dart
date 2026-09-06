/// The 6 live item types (`type` field in family_finance_data).
enum ItemType { income, fixed, variable, loan, dated, cashWithdrawal }

/// Why an item is archived. 'manual' = user archived it directly;
/// 'completed' = the app auto-archived it (e.g. a loan/variable item that
/// reached its total).
enum ArchiveReason { manual, completed }

/// RESOLVED payment method for fixed/dated items. Always concrete —
/// resolveEffectiveWhere() defaults anything that is not exactly 'credit' to
/// bank. This is a DERIVED value: the raw stored string is preserved
/// separately on the item (see FinanceItem's `where` fields), because an
/// unrecognized legacy value must survive a save unchanged even though it
/// resolves to bank for calculation purposes.
enum PaymentWhere { bank, credit }

/// RESOLVED payment method for a 'variable' item. Deliberately NOT the same
/// bank-defaulting convention as [PaymentWhere] — resolveVariablePaymentMethod()
/// returns null for a legacy item with a missing/unrecognized `where`, and
/// nothing may silently turn that null into bank: a null here means "not part
/// of forward cash flow".
///
/// Lives here rather than in finance_item.dart so that legacy_resolvers.dart
/// can resolve it without importing the model layer (which would create an
/// import cycle now that the models resolve their own raw values).
enum VariablePaymentMethod { bank, credit }

/// resolveLoanSource(): 'payroll' ONLY when the raw item.where field is
/// exactly the Hebrew sentinel string 'דרך תלוש השכר'; every other value
/// (missing, empty, or any legacy free-text bank name) resolves to 'bank'.
enum LoanSource { bank, payroll }

/// Fixed item recurrence. Bimonthly is a separate boolean+month pair on the
/// raw item (bimonthly / bimonthlyStartMonth), layered on top of this.
enum FixedPeriod { monthly, yearly }

/// loadLoanBalanceView(): any stored value other than 'principal' falls back
/// to 'total' — the only two valid values.
enum LoanBalanceView { total, principal }

/// PREVIEW_BUILTIN_CATEGORY_KEYS covers only these 4 baseTypes as
/// delete-protected built-ins — 'dated' is deliberately NOT protected, and
/// this data layer must not silently fix that historical gap.
enum CategoryBaseType { income, fixed, variable, loan, dated }
