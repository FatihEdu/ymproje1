const fs = require('node:fs');
const path = require('node:path');

const dataPath = path.join(__dirname, '../data/users.json');

const ensureDataFile = () => {
  if (!fs.existsSync(dataPath)) {
    fs.writeFileSync(dataPath, '[]', 'utf8');
  }
};

const User = {
  getAll: () => {
    ensureDataFile();

    const data = fs.readFileSync(dataPath, 'utf8');
    if (!data.trim()) {
      return [];
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing users.json:', error);
      return [];
    }
  },

  save: (userData) => {
    ensureDataFile();
    const users = User.getAll();
    users.push(userData);
    fs.writeFileSync(dataPath, JSON.stringify(users, null, 2), 'utf8');
  }
};

module.exports = User;
