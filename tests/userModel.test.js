const fs = require("node:fs");
const path = require("node:path");

jest.mock("node:fs");

const User = require("../models/userModel");

const dataPath = path.join(__dirname, "../data/users.json");

describe("User Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue("[]");
    fs.writeFileSync.mockClear();
  });

  test("getFavorites should return empty array when user is not found", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([]));
    const result = User.getFavorites("olmayan_kullanici");
    expect(result).toEqual([]);
  });
  test("addFavorite should work correctly if favorites property is null", () => {
    const userData = { username: "testuser", favorites: null };
    const favoriteToAdd = { pair: "BTC/USDT", providerName: "Binance" };
    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));

    const result = User.addFavorite("testuser", favoriteToAdd);
    expect(result).toBe(true);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      dataPath,
      JSON.stringify(
        [{ username: "testuser", favorites: [favoriteToAdd] }],
        null,
        2,
      ),
      "utf8",
    );
  });
  test("removeFavorite should return false if user is not found", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([]));
    const result = User.removeFavorite("bu_kullanici_yok", {
      pair: "BTC/USDT",
    });
    expect(result).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
  test("getAll should return an empty array when users.json is empty", () => {
    fs.readFileSync.mockReturnValue("   ");
    const users = User.getAll();
    expect(users).toEqual([]);
  });

  test("save should add a user to users.json", () => {
    const userData = { username: "testuser", favorites: [] };
    User.save(userData);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      dataPath,
      JSON.stringify([userData], null, 2),
      "utf8",
    );
  });

  test("getByUsername should return the correct user", () => {
    const userData = { username: "testuser", favorites: [] };
    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));
    const user = User.getByUsername("testuser");
    expect(user).toEqual(userData);
  });

  test("getFavorites should return the favorites of a user", () => {
    const userData = { username: "testuser", favorites: ["item1", "item2"] };
    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));
    const favorites = User.getFavorites("testuser");
    expect(favorites).toEqual(["item1", "item2"]);
  });

  test("addFavorite should add a favorite to the user", () => {
    const userData = {
      username: "testuser",
      favorites: [],
    };

    const favorite = {
      pair: "BTC/USD",
      providerName: "Binance",
    };

    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));

    User.addFavorite("testuser", favorite);

    expect(fs.writeFileSync).toHaveBeenLastCalledWith(
      dataPath,
      JSON.stringify(
        [
          {
            username: "testuser",
            favorites: [
              {
                pair: "BTC/USD",
                providerName: "Binance",
              },
            ],
          },
        ],
        null,
        2,
      ),
      "utf8",
    );
  });
  test("removeFavorite should remove a favorite from the user", () => {
    const userData = {
      username: "testuser",
      favorites: [
        {
          pair: "BTC/USD",
          providerName: "Binance",
        },
        {
          pair: "ETH/USD",
          providerName: "Coinbase",
        },
      ],
    };

    const favorite = {
      pair: "BTC/USD",
      providerName: "Binance",
    };

    fs.readFileSync.mockReturnValue(JSON.stringify([userData]));

    User.removeFavorite("testuser", favorite);

    expect(fs.writeFileSync).toHaveBeenLastCalledWith(
      dataPath,
      JSON.stringify(
        [
          {
            username: "testuser",
            favorites: [
              {
                pair: "ETH/USD",
                providerName: "Coinbase",
              },
            ],
          },
        ],
        null,
        2,
      ),
      "utf8",
    );
  });

  test("should create users.json if it does not exist", () => {
    fs.existsSync.mockReturnValue(false);
    User.getAll();
    expect(fs.writeFileSync).toHaveBeenCalledWith(dataPath, "[]", "utf8");
  });

  test("should return empty array and log error if JSON is corrupted", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    fs.readFileSync.mockReturnValue("invalid-json");
    const users = User.getAll();
    expect(users).toEqual([]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("Error parsing users.json:"),
      expect.any(Error),
    );
    spy.mockRestore();
  });

  test("should return null for non-existent user in getByUsername", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([{ username: "other" }]));
    const user = User.getByUsername("fake_user");
    expect(user).toBeNull();
  });

  test("should return false when adding favorite to a non-existent user", () => {
    fs.readFileSync.mockReturnValue(JSON.stringify([]));
    const result = User.addFavorite("fake_user", { pair: "BTC/USDT" });
    expect(result).toBe(false);
  });
});
