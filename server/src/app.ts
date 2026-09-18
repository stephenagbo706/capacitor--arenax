import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { Pool } from 'pg';
import { ChatRepository } from './chat-repository';
import { createChatRouter } from './chat-routes';
import { requireAuth } from './auth-middleware';
import type { AuthVerifier } from './firebase-admin';
import { HttpError } from './http-errors';
import type { ApiErrorBody } from './types';
import { attachChatSocket } from './socket';
import { WalletRepository } from './wallet-repository';
import { createWalletRouter } from './wallet-routes';

export function createArenaXServer(options: {
  db: Pool;
  authVerifier: AuthVerifier;
  corsOrigin?: string;
}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: options.corsOrigin || process.env['CORS_ORIGIN'] || '*',
      credentials: true,
    },
  });
  const chat = new ChatRepository(options.db);
  const wallet = new WalletRepository(options.db);

  app.use(express.json({ limit: '1mb' }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: Number(process.env['RATE_LIMIT_PER_MINUTE'] || 120),
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/wallet', requireAuth(options.authVerifier), createWalletRouter(wallet));
  app.use('/api/wallet', requireAuth(options.authVerifier), createWalletRouter(wallet));
  app.use(
    '/api/chat',
    requireAuth(options.authVerifier),
    createChatRouter(chat, {
      message: (message) => io.to(`chat:${message.roomId}`).emit('chat:message', message),
      delivered: (roomId, message) => io.to(`chat:${roomId}`).emit('chat:delivered', { roomId, message }),
      read: (receipt) => io.to(`chat:${receipt.roomId}`).emit('chat:read', receipt),
      deleted: (roomId, message) => io.to(`chat:${roomId}`).emit('chat:message-deleted', { roomId, message }),
    })
  );
  attachChatSocket(io, chat, options.authVerifier);

  app.use((error: unknown, _req: Request, res: Response<ApiErrorBody>, _next: NextFunction) => {
    const httpError =
      error instanceof HttpError
        ? error
        : new HttpError(500, 'DATABASE_ERROR', 'ArenaX backend could not complete the request.');
    res.status(httpError.status).json({
      error: {
        code: httpError.code,
        message: httpError.message,
      },
    });
  });

  return { app, httpServer, io };
}
