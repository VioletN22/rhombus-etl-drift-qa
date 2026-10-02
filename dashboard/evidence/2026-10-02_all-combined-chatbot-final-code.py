from datetime import datetime

# Start with input data
_df = input_df_1.copy()

# 0. Normalize headers: lowercase, strip, replace spaces with underscores
_df.columns = [str(c).strip().lower().replace(' ', '_') for c in _df.columns]

# 0b. Create/standardize amount_usd from total_amount if needed (but keep total_amount)
if 'total_amount' in _df.columns and 'amount_usd' not in _df.columns:
    _df['amount_usd'] = _df['total_amount']

# 0c. Remap other column name variants to canonical names (excluding amount mapping)
_ALIASES = {
    'order_id':      ['orderid', 'order_number', 'id'],
    'customer_name': ['customername', 'name', 'client_name', 'customer'],
    'email':         ['email_address', 'e_mail', 'emailaddress', 'mail'],
    'order_date':    ['orderdate', 'date', 'purchase_date', 'transaction_date'],
    'quantity':      ['qty', 'units', 'count', 'num_items'],
    'country':       ['country_code', 'nation', 'location', 'region'],
    'status':        ['order_status', 'state', 'order_state'],
}

for _canon, _alts in _ALIASES.items():
    if _canon not in _df.columns:
        for _a in _alts:
            if _a in _df.columns:
                _df.rename(columns={_a: _canon}, inplace=True)
                break

# 0d. Ensure all core required columns exist (for filtering/validation logic)
for _c in ['order_id', 'customer_name', 'email', 'order_date', 'amount_usd', 'quantity', 'country', 'status']:
    if _c not in _df.columns:
        _df[_c] = np.nan

# 1. Drop rows with missing order_id or amount_usd
_df = _df[
    _df['order_id'].notna() & 
    (_df['order_id'].astype(str).str.strip() != '') & 
    _df['amount_usd'].notna() & 
    (_df['amount_usd'].astype(str).str.strip() != '')
].copy()

# 2. Customer_name -> Title Case
_df['customer_name'] = _df['customer_name'].fillna('').astype(str).str.strip().str.title()

# 3. Email: lowercase + validate
def _clean_email(v):
    s = '' if pd.isna(v) else str(v).lower().strip()
    if '@' not in s:
        return ''
    lhs, rhs = s.split('@', 1)
    return s if (lhs and '.' in rhs) else ''

_df['email'] = _df['email'].map(_clean_email)

# 4. Order_date -> YYYY-MM-DD format
def _parse_date(v):
    if pd.isna(v) or str(v).strip() == '':
        return ''
    if isinstance(v, pd.Timestamp):
        return v.strftime('%Y-%m-%d')
    s = str(v).strip()
    for _fmt in ('%m/%d/%Y', '%Y-%m-%d', '%b %d %Y', '%b %d, %Y', '%B %d %Y', '%B %d, %Y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s, _fmt).strftime('%Y-%m-%d')
        except ValueError:
            pass
    return ''

_df['order_date'] = _df['order_date'].map(_parse_date)

# 5. Amount_usd -> float (removing $ and commas)
def _parse_amt(v):
    if pd.isna(v) or str(v).strip() == '':
        return np.nan
    try:
        return float(str(v).replace('$', '').replace(',', '').strip())
    except ValueError:
        return np.nan

_df['amount_usd'] = _df['amount_usd'].map(_parse_amt)

# 5b. Also clean total_amount if it exists (same logic)
if 'total_amount' in _df.columns:
    _df['total_amount'] = _df['total_amount'].map(_parse_amt)

# 6. Quantity -> extract numeric value (remove " units" suffix if present)
def _parse_quantity(v):
    if pd.isna(v) or str(v).strip() == '':
        return np.nan
    s = str(v).strip().lower()
    s = s.replace('units', '').replace('unit', '').strip()
    try:
        return float(s)
    except ValueError:
        return np.nan

_df['quantity'] = _df['quantity'].map(_parse_quantity)

# 7. Country -> standardize (keep as-is if not in mapping)
_CMAP = {
    'australia': 'AU', 'aus': 'AU', 'au': 'AU',
    'new zealand': 'NZ', 'nz': 'NZ',
    'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'us': 'US',
    'united kingdom': 'GB', 'great britain': 'GB', 'uk': 'GB', 'gb': 'GB',
}

_df['country'] = _df['country'].map(lambda v: _CMAP.get(str(v).lower().strip(), v) if not pd.isna(v) else v)

# 8. Status -> lowercase
_df['status'] = _df['status'].fillna('').astype(str).str.lower()

# Output: preserve all original input columns in original column order
output_df = _df.copy()

# Build output_mask: mark transformed columns as True, others as False
output_mask = pd.DataFrame(False, index=output_df.index, columns=output_df.columns)

# Mark the 8 cleaned core columns as transformed
for _col in ['order_id', 'customer_name', 'email', 'order_date', 'amount_usd', 'quantity', 'country', 'status']:
    if _col in output_mask.columns:
        output_mask[_col] = True

# Also mark total_amount as transformed if it was cleaned
if 'total_amount' in output_mask.columns:
    output_mask['total_amount'] = True