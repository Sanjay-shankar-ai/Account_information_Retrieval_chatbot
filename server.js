import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import nodemailer from 'nodemailer';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Database setup
const dbPath = join(__dirname, 'customer_data.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables and dummy data
const initializeDatabase = () => {
  db.serialize(() => {
    // Create tables
    db.run(`
      CREATE TABLE IF NOT EXISTS customers (
        account_number TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        balance REAL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS transactions (
        account_number TEXT,
        date TEXT,
        type TEXT,
        amount REAL,
        description TEXT
      )
    `);

    // Clear existing data
    db.run("DELETE FROM customers");
    db.run("DELETE FROM transactions");

    // Insert dummy data
    const customers = [
      ["1234567890", "Sanjay S", "sanjayshankar91@gmail.com", 12500.75],
    ];

    const transactions = [
      ["1234567890", "2024-03-21", "Deposit", 1000, "Salary credited"],
      ["1234567890", "2024-03-25", "Withdrawal", 200, "ATM cash withdrawal"],
      ["1234567890", "2024-03-30", "Transfer", 500, "Sent to friend"],
      ["1234567890", "2024-04-02", "Deposit", 750, "Refund from vendor"],
      ["1234567890", "2024-04-10", "Withdrawal", 100, "Online shopping"],
      ["1234567890", "2024-04-19", "Deposit", 1500, "Freelance payment"],
    ];

    const customerStmt = db.prepare('INSERT OR REPLACE INTO customers VALUES (?, ?, ?, ?)');
    customers.forEach(customer => customerStmt.run(customer));
    customerStmt.finalize();

    const transactionStmt = db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?)');
    transactions.forEach(transaction => transactionStmt.run(transaction));
    transactionStmt.finalize();
  });
};

// Email transporter setup
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper functions
const fetchTransactions = (accountNumber, startDate = null, endDate = null) => {
  return new Promise((resolve, reject) => {
    let query = 'SELECT date, type, amount, description FROM transactions WHERE account_number = ?';
    let params = [accountNumber];
    
    if (startDate && endDate) {
      query += ' AND date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }
    
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const getCustomer = (accountNumber) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE account_number = ?', [accountNumber], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Financial Assistant API is running' });
});

// Login/Verify account
app.post('/api/login', async (req, res) => {
  try {
    const { accountNumber } = req.body;
    
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    const customer = await getCustomer(accountNumber);
    
    if (customer) {
      res.json({
        success: true,
        customer: {
          accountNumber: customer.account_number,
          name: customer.name,
          email: customer.email,
          balance: customer.balance
        }
      });
    } else {
      res.status(404).json({ error: 'Invalid account number' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ask financial question
app.post('/api/ask', async (req, res) => {
  try {
    const { accountNumber, query } = req.body;
    
    if (!accountNumber || !query) {
      return res.status(400).json({ error: 'Account number and query are required' });
    }

    const customer = await getCustomer(accountNumber);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const transactions = await fetchTransactions(accountNumber);
    const recentTransactions = transactions.slice(-5);
    const txText = recentTransactions.map(t => `${t.date} - ${t.type} - $${t.amount} - ${t.description}`).join('\n');

    const prompt = `
### CUSTOMER QUERY:
${query}

### CUSTOMER INFO:
Name: ${customer.name}
Balance: $${customer.balance}
Recent Transactions:
${txText}

### RESPONSE:
You are a professional financial assistant. Help the user clearly and concisely based on the given data.
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      temperature: 0
    });

    res.json({
      success: true,
      response: completion.choices[0].message.content
    });
  } catch (error) {
    console.error('Error in /api/ask:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// Get transactions by date range
app.post('/api/transactions', async (req, res) => {
  try {
    const { accountNumber, startDate, endDate } = req.body;
    
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    const transactions = await fetchTransactions(accountNumber, startDate, endDate);
    
    res.json({
      success: true,
      transactions: transactions.map(t => ({
        date: t.date,
        type: t.type,
        amount: t.amount,
        description: t.description
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get transaction summary by type
app.post('/api/summary', async (req, res) => {
  try {
    const { accountNumber } = req.body;
    
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    const transactions = await fetchTransactions(accountNumber);
    const summary = {};
    
    transactions.forEach(t => {
      summary[t.type] = (summary[t.type] || 0) + t.amount;
    });

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Send email statement
app.post('/api/email-statement', async (req, res) => {
  try {
    const { accountNumber } = req.body;
    
    if (!accountNumber) {
      return res.status(400).json({ error: 'Account number is required' });
    }

    const customer = await getCustomer(accountNumber);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get last 30 days transactions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const transactions = await fetchTransactions(accountNumber, startDate, endDate);
    const txList = transactions.map(t => `${t.date} - ${t.type} - $${t.amount} - ${t.description}`).join('\n');

    const emailText = `Hi ${customer.name},

Here is your statement for the last 30 days:

${txList}

Current Balance: $${customer.balance}

Regards,
Your Bank`;

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: customer.email,
      subject: 'Your 30-Day Bank Statement',
      text: emailText
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: 'Email sent successfully'
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Initialize database and start server
initializeDatabase();

app.listen(PORT, () => {
  console.log(`Financial Assistant API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});