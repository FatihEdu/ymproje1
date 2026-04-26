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
  },

  getByUsername: (username) => {
    const users = User.getAll();
    for (let i = users.length - 1; i >= 0; i -= 1) {
      if (users[i].username === username) return users[i];
    }
    return null;
  },

  getFavorites: (username) => {
    const user = User.getByUsername(username);
    if (!user) return [];
    if (!Array.isArray(user.favorites)) return [];
    return user.favorites;
  },

  addFavorite: (username, favorite) => {
    ensureDataFile();
    const users = User.getAll();
    let idx = -1;

    for (let i = users.length - 1; i >= 0; i -= 1) {
      if (users[i].username === username) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return false;

    const user = users[idx];
    if (!Array.isArray(user.favorites)) user.favorites = [];

    const exists = user.favorites.some((fav) =>
      fav?.pair === favorite?.pair && fav?.providerName === favorite?.providerName
    );
    if (!exists) {
      user.favorites.push({
        pair: favorite.pair,
        providerName: favorite.providerName,
      });
    }

    users[idx] = user;
    fs.writeFileSync(dataPath, JSON.stringify(users, null, 2), 'utf8');
    return true;
  },

  removeFavorite: (username, favorite) => {
    ensureDataFile();
    const users = User.getAll();
    let idx = -1;

    for (let i = users.length - 1; i >= 0; i -= 1) {
      if (users[i].username === username) {
        idx = i;
        break;
      }
    }

    if (idx === -1) return false;

    const user = users[idx];
    if (!Array.isArray(user.favorites)) user.favorites = [];

    user.favorites = user.favorites.filter((fav) =>
      !(fav?.pair === favorite?.pair && fav?.providerName === favorite?.providerName)
    );

    users[idx] = user;
    fs.writeFileSync(dataPath, JSON.stringify(users, null, 2), 'utf8');
    return true;
  }
};

module.exports = User;
