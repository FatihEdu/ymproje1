const path = require('node:path');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');

exports.getRegisterPage = (req, res) => {
 res.sendFile(path.join(__dirname, '../views/register.html'));
};

exports.registerUser = async (req, res) => {
 const { username, password } = req.body;

 if (!username || !password) {
 return res.status(400).send('Please fill all fields.');
 }

 const saltRounds = Number.parseInt(process.env.SALT_ROUNDS || '10', 10);
 try {
	 const hashed = await bcrypt.hash(password, saltRounds);
	 User.save({ username, password: hashed });
	 res.send(`User ${username} registered successfully! Check data/users.json`);
 } catch (err) {
	 console.error('Hashing error:', err);
	 res.status(500).send('Internal server error');
 }
};