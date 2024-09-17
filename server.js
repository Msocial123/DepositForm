const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { parse } = require('querystring');
const { MongoClient } = require('mongodb');

// MongoDB connection URL from environment variables
const mongoUrl = process.env.MONGO_URI || 'mongodb://mongodb:27017'; // Default to local if not provided
//const mongoUrl = process.env.MONGO_URI || 'mongodb://localhost:27017';  for running in mongoDBCompass
const dbName = 'bank';
const collectionName = 'deposits';

let db;
let collection;

// Connect to MongoDB
async function connectToMongo() {
    try {
        const client = await MongoClient.connect(mongoUrl, { useUnifiedTopology: true });
        db = client.db(dbName);
        collection = db.collection(collectionName);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
}

connectToMongo();

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const method = req.method;

    let filePath = path.join(__dirname, parsedUrl.pathname);
    if (filePath === path.join(__dirname, '/')) {
        filePath = path.join(__dirname, 'main.html');
    }

    const extname = path.extname(filePath);
    const contentType = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif'
    }[extname] || 'text/plain';

    if (method === 'GET') {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('500 Internal Server Error');
                }
                console.error(`Error reading file ${filePath}:`, err);
                return;
            }
            res.writeHead(200, { 'Content-Type': contentType });
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

            // Logging received data for debugging
            console.log('Parsed form data:', data);

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

server.listen(3011, () => {
    console.log('Server running at http://localhost:3011');
});
