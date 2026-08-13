const suits = [
  "spades",
  "hearts",
  "diamonds",
  "clubs",
];

export const createDeck = () => {
  const deck = [];

  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        rank: rank,
        suit: suit,
      });
    }
  }

  return deck;
};


export const shuffleDeck = (deck) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(
      Math.random() * (i + 1),
    );

    [deck[i], deck[randomIndex]] = [
      deck[randomIndex],
      deck[i],
    ];
  }

  return deck;
};
