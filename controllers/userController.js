const path = require('node:path');
const bcrypt = require('bcryptjs');
const User = require('../models/userModel');

const MIN_SALT_ROUNDS = 10;
const MAX_SALT_ROUNDS = 20;
const DEFAULT_SALT_ROUNDS = 10;

exports.getRegisterPage = (req, res) => {
 res.sendFile(path.join(__dirname, '../views/register.html'));
};

exports.registerUser = async (req, res) => {
 const { username, password } = req.body;

 if (!username || !password) {
 return res.status(400).send('Please fill all fields.');
 }

 const parsed = Number.parseInt(process.env.SALT_ROUNDS, 10);
 const saltRounds = Number.isFinite(parsed) && parsed >= MIN_SALT_ROUNDS && parsed <= MAX_SALT_ROUNDS
  ? parsed
  : DEFAULT_SALT_ROUNDS;
 try {
	 const hashed = await bcrypt.hash(password, saltRounds);
	 User.save({ username, password: hashed });
	 res.send(`User ${username} registered successfully! Check data/users.json`);
 } catch (err) {
	 console.error('Hashing error:', err);
	 res.status(500).send('Internal server error');
 }
};