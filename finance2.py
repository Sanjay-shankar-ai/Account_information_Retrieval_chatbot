import streamlit as st
import os
import sqlite3
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate

# --- INIT LLM ---
llm = ChatGroq(
    temperature=0,
    groq_api_key=os.getenv("GROQ_API_KEY"),
    model_name="llama-3.3-70b-versatile"
)

# --- DATABASE CONNECTION ---
conn = sqlite3.connect("customer_data.db")
cursor = conn.cursor()

# --- CREATE CUSTOMER + TRANSACTIONS TABLE ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS customers (
    account_number TEXT PRIMARY KEY,
    name TEXT,
    email TEXT,
    balance REAL
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS transactions (
    account_number TEXT,
    date TEXT,
    type TEXT,
    amount REAL,
    description TEXT
)
''')

# --- INSERT DUMMY DATA ---
cursor.execute("DELETE FROM customers")
cursor.execute("DELETE FROM transactions")

customers = [
    ("1234567890", "Sanjay S", "sanjayshankar91@gmail.com", 12500.75),
]

transactions = [
    ("1234567890", "2024-03-21", "Deposit", 1000, "Salary credited"),
    ("1234567890", "2024-03-25", "Withdrawal", 200, "ATM cash withdrawal"),
    ("1234567890", "2024-03-30", "Transfer", 500, "Sent to friend"),
    ("1234567890", "2024-04-02", "Deposit", 750, "Refund from vendor"),
    ("1234567890", "2024-04-10", "Withdrawal", 100, "Online shopping"),
    ("1234567890", "2024-04-19", "Deposit", 1500, "Freelance payment"),
]

cursor.executemany('INSERT OR REPLACE INTO customers VALUES (?, ?, ?, ?)', customers)
cursor.executemany('INSERT INTO transactions VALUES (?, ?, ?, ?, ?)', transactions)
conn.commit()

# --- SESSION ---
st.set_page_config(layout="wide")
st.title("AI Customer Financial Assistant(Account Information)")
st.caption("Powered by Llama 3.3")

if 'authenticated' not in st.session_state:
    st.session_state['authenticated'] = False
if 'account_number' not in st.session_state:
    st.session_state['account_number'] = ""
if 'conversation' not in st.session_state:
    st.session_state['conversation'] = []

# --- LOGIN ---
if not st.session_state['authenticated']:
    acc_input = st.text_input("Enter account number to login:")
    if st.button("Verify"):
        cursor.execute('SELECT * FROM customers WHERE account_number = ?', (acc_input,))
        result = cursor.fetchone()
        if result:
            st.session_state['authenticated'] = True
            st.session_state['account_number'] = acc_input
            st.rerun()
        else:
            st.error("Invalid account number.")
    st.stop()

# --- GET CUSTOMER ---
cursor.execute('SELECT * FROM customers WHERE account_number = ?', (st.session_state['account_number'],))
customer = cursor.fetchone()
if customer:
    st.sidebar.header("Customer Info")
    st.sidebar.write(f"**Name:** {customer[1]}")
    st.sidebar.write(f"**Email:** {customer[2]}")

# --- HELPER: FETCH TRANSACTIONS ---
def fetch_transactions(account_number, start_date=None, end_date=None):
    query = 'SELECT date, type, amount, description FROM transactions WHERE account_number = ?'
    params = [account_number]
    if start_date and end_date:
        query += ' AND date BETWEEN ? AND ?'
        params.extend([start_date, end_date])
    cursor.execute(query, tuple(params))
    return cursor.fetchall()

# --- FEATURE SELECTOR ---
feature = st.selectbox("Choose a service", [
    "Ask a financial question",
    "List transactions for date range",
    "Get summary by transaction type",
    "Email last 30 days statement"
])

# --- PROMPT TEMPLATE ---
prompt_template = PromptTemplate.from_template("""
### CUSTOMER QUERY:
{query}

### CUSTOMER INFO:
Name: {name}
Balance: ${balance}
Recent Transactions:
{transactions}

### RESPONSE:
You are a professional financial assistant. Help the user clearly and concisely based on the given data.
""")

# --- EMAIL SENDER FUNCTION ---
def send_email(receiver, subject, body):
    msg = EmailMessage()
    msg.set_content(body)
    msg['Subject'] = subject
    msg['From'] = "sanhulk73@gmail.com"
    msg['To'] = receiver
    server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
    server.login("sanhulk73@gmail.com", "lqdh rosa cdcz xlyr")  # App password
    server.send_message(msg)
    server.quit()

# --- FEATURE 1: QUERY CHAT ---
if feature == "Ask a financial question":
    user_query = st.text_input("Ask your financial question:")
    if user_query:
        transactions = fetch_transactions(customer[0])
        tx_text = "\n".join([f"{t[0]} - {t[1]} - ${t[2]} - {t[3]}" for t in transactions[-5:]])
        prompt = prompt_template.format(query=user_query, name=customer[1], balance=customer[3], transactions=tx_text)
        with st.spinner("AI is thinking..."):
            response = llm.invoke(prompt)
            st.session_state['conversation'].append({"role": "user", "content": user_query})
            st.session_state['conversation'].append({"role": "ai", "content": response.content})

# --- FEATURE 2: Date Range Transactions ---
elif feature == "List transactions for date range":
    col1, col2 = st.columns(2)
    with col1:
        start_date = st.date_input("Start Date")
    with col2:
        end_date = st.date_input("End Date")
    if st.button("Get Transactions"):
        tx = fetch_transactions(customer[0], str(start_date), str(end_date))
        st.write(f"Transactions from {start_date} to {end_date}:")
        for t in tx:
            st.write(f"- {t[0]} | {t[1]} | ${t[2]} | {t[3]}")

# --- FEATURE 3: Summary by Type ---
elif feature == "Get summary by transaction type":
    tx = fetch_transactions(customer[0])
    summary = {}
    for t in tx:
        summary[t[1]] = summary.get(t[1], 0) + t[2]
    st.subheader("Transaction Summary by Type")
    for tx_type, total in summary.items():
        st.write(f"- **{tx_type}**: ${total:,.2f}")

# --- FEATURE 4: Email Statement ---
elif feature == "Email last 30 days statement":
    if st.button("Send Email"):
        last_30 = (datetime.today() - timedelta(days=30)).strftime("%Y-%m-%d")
        tx = fetch_transactions(customer[0], last_30, datetime.today().strftime("%Y-%m-%d"))
        tx_list = "\n".join([f"{t[0]} - {t[1]} - ${t[2]} - {t[3]}" for t in tx])
        email_text = f"Hi {customer[1]},\n\nHere is your statement for the last 30 days:\n\n{tx_list}\n\nRegards,\nYour Bank"
        send_email(customer[2], "Your 30-Day Bank Statement", email_text)
        st.success("Email sent!")

# --- Display Conversation ---
for msg in st.session_state['conversation']:
    if msg["role"] == "user":
        st.markdown(f"<div style='background-color:#DCF8C6;color:black;padding:10px;border-radius:10px;margin-left:80px;'><strong>You:</strong> {msg['content']}</div>", unsafe_allow_html=True)
    else:
        st.markdown(f"<div style='background-color:#E3F2FD;color:black;padding:10px;border-radius:10px;margin-right:80px;'><strong>AI:</strong> {msg['content']}</div>", unsafe_allow_html=True)

# --- CLOSE DB ---
conn.close()
