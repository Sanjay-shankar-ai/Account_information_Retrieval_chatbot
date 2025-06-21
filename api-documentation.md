# Financial Assistant API Documentation

## Base URL
`http://localhost:3000`

## Endpoints

### 1. Health Check
**GET** `/health`

Returns the API status.

**Response:**
```json
{
  "status": "OK",
  "message": "Financial Assistant API is running"
}
```

### 2. Login/Verify Account
**POST** `/api/login`

Verifies account number and returns customer information.

**Request Body:**
```json
{
  "accountNumber": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "customer": {
    "accountNumber": "1234567890",
    "name": "Sanjay S",
    "email": "sanjayshankar91@gmail.com",
    "balance": 12500.75
  }
}
```

### 3. Ask Financial Question
**POST** `/api/ask`

Processes natural language queries about financial data using AI.

**Request Body:**
```json
{
  "accountNumber": "1234567890",
  "query": "What is my current balance?"
}
```

**Response:**
```json
{
  "success": true,
  "response": "Your current balance is $12,500.75. Based on your recent transactions..."
}
```

### 4. Get Transactions
**POST** `/api/transactions`

Retrieves transactions for a specific date range.

**Request Body:**
```json
{
  "accountNumber": "1234567890",
  "startDate": "2024-03-01",
  "endDate": "2024-04-30"
}
```

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "date": "2024-03-21",
      "type": "Deposit",
      "amount": 1000,
      "description": "Salary credited"
    }
  ]
}
```

### 5. Get Transaction Summary
**POST** `/api/summary`

Returns a summary of transactions grouped by type.

**Request Body:**
```json
{
  "accountNumber": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "Deposit": 3250,
    "Withdrawal": 300,
    "Transfer": 500
  }
}
```

### 6. Send Email Statement
**POST** `/api/email-statement`

Sends a 30-day transaction statement via email.

**Request Body:**
```json
{
  "accountNumber": "1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email sent successfully"
}
```

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400`: Bad Request (missing required fields)
- `404`: Not Found (invalid account number)
- `500`: Internal Server Error

## Environment Variables

Create a `.env` file with the following variables:

```
GROQ_API_KEY=your_groq_api_key
EMAIL_USER=your_gmail_address
EMAIL_PASS=your_gmail_app_password
PORT=3000
```

## Usage Example

```javascript
// Login
const loginResponse = await fetch('http://localhost:3000/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ accountNumber: '1234567890' })
});

// Ask question
const askResponse = await fetch('http://localhost:3000/api/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    accountNumber: '1234567890',
    query: 'Show me my recent transactions'
  })
});
```