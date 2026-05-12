const fs = require('node:fs');
const path = require('node:path');

jest.mock('node:fs');

const User = require('../models/userModel');

const dataPath = path.join(__dirname, '../data/users.json');

describe('User Model', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('[]');
    fs.writeFileSync.mockClear();
  });

  test('getAll should return an empty array when users.json is empty', () => {
    fs.readFileSync.mockReturnValue('   ');
    const users = User.getAll();
    expect(users).toEqual([]);
  });

    test('save should add a user to users.json', () => {
        const userData = { username: 'testuser', favorites: [] };
        User.save(userData);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            dataPath,
            JSON.stringify([userData], null, 2),
            'utf8'
        );
    });

    test('getByUsername should return the correct user', () => {
        const userData = { username: 'testuser', favorites: [] };
        fs.readFileSync.mockReturnValue(JSON.stringify([userData]));
        const user = User.getByUsername('testuser');
        expect(user).toEqual(userData);
    });

    test('getFavorites should return the favorites of a user', () => {
        const userData = { username: 'testuser', favorites: ['item1', 'item2'] };
        fs.readFileSync.mockReturnValue(JSON.stringify([userData]));
        const favorites = User.getFavorites('testuser');
        expect(favorites).toEqual(['item1', 'item2']);
    });

    test('addFavorite should add a favorite to the user', () => {
    const userData = {
        username: 'testuser',
        favorites: []
    };

    const favorite = {
        pair: 'BTC/USD',
        providerName: 'Binance'
    };

    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));

    User.addFavorite('testuser', favorite);

    expect(fs.writeFileSync).toHaveBeenLastCalledWith(
        dataPath,
        JSON.stringify(
            [
    {
                    username: 'testuser',
                    favorites: [
                        {
                            pair: 'BTC/USD',
                            providerName: 'Binance'
                        }
                    ]
                }
                ],
                null,
                2
            ),
            'utf8'
        );
    });
    test('removeFavorite should remove a favorite from the user', () => {
        const userData = {
            username: 'testuser',
            favorites: [
                {
                    pair: 'BTC/USD',
                    providerName: 'Binance'
                },
                {
                    pair: 'ETH/USD',
                    providerName: 'Coinbase'
                }
            ]
        };

        const favorite = {
            pair: 'BTC/USD',
            providerName: 'Binance'
        };

        fs.readFileSync.mockReturnValue(JSON.stringify([userData]));

        User.removeFavorite('testuser', favorite);

        expect(fs.writeFileSync).toHaveBeenLastCalledWith(
            dataPath,
            JSON.stringify(
                [
                    {
                        username: 'testuser',
                        favorites: [
                            {
                                pair: 'ETH/USD',
                                providerName: 'Coinbase'
                            }
                        ]
                    }
                ],
                null,
                2
            ),
            'utf8'
        );
    });
});
