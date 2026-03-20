import crypto from "node:crypto";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomCode(length = 6): string {
  let roomCode = "";
  for (let index = 0; index < length; index += 1) {
    roomCode += ROOM_ALPHABET[crypto.randomInt(0, ROOM_ALPHABET.length)];
  }
  return roomCode;
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}
