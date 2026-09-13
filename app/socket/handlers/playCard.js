import rooms from "../../data/match_rooms.js";

const TRICK_RESOLUTION_DELAY = 1500;

const ACE_OF_SPADES = {
  rank: 1,
  suit: "spades",
};

// ==========================================
// CARD HELPERS
// ==========================================

const sameCard = (left, right) => {
  return (
    left?.rank === right?.rank &&
    left?.suit === right?.suit
  );
};

// Ace highest
// 2 < 3 < ... < 10 < J < Q < K < A
const cardValue = (card) => {
  if (!card) return -1;
  return card.rank === 1 ? 14 : card.rank;
};

// ==========================================
// ERROR
// ==========================================

const emitGameError = (socket, type, message) => {
  const error = {
    type,
    message,
  };

  socket.emit("game_error", error);
  socket.emit("play_card_error", error);
};

// ==========================================
// NEXT SEAT
// ==========================================

const nextSeat = (room, seat) => {
  if (seat >= room.playersCount) {
    return 1;
  }

  return seat + 1;
};

// ==========================================
// FIND PLAYER
// ==========================================

const findPlayerBySocket = (room, socketId) => {
  return room.players.find(
    (player) => player.socketId === socketId
  );
};

// ==========================================
// CHECK PLAYER HAS SUIT
// ==========================================

const playerHasSuit = (player, suit) => {
  return player.cards.some(
    (card) => card.suit === suit
  );
};

// ==========================================
// FIND WINNER
// ==========================================

const findTrickWinner = (room) => {
  if (!room.tableCards?.length) {
    return null;
  }

  const leadSuit = room.leadSuit;

  if (!leadSuit) {
    return null;
  }

  const leadSuitCards = room.tableCards.filter(
    (played) =>
      played.card?.suit === leadSuit
  );

  if (!leadSuitCards.length) {
    return null;
  }

  let winningPlayedCard = leadSuitCards[0];

  for (let i = 1; i < leadSuitCards.length; i++) {
    const currentPlayedCard = leadSuitCards[i];

    if (
      cardValue(currentPlayedCard.card) >
      cardValue(winningPlayedCard.card)
    ) {
      winningPlayedCard = currentPlayedCard;
    }
  }

  return room.players.find(
    (player) =>
      player.seat === winningPlayedCard.seat
  );
};

// ==========================================
// RESOLVE TRICK
// ==========================================

const resolveTrick = (io, roomId) => {
  const room = rooms.get(roomId);

  if (!room) {
    return;
  }

  // Prevent duplicate resolution
  if (room.resolving) {
    return;
  }

  if (!room.tableCards?.length) {
    return;
  }

  room.resolving = true;

  rooms.set(roomId, room);

  // ----------------------------------------
  // SHOW COMPLETE TRICK
  // ----------------------------------------

  io.to(roomId).emit("trick_complete", {
    roomId,
    trickNumber: room.trickNumber,
    cards: room.tableCards,
  });

  // ----------------------------------------
  // WAIT 1.5 SECOND
  // ----------------------------------------

  setTimeout(() => {
    const currentRoom = rooms.get(roomId);

    if (!currentRoom) {
      return;
    }

    if (!currentRoom.resolving) {
      return;
    }

    // --------------------------------------
    // FIND WINNER
    // --------------------------------------

    const winner = findTrickWinner(currentRoom);

    if (!winner) {
      console.error(
        `Could not find trick winner for room ${roomId}`
      );

      currentRoom.resolving = false;

      rooms.set(roomId, currentRoom);

      return;
    }

    // --------------------------------------
    // SAVE TABLE CARDS
    // --------------------------------------

    const collectedCards =
      currentRoom.tableCards.map(
        (played) => played.card
      );

    // --------------------------------------
    // ALL TABLE CARDS GO TO WINNER
    // --------------------------------------

    winner.cards.push(...collectedCards);

    // --------------------------------------
    // CLEAR TABLE
    // --------------------------------------

    currentRoom.tableCards = [];

    currentRoom.leadSuit = null;

    // --------------------------------------
    // TRICK COUNT
    // --------------------------------------

    currentRoom.completedTricks =
      (currentRoom.completedTricks || 0) + 1;

    currentRoom.trickNumber =
      (currentRoom.trickNumber || 1) + 1;

    // --------------------------------------
    // WINNER GETS NEXT TURN
    // --------------------------------------

    currentRoom.currentTurn = winner.seat;

    currentRoom.resolving = false;

    rooms.set(roomId, currentRoom);

    // --------------------------------------
    // TABLE CLEARED
    // --------------------------------------

    io.to(roomId).emit("table_cleared", {
      roomId,

      winner: {
        userId: winner.userId,
        name: winner.name,
        seat: winner.seat,
      },

      completedTricks:
        currentRoom.completedTricks,
    });

    // --------------------------------------
    // SEND UPDATED WINNER HAND
    // --------------------------------------

    /*
     * Winner received table cards.
     *
     * Only winner should receive
     * his updated hand.
     */

    const winnerSocket =
      io.sockets.sockets.get(
        winner.socketId
      );

    if (winnerSocket) {
      winnerSocket.emit("your_cards", {
        roomId,
        cards: winner.cards,
      });
    }

    // --------------------------------------
    // TURN CHANGED
    // --------------------------------------

    io.to(roomId).emit("turn_changed", {
      roomId,
      currentTurn: currentRoom.currentTurn,
    });

    console.log(
      `Trick resolved in room ${roomId}. Winner: ${winner.userId}, seat: ${winner.seat}`
    );
  }, TRICK_RESOLUTION_DELAY);
};

// ==========================================
// PLAY CARD
// ==========================================

export const handlePlayCard = (
  io,
  socket,
  data = {}
) => {
  try {
    const { roomId, card } = data;

    // ======================================
    // ROOM ID
    // ======================================

    if (!roomId) {
      emitGameError(
        socket,
        "ROOM_NOT_FOUND",
        "Room ID is required"
      );

      return;
    }

    // ======================================
    // CARD VALIDATION
    // ======================================

    if (
      !card ||
      typeof card.rank !== "number" ||
      typeof card.suit !== "string"
    ) {
      emitGameError(
        socket,
        "INVALID_CARD",
        "Invalid card data"
      );

      return;
    }

    // ======================================
    // FIND ROOM
    // ======================================

    const room = rooms.get(roomId);

    if (!room) {
      emitGameError(
        socket,
        "ROOM_NOT_FOUND",
        "Room not found"
      );

      return;
    }

    // ======================================
    // GAME STATUS
    // ======================================

    if (room.status !== "started") {
      emitGameError(
        socket,
        "GAME_NOT_STARTED",
        "Game is not active"
      );

      return;
    }

    // ======================================
    // PLAYERS COUNT
    // ======================================

    if (
      !Number.isInteger(room.playersCount) ||
      room.playersCount < 4 ||
      room.playersCount > 8
    ) {
      emitGameError(
        socket,
        "INVALID_PLAYERS_COUNT",
        "Invalid room player count"
      );

      return;
    }

    // ======================================
    // FIND PLAYER
    // ======================================

    const player = findPlayerBySocket(
      room,
      socket.id
    );

    if (!player) {
      emitGameError(
        socket,
        "PLAYER_NOT_IN_ROOM",
        "Player is not in this room"
      );

      return;
    }

    // ======================================
    // TRICK CURRENTLY RESOLVING
    // ======================================

    if (room.resolving) {
      emitGameError(
        socket,
        "TRICK_RESOLVING",
        "The trick is being resolved"
      );

      return;
    }

    // ======================================
    // TURN VALIDATION
    // ======================================

    if (room.currentTurn !== player.seat) {
      emitGameError(
        socket,
        "NOT_YOUR_TURN",
        "It is not your turn"
      );

      return;
    }

    // ======================================
    // CARD MUST EXIST IN PLAYER HAND
    // ======================================

    const cardIndex =
      player.cards.findIndex(
        (playerCard) =>
          sameCard(playerCard, card)
      );

    if (cardIndex === -1) {
      emitGameError(
        socket,
        "CARD_NOT_IN_HAND",
        "You do not have this card"
      );

      return;
    }

    // ======================================
    // TRICK INFORMATION
    // ======================================

    const trickNumber =
      room.trickNumber || 1;

    const tableCards =
      room.tableCards || [];

    const isFirstTrick =
      trickNumber === 1;

    const isFirstCard =
      tableCards.length === 0;

    // ======================================
    // FIRST CARD MUST BE ACE OF SPADES
    // ======================================

    if (isFirstTrick && isFirstCard) {
      if (!sameCard(card, ACE_OF_SPADES)) {
        emitGameError(
          socket,
          "FIRST_CARD_MUST_BE_ACE_OF_SPADES",
          "The first card must be the Ace of Spades"
        );

        return;
      }
    }

    // ======================================
    // FIRST TRICK - MUST FOLLOW SPADES
    // ======================================

    if (
      isFirstTrick &&
      !isFirstCard
    ) {
      const hasSpade =
        playerHasSuit(
          player,
          "spades"
        );

      if (
        hasSpade &&
        card.suit !== "spades"
      ) {
        emitGameError(
          socket,
          "MUST_FOLLOW_SUIT",
          "You must play a Spade"
        );

        return;
      }
    }

    // ======================================
    // NORMAL TRICKS
    // ======================================

    if (
      !isFirstTrick &&
      room.leadSuit
    ) {
      const hasLeadSuit =
        playerHasSuit(
          player,
          room.leadSuit
        );

      /*
       * If player has lead suit,
       * they MUST play it.
       *
       * If player doesn't have lead suit,
       * they can play any suit.
       */

      if (
        hasLeadSuit &&
        card.suit !== room.leadSuit
      ) {
        emitGameError(
          socket,
          "MUST_FOLLOW_SUIT",
          `You must play ${room.leadSuit}`
        );

        return;
      }
    }

    // ======================================
    // REMOVE CARD FROM HAND
    // ======================================

    const playedCard =
      player.cards.splice(
        cardIndex,
        1
      )[0];

    // ======================================
    // CREATE PLAYED CARD OBJECT
    // ======================================

    const played = {
      userId: player.userId,
      name: player.name,
      seat: player.seat,

      card: playedCard,
    };

    // ======================================
    // ADD TO TABLE
    // ======================================

    room.tableCards.push(
      played
    );

    // ======================================
    // SET LEAD SUIT
    // ======================================

    if (
      room.tableCards.length === 1
    ) {
      room.leadSuit =
        playedCard.suit;
    }

    rooms.set(
      roomId,
      room
    );

    // ======================================
    // BROADCAST CARD TO ROOM
    // ======================================

    io.to(roomId).emit(
      "card_played",
      {
        roomId,
        ...played,
      }
    );

    // ======================================
    // CHECK THULLA
    // ======================================

    /*
     * Thulla is possible only after
     * the first trick.
     *
     * If played card is not the lead suit,
     * then player didn't have lead suit
     * because validation above already
     * checked it.
     */

    const isThulla =
      !isFirstTrick &&
      room.tableCards.some(
        (played) =>
          played.card?.suit !== room.leadSuit
      );

    // ======================================
    // CHECK NORMAL TRICK COMPLETE
    // ======================================

    const isNormalTrickComplete =
      room.tableCards.length ===
      room.playersCount;

    // ======================================
    // THULLA OR COMPLETE TRICK
    // ======================================

    if (
      isThulla ||
      isNormalTrickComplete
    ) {
      const thullaWinner =
        isThulla ? findTrickWinner(room) : null;

      if (thullaWinner) {
        io.to(roomId).emit("thulla", {
          roomId,
          leadSuit: room.leadSuit,
          winner: {
            userId: thullaWinner.userId,
            name: thullaWinner.name,
            seat: thullaWinner.seat,
          },
          cards: room.tableCards,
        });
      }

      console.log(
        `Trick resolution started | Room: ${roomId} | Thulla: ${isThulla}`
      );

      resolveTrick(
        io,
        roomId
      );

      return;
    }

    // ======================================
    // NEXT NORMAL TURN
    // ======================================

    room.currentTurn =
      nextSeat(
        room,
        player.seat
      );

    rooms.set(
      roomId,
      room
    );

    io.to(roomId).emit(
      "turn_changed",
      {
        roomId,
        currentTurn:
          room.currentTurn,
      }
    );

  } catch (error) {
    console.error(
      "handlePlayCard error:",
      error
    );

    emitGameError(
      socket,
      "PLAY_CARD_ERROR",
      "Something went wrong while playing the card"
    );
  }
};