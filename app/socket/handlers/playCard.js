import rooms from "../../data/game_rooms.js";

export const handlePlayCard = (io, socket, data) => {
  const { roomId, userId, card } = data;
  const room = rooms.get(roomId);

  console.log("Player wants to play card:", data);

  if (!room) {
    socket.emit("play_card_error", { message: "Room not found" });
    return;
  }

  const player = room.players.find((roomPlayer) => (
    roomPlayer.userId === userId
  ));

  if (!player) {
    socket.emit("play_card_error", {
      message: "Player is not in this room",
    });
    return;
  }

  if (player.socketId !== socket.id) {
    socket.emit("play_card_error", { message: "Invalid player socket" });
    return;
  }

  if (room.currentTurn !== player.seat) {
    socket.emit("play_card_error", { message: "Not your turn" });
    console.log(
      `${player.name} tried to play but it is not their turn`,
    );
    return;
  }

  const cardIndex = player.cards.findIndex((playerCard) => (
    playerCard.rank === card.rank && playerCard.suit === card.suit
  ));

  if (cardIndex === -1) {
    socket.emit("play_card_error", {
      message: "You do not have this card",
    });
    return;
  }

  const playedCard = player.cards.splice(cardIndex, 1)[0];
  room.tableCards.push({ userId: player.userId, seat: player.seat, card: playedCard });

  if (room.tableCards.length === 4) {
    setTimeout(() => {
      const currentRoom = rooms.get(roomId);

      if (!currentRoom) {
        return;
      }

      currentRoom.tableCards = [];
      rooms.set(roomId, currentRoom);
      io.to(roomId).emit("table_cleared", { roomId });
    }, 2000);
  }

  const currentIndex = room.players.findIndex((roomPlayer) => (
    roomPlayer.seat === room.currentTurn
  ));
  const nextIndex = (currentIndex + 1) % room.players.length;

  room.currentTurn = room.players[nextIndex].seat;
  rooms.set(roomId, room);

  io.to(roomId).emit("card_played", {
    roomId,
    userId: player.userId,
    seat: player.seat,
    card: playedCard,
  });
  io.to(roomId).emit("turn_changed", {
    roomId,
    currentTurn: room.currentTurn,
  });

  console.log(`Next turn: Seat ${room.currentTurn}`);
};