require('dotenv').config();
const express = require('express');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3000;


// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Use our routes (prefixed with / so they are accessible at the root without 
// any additional path. Example: /register instead of /users/register had it
// been prefixed with /users)
app.use('/', userRoutes);

const server = app.listen(PORT, () => {
 console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
 console.error(`Error starting server: ${err}`);
});