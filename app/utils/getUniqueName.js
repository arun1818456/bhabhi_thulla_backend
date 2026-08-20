import User from "../modules/user/model.js";

const guestWords = [
  "Falcon",
  "Shadow",
  "Storm",
  "Wolf",
  "Blaze",
  "Dragon",
  "Tiger",
  "Phoenix",
  "Hunter",
  "Legend",
  "Warrior",
  "Eagle",
  "Ninja",
  "Ghost",
  "Thunder",
  "Rocket",
  "Viper",
  "Cobra",
  "Panther",
  "Lion",
  "Hawk",
  "Ace",
  "Hero",
  "King",
  "Master",
  "Nova",
  "Cosmic",
  "Rider",
  "Striker",
  "Champion",
];

export const getUniqueGuestName = async () => {
  while (true) {
    const word =
      guestWords[Math.floor(Math.random() * guestWords.length)];

    const randomNumber = Math.floor(1000 + Math.random() * 9000);

    const userName = `Guest${word}${randomNumber}`;

    const existingUser = await User.findOne({ userName });

    if (!existingUser) {
      return userName;
    }
  }
};
