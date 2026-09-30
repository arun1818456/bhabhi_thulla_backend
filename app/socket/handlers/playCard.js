import rooms from "../../data/match_rooms.js";
import onlinePlayers from "../../data/online_players.js";
import User from "../../modules/user/model.js";

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
  let next = seat;
  let attempts = 0;

  do {
    next = next >= room.playersCount ? 1 : next + 1;
    attempts++;

    const p = room.players.find((player) => player.seat === next);
    if (p && p.cards.length > 0) {
      return next;
    }
  } while (attempts < room.playersCount);

  // Fallback
  return seat >= room.playersCount ? 1 : seat + 1;
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
// SYNC HANDS HELPER
// ==========================================

const syncAllHands = (io, roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;

  room.players.forEach(p => {
    // Refresh socketId from onlinePlayers in case of reconnection
    const onlinePlayer = onlinePlayers.get(p.userId);
    if (onlinePlayer && onlinePlayer.socketId) {
      p.socketId = onlinePlayer.socketId;
    }
    const s = io.sockets.sockets.get(p.socketId);
    if (s) {
      s.emit("your_cards", {
        roomId: room.roomId,
        cards: p.cards,
      });
    }
  });
};

// ==========================================
// RESOLVE TRICK
// ==========================================

const resolveTrick = (io, roomId, isThulla) => {
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

  setTimeout(async () => {
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
    // ALL TABLE CARDS GO TO WINNER OR DISCARD
    // --------------------------------------

    if (isThulla) {
      winner.cards.push(...collectedCards);
    }

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

    if (winner.cards.length === 0) {
      currentRoom.currentTurn = nextSeat(currentRoom, winner.seat);
    } else {
      currentRoom.currentTurn = winner.seat;
    }

    currentRoom.resolving = false;

    // Track finished ranks
    if (!currentRoom.finishedRanks) currentRoom.finishedRanks = [];

    currentRoom.players.forEach(p => {
      if (p.cards.length === 0 && !currentRoom.finishedRanks.some(f => f.userId === p.userId)) {
        currentRoom.finishedRanks.push({
          userId: p.userId,
          name: p.name,
          seat: p.seat,
          rank: currentRoom.finishedRanks.length + 1
        });
      }
    });

    rooms.set(roomId, currentRoom);

    // --------------------------------------
    // GAME OVER CHECK
    // --------------------------------------
    const activePlayers = currentRoom.players.filter(p => p.cards.length > 0);
    
    if (activePlayers.length <= 1 && currentRoom.playersCount > 1) {
      // The remaining active player is Bhabhi (loser)
      const bhabhiPlayer = activePlayers[0];
      if (bhabhiPlayer && !currentRoom.finishedRanks.some(f => f.userId === bhabhiPlayer.userId)) {
        currentRoom.finishedRanks.push({
           userId: bhabhiPlayer.userId,
           name: bhabhiPlayer.name,
           seat: bhabhiPlayer.seat,
           rank: currentRoom.playersCount, // Last rank
           isBhabhi: true
        });
      }

      // Calculate prize based on entry fee
      const PRIZES = { 120: 160, 300: 380, 600: 760, 1200: 1500, 2500: 3200, 5200: 6500 };
      const prizeAmount = PRIZES[currentRoom.entryFee] || Math.floor((currentRoom.entryFee * currentRoom.playersCount) / (currentRoom.playersCount - 1));

      // Award prize to winners (anyone who is not Bhabhi)
      const winners = currentRoom.finishedRanks.filter(f => !f.isBhabhi);
      for (const w of winners) {
         try {
            await User.updateOne({ _id: w.userId }, { $inc: { coins: prizeAmount } });
         } catch(e) {
            console.error("Coin award failed", e);
         }
      }

      // Sync final state
      syncAllHands(io, roomId);
      
      io.to(roomId).emit("game_over", {
         roomId,
         ranks: currentRoom.finishedRanks,
         prizeAmount
      });
      
      // Clear interval if any
      if (currentRoom.turnTimer) clearTimeout(currentRoom.turnTimer);
      rooms.delete(roomId);
      return;
    }

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
    // SEND UPDATED HANDS TO ALL PLAYERS
    // --------------------------------------

    syncAllHands(io, roomId);

    // --------------------------------------
    // TURN CHANGED
    // --------------------------------------

    const counts = {};
    currentRoom.players.forEach(p => counts[p.userId] = p.cards.length);

    io.to(roomId).emit("turn_changed", {
      roomId,
      currentTurn: currentRoom.currentTurn,
      playerCardCounts: counts,
    });

    startTurnTimer(io, roomId);

    console.log(
      `Trick resolved in room ${roomId}. Winner: ${winner.userId}, seat: ${winner.seat}`
    );
  }, TRICK_RESOLUTION_DELAY);
};

// ==========================================
// TIMER AND AUTO-PLAY
// ==========================================

export const startTurnTimer = (io, roomId) => {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
  }

  // 40 seconds timer
  room.turnTimer = setTimeout(() => {
    autoPlayCard(io, roomId);
  }, 40000);
};

const autoPlayCard = (io, roomId) => {
  const room = rooms.get(roomId);
  if (!room || room.status !== "started" || room.resolving) return;

  const player = room.players.find(p => p.seat === room.currentTurn);
  if (!player || player.cards.length === 0) {
     // If player has no cards, maybe skip? But usually winner logic handles getting away.
     // Assuming player has cards.
     return;
  }

  const trickNumber = room.trickNumber || 1;
  const isFirstTrick = trickNumber === 1;
  const isFirstCard = (room.tableCards || []).length === 0;
  let selectedCard = null;

  if (isFirstTrick && isFirstCard) {
    const aceOfSpades = player.cards.find(c => sameCard(c, ACE_OF_SPADES));
    if (aceOfSpades) selectedCard = aceOfSpades;
  } else if (!isFirstTrick && room.leadSuit) {
    const validCards = player.cards.filter(c => c.suit === room.leadSuit);
    if (validCards.length > 0) {
      selectedCard = validCards[0]; // pick lowest or any
    }
  } else if (isFirstTrick && !isFirstCard) {
    const validCards = player.cards.filter(c => c.suit === "spades");
    if (validCards.length > 0) {
      selectedCard = validCards[0];
    }
  }

  // If no specific card required or found, pick the first one
  if (!selectedCard) {
    selectedCard = player.cards[0];
  }

  console.log(`[AUTO-PLAY] Time up for ${player.userId}, auto-playing ${selectedCard.rank} of ${selectedCard.suit}`);

  // Create a mock socket to pass to handlePlayCard
  const mockSocket = {
    id: player.socketId,
    emit: (event, data) => {
        console.log(`[AUTO-PLAY ERROR] ${event}: ${data?.message}`);
    }
  };

  handlePlayCard(io, mockSocket, { roomId, card: selectedCard });
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
    // PLAYERS COUNT (Allow any number for testing)
    // ======================================

    if (!Number.isInteger(room.playersCount)) {
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

    // Turn is valid, clear the auto-play timer
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = null;
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
    // SYNC HANDS
    // ======================================
    syncAllHands(io, roomId);

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

    const activePlayersInTrickCount = room.players.filter(
      p => p.cards.length > 0 || room.tableCards.some(tc => tc.seat === p.seat)
    ).length;

    const isNormalTrickComplete =
      room.tableCards.length >= activePlayersInTrickCount;

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
        roomId,
        isThulla
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

    const counts = {};
    room.players.forEach(p => counts[p.userId] = p.cards.length);

    io.to(roomId).emit(
      "turn_changed",
      {
        roomId,
        currentTurn:
          room.currentTurn,
        playerCardCounts: counts,
      }
    );

    startTurnTimer(io, roomId);

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