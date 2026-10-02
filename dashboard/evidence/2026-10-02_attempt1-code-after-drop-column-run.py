import re
from datetime import datetime

# Start with input dataframe
df = input_df_1.copy()

# Rule 1: Drop rows where order_id or amount_usd is missing (NaN or empty string)
df = df[~((df['order_id'].isna()) | (df['order_id'] == '') | 
          (df['amount_usd'].isna()) | (df['amount_usd'] == ''))]

# Rule 2: Trim whitespace from customer_name and convert to Title Case
df['customer_name'] = df['customer_name'].fillna('').str.strip().str.title()

# Rule 3: Lowercase email and validate pattern (name@domain.tld)
def validate_email(email):
    if pd.isna(email) or email == '':
        return ''
    email_lower = str(email).lower().strip()
    # Check pattern: contains '@' and at least one '.' after '@'
    if '@' not in email_lower:
        return ''
    parts = email_lower.split('@')
    if len(parts) != 2:
        return ''
    domain = parts[1]
    if '.' not in domain:
        return ''
    return email_lower

df['email'] = df['email'].apply(validate_email)

# Rule 4: Parse order_date supporting formats MM/DD/YYYY, YYYY-MM-DD, and 'Mon D YYYY'
# Output as YYYY-MM-DD string
def parse_date(date_val):
    if pd.isna(date_val) or date_val == '':
        return ''
    
    # If already a datetime, convert to string first
    if isinstance(date_val, pd.Timestamp):
        return date_val.strftime('%Y-%m-%d')
    
    date_str = str(date_val).strip()
    if not date_str:
        return ''
    
    # Try multiple formats
    formats = ['%m/%d/%Y', '%Y-%m-%d', '%b %d %Y']
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            continue
    
    return ''

df['order_date'] = df['order_date'].apply(parse_date)

# Rule 5: Remove '$' and ',' from amount_usd then convert to float
def parse_amount(amount_val):
    if pd.isna(amount_val) or amount_val == '':
        return np.nan
    
    amount_str = str(amount_val).replace('$', '').replace(',', '').strip()
    try:
        return float(amount_str)
    except ValueError:
        return np.nan

df['amount_usd'] = df['amount_usd'].apply(parse_amount)

# Rule 6: Standardise country to ISO-2 codes
country_mapping = {
    'australia': 'AU', 'aus': 'AU', 'au': 'AU',
    'new zealand': 'NZ', 'nz': 'NZ',
    'united states': 'US', 'usa': 'US', 'us': 'US',
    'united kingdom': 'GB', 'uk': 'GB', 'gb': 'GB'
}

def standardize_country(country_val):
    if pd.isna(country_val) or country_val == '':
        return country_val
    country_lower = str(country_val).lower().strip()
    return country_mapping.get(country_lower, country_val)

df['country'] = df['country'].apply(standardize_country)

# Rule 7: Lowercase the status column
df['status'] = df['status'].fillna('').astype(str).str.lower()

# Select and order the 8 required columns
output_df = df[['order_id', 'customer_name', 'email', 'order_date', 'amount_usd', 'quantity', 'country', 'status']].copy()

# Create output mask: mark all newly created/modified columns as True
output_mask = pd.DataFrame(True, index=output_df.index, columns=output_df.columns)