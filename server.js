const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { parse } = require('querystring');
const { MongoClient } = require('mongodb');

// MongoDB connection URL and database/collection names
const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'bank';
const collectionName = 'deposits';

let db;
let collection;

// Connect to MongoDB
MongoClient.connect(mongoUrl, { useUnifiedTopology: true })
    .then(client => {
        db = client.db(dbName);
        collection = db.collection(collectionName);
        console.log('Connected to MongoDB');
    })
    .catch(err => {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    });

// Create the server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;

    if (parsedUrl.pathname === '/' && method === 'GET') {
        // Serve the HTML form
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    } else if (parsedUrl.pathname === '/styles.css' && method === 'GET') {
        // Serve the CSS file
        fs.readFile(path.join(__dirname, 'styles.css'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(data);
        });
    } else if (parsedUrl.pathname === '/script.js' && method === 'GET') {
        // Serve the JavaScript file
        fs.readFile(path.join(__dirname, 'script.js'), (err, data) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(data);
        });
    } else if (parsedUrl.pathname === '/api/deposit' && method === 'POST') {
        // Handle form submission
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            console.log('Received body:', body);
            const data = parse(body);

            // Basic validation
            const requiredFields = [
                'bankName', 'branchName', 'date', 'name', 'accountNumber', 'amountInNumbers',
                'amountInWords', 'denominations', 'totalAmount', 'panNumber', 'mailId'
            ];

            for (const field of requiredFields) {
                if (!data[field]) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: `Missing required field: ${field}` }));
                    return;
                }
            }

            if (!/^[a-zA-Z0-9]{10,12}$/.test(data.accountNumber)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Account Number must be alphanumeric and 10 to 12 characters long.' }));
                return;
            }

            if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.panNumber)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'PAN Number must be in the format ABCDE1234F.' }));
                return;
            }

            const amountInNumbers = parseFloat(data.amountInNumbers);
            const totalAmount = parseFloat(data.totalAmount);
            const today = new Date();

            if (isNaN(amountInNumbers) || isNaN(totalAmount)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Amount fields must be valid numbers.' }));
                return;
            }

            if (amountInNumbers <= 0 || totalAmount <= 0) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Amount fields must be greater than zero.' }));
                return;
            }

            if (amountInNumbers !== totalAmount) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Amount in Numbers and Total Amount must match.' }));
                return;
            }

            if (!isNaN(data.amountInWords)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Amount in Words must not be an integer.' }));
                return;
            }

            if (new Date(data.date) < today.setHours(0, 0, 0, 0)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Date must be today or later.' }));
                return;
            }

            // Insert data into MongoDB
            collection.insertOne(data, (err, result) => {
                if (err) {
                    console.error('Error inserting data into MongoDB:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ message: 'Failed to save deposit' }));
                    return;
                }
                console.log('Deposit inserted:', result);
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Deposit received', deposit: data }));
            });
        });
    } else {
        // Handle 404 errors
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

// Start the server
server.listen(3000, () => {
    console.log('Server running at http://localhost:3000');
});
