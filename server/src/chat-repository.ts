import type { Pool, PoolClient } from 'pg';
import { HttpError, assertUuid } from './http-errors';
import type { ChatMessageDto, ChatMessageType, ChatRoomDto, ChatRoomType } from './types';

const MAX_MESSAGE_LENGTH = Number(process.env['CHAT_MAX_MESSAGE_LENGTH'] || 2000);

interface MessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  text: string | null;
  message_type: ChatMessageType;
  reply_to_message_id: string | null;
  attachment_url: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  deleted_by: string | null;
  delivered_count: string;
  read_count: string;
  reaction: string | null;
}

interface RoomRow {
  id: string;
  type: ChatRoomType;
  created_at: Date;
  updated_at: Date;
  participant_ids: string[];
}

export class ChatRepository {
  constructor(private readonly db: Pool) {}

  async listRooms(userId: string): Promise<ChatRoomDto[]> {
    const result = await this.db.query<RoomRow>(
      `
      SELECT r.id, r.type, r.created_at, r.updated_at, array_agg(m.user_id ORDER BY m.user_id) AS participant_ids
      FROM chat_rooms r
      JOIN chat_room_members current_member ON current_member.room_id = r.id AND current_member.user_id = $1
      JOIN chat_room_members m ON m.room_id = r.id
      GROUP BY r.id
      ORDER BY r.updated_at DESC
      `,
      [userId]
    );

    const rooms = await Promise.all(
      result.rows.map(async (room) => ({
        id: room.id,
        type: room.type,
        participantIds: room.participant_ids || [],
        createdAt: room.created_at.toISOString(),
        updatedAt: room.updated_at.toISOString(),
        lastMessage: await this.getLastMessage(room.id, userId),
      }))
    );
    return rooms;
  }

  async createPrivateRoom(userId: string, participantUserId: string): Promise<ChatRoomDto> {
    if (!participantUserId || participantUserId === userId) {
      throw new HttpError(400, 'INVALID_PARTICIPANT', 'Choose another player to chat with.');
    }

    const members = [userId, participantUserId].sort();
    const privateKey = members.join(':');

    return this.withTransaction(async (client) => {
      const roomResult = await client.query<{ id: string; type: ChatRoomType; created_at: Date; updated_at: Date }>(
        `
        INSERT INTO chat_rooms (type, private_key)
        VALUES ('PRIVATE', $1)
        ON CONFLICT (private_key) DO UPDATE SET updated_at = chat_rooms.updated_at
        RETURNING id, type, created_at, updated_at
        `,
        [privateKey]
      );
      const room = roomResult.rows[0];
      for (const memberId of members) {
        await client.query(
          `
          INSERT INTO chat_room_members (room_id, user_id)
          VALUES ($1, $2)
          ON CONFLICT (room_id, user_id) DO NOTHING
          `,
          [room.id, memberId]
        );
      }
      return {
        id: room.id,
        type: room.type,
        participantIds: members,
        createdAt: room.created_at.toISOString(),
        updatedAt: room.updated_at.toISOString(),
      };
    });
  }

  async getRoom(roomId: string, userId: string): Promise<ChatRoomDto> {
    assertUuid(roomId, 'ROOM_NOT_FOUND');
    await this.requireMembership(roomId, userId);
    const result = await this.db.query<RoomRow>(
      `
      SELECT r.id, r.type, r.created_at, r.updated_at, array_agg(m.user_id ORDER BY m.user_id) AS participant_ids
      FROM chat_rooms r
      JOIN chat_room_members m ON m.room_id = r.id
      WHERE r.id = $1
      GROUP BY r.id
      `,
      [roomId]
    );
    const room = result.rows[0];
    if (!room) throw new HttpError(404, 'ROOM_NOT_FOUND', 'Chat room was not found.');
    return {
      id: room.id,
      type: room.type,
      participantIds: room.participant_ids || [],
      createdAt: room.created_at.toISOString(),
      updatedAt: room.updated_at.toISOString(),
    };
  }

  async listMessages(roomId: string, userId: string, limit = 50, before?: string): Promise<ChatMessageDto[]> {
    assertUuid(roomId, 'ROOM_NOT_FOUND');
    await this.requireMembership(roomId, userId);
    const boundedLimit = Math.min(Math.max(limit || 50, 1), 100);
    const params: unknown[] = [roomId, userId, boundedLimit];
    let beforeClause = '';
    if (before) {
      params.push(before);
      beforeClause = `AND msg.created_at < $4`;
    }
    const result = await this.db.query<MessageRow>(
      `
      SELECT msg.*,
        COUNT(DISTINCT d.user_id) FILTER (WHERE d.user_id <> msg.sender_id) AS delivered_count,
        COUNT(DISTINCT r.user_id) FILTER (WHERE r.user_id <> msg.sender_id) AS read_count,
        reaction.reaction
      FROM chat_messages msg
      LEFT JOIN chat_message_deliveries d ON d.message_id = msg.id
      LEFT JOIN chat_message_reads r ON r.message_id = msg.id
      LEFT JOIN chat_message_reactions reaction ON reaction.message_id = msg.id AND reaction.user_id = $2
      WHERE msg.room_id = $1 ${beforeClause}
      GROUP BY msg.id, reaction.reaction
      ORDER BY msg.created_at DESC
      LIMIT $3
      `,
      params
    );
    return result.rows.reverse().map((row) => this.toMessageDto(row));
  }

  async sendMessage(
    roomId: string,
    senderId: string,
    input: { text?: string; messageType?: ChatMessageType; replyToMessageId?: string; attachmentUrl?: string }
  ): Promise<ChatMessageDto> {
    assertUuid(roomId, 'ROOM_NOT_FOUND');
    await this.requireMembership(roomId, senderId);

    const text = (input.text || '').trim();
    const attachmentUrl = (input.attachmentUrl || '').trim();
    if (!text && !attachmentUrl) throw new HttpError(400, 'INVALID_MESSAGE', 'Message cannot be empty.');
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new HttpError(400, 'MESSAGE_TOO_LONG', `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (input.replyToMessageId) {
      assertUuid(input.replyToMessageId, 'INVALID_REPLY');
      await this.requireMessageInRoom(input.replyToMessageId, roomId);
    }

    const messageType = input.messageType || (attachmentUrl ? 'IMAGE' : 'TEXT');
    const result = await this.db.query<MessageRow>(
      `
      INSERT INTO chat_messages (room_id, sender_id, text, message_type, reply_to_message_id, attachment_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *, 0::text AS delivered_count, 0::text AS read_count, NULL::text AS reaction
      `,
      [roomId, senderId, text || null, messageType, input.replyToMessageId || null, attachmentUrl || null]
    );
    await this.db.query(`UPDATE chat_rooms SET updated_at = now() WHERE id = $1`, [roomId]);
    return this.toMessageDto(result.rows[0]);
  }

  async markDelivered(messageId: string, userId: string): Promise<ChatMessageDto> {
    assertUuid(messageId, 'MESSAGE_NOT_FOUND');
    const message = await this.getMessageForAuthorizedUser(messageId, userId);
    if (message.sender_id !== userId) {
      await this.db.query(
        `
        INSERT INTO chat_message_deliveries (message_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (message_id, user_id) DO UPDATE SET delivered_at = EXCLUDED.delivered_at
        `,
        [messageId, userId]
      );
    }
    return this.getMessageDto(messageId, userId);
  }

  async markRoomRead(roomId: string, userId: string): Promise<{ roomId: string; userId: string; readAt: string; messages: ChatMessageDto[] }> {
    assertUuid(roomId, 'ROOM_NOT_FOUND');
    await this.requireMembership(roomId, userId);
    const readAt = new Date();
    const result = await this.db.query<{ id: string }>(
      `
      SELECT id
      FROM chat_messages
      WHERE room_id = $1 AND sender_id <> $2 AND deleted_at IS NULL
      `,
      [roomId, userId]
    );
    for (const row of result.rows) {
      await this.db.query(
        `
        INSERT INTO chat_message_reads (message_id, user_id, read_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = EXCLUDED.read_at
        `,
        [row.id, userId, readAt]
      );
      await this.db.query(
        `
        INSERT INTO chat_message_deliveries (message_id, user_id, delivered_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id) DO NOTHING
        `,
        [row.id, userId, readAt]
      );
    }
    await this.db.query(`UPDATE chat_room_members SET last_read_at = $3 WHERE room_id = $1 AND user_id = $2`, [
      roomId,
      userId,
      readAt,
    ]);
    const messages = await Promise.all(result.rows.map((row) => this.getMessageDto(row.id, userId)));
    return { roomId, userId, readAt: readAt.toISOString(), messages };
  }

  async deleteMessage(messageId: string, userId: string, roles: string[]): Promise<ChatMessageDto> {
    assertUuid(messageId, 'MESSAGE_NOT_FOUND');
    const message = await this.getMessageForAuthorizedUser(messageId, userId);
    const isModerator = roles.includes('admin') || roles.includes('moderator');
    if (message.sender_id !== userId && !isModerator) {
      throw new HttpError(403, 'UNAUTHORIZED', 'You cannot delete this message.');
    }
    await this.db.query(
      `
      UPDATE chat_messages
      SET deleted_at = COALESCE(deleted_at, now()), deleted_by = COALESCE(deleted_by, $2), updated_at = now()
      WHERE id = $1
      `,
      [messageId, userId]
    );
    return this.getMessageDto(messageId, userId);
  }

  async setReaction(messageId: string, userId: string, reaction: string): Promise<ChatMessageDto> {
    assertUuid(messageId, 'MESSAGE_NOT_FOUND');
    await this.getMessageForAuthorizedUser(messageId, userId);
    const value = reaction.trim().slice(0, 32);
    if (!value) {
      await this.db.query(`DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2`, [messageId, userId]);
    } else {
      await this.db.query(
        `
        INSERT INTO chat_message_reactions (message_id, user_id, reaction)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()
        `,
        [messageId, userId, value]
      );
    }
    return this.getMessageDto(messageId, userId);
  }

  async requireMembership(roomId: string, userId: string) {
    const result = await this.db.query(`SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`, [
      roomId,
      userId,
    ]);
    if (!result.rowCount) throw new HttpError(403, 'UNAUTHORIZED', 'You are not a member of this chat room.');
  }

  private async requireMessageInRoom(messageId: string, roomId: string) {
    const result = await this.db.query(`SELECT 1 FROM chat_messages WHERE id = $1 AND room_id = $2`, [messageId, roomId]);
    if (!result.rowCount) throw new HttpError(400, 'INVALID_REPLY', 'Reply target is not in this room.');
  }

  private async getMessageForAuthorizedUser(messageId: string, userId: string): Promise<MessageRow> {
    const result = await this.db.query<MessageRow>(
      `
      SELECT msg.*, 0::text AS delivered_count, 0::text AS read_count, NULL::text AS reaction
      FROM chat_messages msg
      JOIN chat_room_members member ON member.room_id = msg.room_id AND member.user_id = $2
      WHERE msg.id = $1
      `,
      [messageId, userId]
    );
    const message = result.rows[0];
    if (!message) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message was not found.');
    return message;
  }

  private async getMessageDto(messageId: string, userId: string): Promise<ChatMessageDto> {
    const result = await this.db.query<MessageRow>(
      `
      SELECT msg.*,
        COUNT(DISTINCT d.user_id) FILTER (WHERE d.user_id <> msg.sender_id) AS delivered_count,
        COUNT(DISTINCT r.user_id) FILTER (WHERE r.user_id <> msg.sender_id) AS read_count,
        reaction.reaction
      FROM chat_messages msg
      LEFT JOIN chat_message_deliveries d ON d.message_id = msg.id
      LEFT JOIN chat_message_reads r ON r.message_id = msg.id
      LEFT JOIN chat_message_reactions reaction ON reaction.message_id = msg.id AND reaction.user_id = $2
      WHERE msg.id = $1
      GROUP BY msg.id, reaction.reaction
      `,
      [messageId, userId]
    );
    if (!result.rows[0]) throw new HttpError(404, 'MESSAGE_NOT_FOUND', 'Message was not found.');
    return this.toMessageDto(result.rows[0]);
  }

  private async getLastMessage(roomId: string, userId: string) {
    const result = await this.db.query<MessageRow>(
      `
      SELECT msg.*,
        COUNT(DISTINCT d.user_id) FILTER (WHERE d.user_id <> msg.sender_id) AS delivered_count,
        COUNT(DISTINCT r.user_id) FILTER (WHERE r.user_id <> msg.sender_id) AS read_count,
        reaction.reaction
      FROM chat_messages msg
      LEFT JOIN chat_message_deliveries d ON d.message_id = msg.id
      LEFT JOIN chat_message_reads r ON r.message_id = msg.id
      LEFT JOIN chat_message_reactions reaction ON reaction.message_id = msg.id AND reaction.user_id = $2
      WHERE msg.room_id = $1
      GROUP BY msg.id, reaction.reaction
      ORDER BY msg.created_at DESC
      LIMIT 1
      `,
      [roomId, userId]
    );
    return result.rows[0] ? this.toMessageDto(result.rows[0]) : undefined;
  }

  private toMessageDto(row: MessageRow): ChatMessageDto {
    const deliveredCount = Number(row.delivered_count || 0);
    const readCount = Number(row.read_count || 0);
    return {
      id: row.id,
      roomId: row.room_id,
      senderId: row.sender_id,
      text: row.deleted_at ? undefined : row.text || undefined,
      messageType: row.message_type,
      replyToMessageId: row.reply_to_message_id || undefined,
      attachmentUrl: row.deleted_at ? undefined : row.attachment_url || undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      deletedAt: row.deleted_at?.toISOString(),
      deletedBy: row.deleted_by || undefined,
      status: readCount > 0 ? 'seen' : deliveredCount > 0 ? 'delivered' : 'sent',
      reaction: row.reaction || undefined,
    };
  }

  private async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
