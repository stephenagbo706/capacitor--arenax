import { Router } from 'express';
import type { ChatRepository } from './chat-repository';
import { currentUser } from './auth-middleware';
import { HttpError } from './http-errors';
import type { AuthenticatedRequest, ChatMessageDto, ChatReadPayload } from './types';

function param(req: AuthenticatedRequest, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value || '';
}

export interface ChatRouteBroadcaster {
  message?(message: ChatMessageDto): void;
  delivered?(roomId: string, message: ChatMessageDto): void;
  read?(receipt: ChatReadPayload): void;
  deleted?(roomId: string, message: ChatMessageDto): void;
}

export function createChatRouter(chat: ChatRepository, broadcaster: ChatRouteBroadcaster = {}) {
  const router = Router();

  router.get('/rooms', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      res.json({ rooms: await chat.listRooms(user.uid) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/private', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const participantUserId = String(req.body?.participantUserId || '').trim();
      const room = await chat.createPrivateRoom(user.uid, participantUserId);
      res.status(201).json({ room });
    } catch (error) {
      next(error);
    }
  });

  router.get('/rooms/:roomId/messages', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const limit = Number(req.query['limit'] || 50);
      const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
      const messages = await chat.listMessages(param(req, 'roomId'), user.uid, limit, before);
      res.json({ messages });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/messages', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const message = await chat.sendMessage(param(req, 'roomId'), user.uid, {
        text: typeof req.body?.text === 'string' ? req.body.text : undefined,
        messageType: req.body?.messageType,
        replyToMessageId: typeof req.body?.replyToMessageId === 'string' ? req.body.replyToMessageId : undefined,
        attachmentUrl: typeof req.body?.attachmentUrl === 'string' ? req.body.attachmentUrl : undefined,
      });
      broadcaster.message?.(message);
      res.status(201).json({ message });
    } catch (error) {
      next(error);
    }
  });

  router.post('/rooms/:roomId/read', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const receipt = await chat.markRoomRead(param(req, 'roomId'), user.uid);
      broadcaster.read?.(receipt);
      res.json(receipt);
    } catch (error) {
      next(error);
    }
  });

  router.post('/messages/:messageId/delivered', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const message = await chat.markDelivered(param(req, 'messageId'), user.uid);
      broadcaster.delivered?.(message.roomId, message);
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  router.post('/messages/:messageId/reactions', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const reaction = typeof req.body?.reaction === 'string' ? req.body.reaction : '';
      const message = await chat.setReaction(param(req, 'messageId'), user.uid, reaction);
      broadcaster.message?.(message);
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/messages/:messageId', async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = currentUser(req);
      const message = await chat.deleteMessage(param(req, 'messageId'), user.uid, user.roles);
      broadcaster.deleted?.(message.roomId, message);
      res.json({ message });
    } catch (error) {
      next(error);
    }
  });

  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Chat endpoint was not found.')));
  return router;
}
