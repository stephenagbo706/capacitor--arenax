import { Injectable } from '@angular/core';
import Tesseract from 'tesseract.js';
import { MatchAiVerificationResult } from '../models/arena.models';

@Injectable({ providedIn: 'root' })
export class GameResultAiService {
  async verifyGoalScoreFromScreenshot(
    dataUrl: string,
    fileName: string,
    game: string,
    player1Id: string,
    player2Id: string
  ): Promise<MatchAiVerificationResult> {
    const normalizedFileName = (fileName || '').toLowerCase();
    const scoreFromFileName = this.extractScoreFromFileName(normalizedFileName);
    const scoreFromImage = await this.extractScoreFromImageText(dataUrl, game);
    const score = scoreFromImage || scoreFromFileName;

    if (!score) {
      return {
        ok: true,
        valid: false,
        confidence: 0.46,
        playerScores: {
          [player1Id]: 0,
          [player2Id]: 0,
        },
        reason: 'AI could not read a valid score from this screenshot. Upload a clearer match result image showing the scoreboard.',
      };
    }

    const player1Score = Math.max(0, score.player1Score);
    const player2Score = Math.max(0, score.player2Score);
    const isDraw = player1Score === player2Score;
    const winnerId = isDraw ? undefined : player1Score > player2Score ? player1Id : player2Id;

    return {
      ok: true,
      valid: !isDraw,
      winnerId,
      confidence: score.confidence,
      playerScores: {
        [player1Id]: player1Score,
        [player2Id]: player2Score,
      },
      reason: isDraw
        ? 'AI detected a draw in the screenshot. A winner cannot be confirmed from a tied score.'
        : `AI verified the scoreboard as ${player1Score}-${player2Score}. Winner detected from the higher score.`,
    };
  }

  private extractScoreFromFileName(fileName: string) {
    const patterns = [
      /([0-9]+)\s*[-:–]\s*([0-9]+)/,
      /score\s*([0-9]+)\s*[-:–]\s*([0-9]+)/,
      /([0-9]+)\s*to\s*([0-9]+)/,
      /([0-9]+)\s*[-–]\s*([0-9]+)\s*\w+/,
    ];

    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) {
        const first = Number(match[1]);
        const second = Number(match[2]);
        if (Number.isFinite(first) && Number.isFinite(second)) {
          return {
            player1Score: first,
            player2Score: second,
            confidence: 0.8,
          };
        }
      }
    }

    return null;
  }

  private async extractScoreFromImageText(dataUrl: string, game: string) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return null;
    }

    const lowerGame = (game || '').toLowerCase();
    const allowedGames = ['fifa', 'dream league soccer', 'efootball', 'call of duty', 'football'];
    const recognizedGame = allowedGames.some((name) => lowerGame.includes(name));
    if (!recognizedGame) {
      return null;
    }

    try {
      const result = await Tesseract.recognize(dataUrl, 'eng', {
        logger: () => undefined,
      });

      const ocrText = (result?.data?.text || '').replace(/\s+/g, ' ').trim();
      if (!ocrText) {
        return null;
      }

      const parsed = this.extractScoreFromOcrText(ocrText);
      if (!parsed) {
        return null;
      }

      return {
        ...parsed,
        confidence: 0.92,
      };
    } catch {
      return null;
    }
  }

  private extractScoreFromOcrText(text: string) {
    const normalized = text
      .replace(/[|]/g, ' ')
      .replace(/\r?\n/g, ' ')
      .replace(/(score|result|final|winner|home|away|team|player)/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const patterns = [
      /(\d{1,2})\s*(?:-|–:|to)\s*(\d{1,2})/gi,
      /(\d{1,2})\s*(?:\s+)\s*(\d{1,2})/g,
    ];

    for (const pattern of patterns) {
      const matches = [...normalized.matchAll(pattern)];
      for (const match of matches) {
        const first = Number(match[1]);
        const second = Number(match[2]);

        if (this.isLikelyScore(first, second)) {
          return {
            player1Score: first,
            player2Score: second,
          };
        }
      }
    }

    const numbers = [...normalized.matchAll(/\b\d{1,2}\b/g)]
      .map((match) => Number(match[0]))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 99);

    if (numbers.length >= 2) {
      const pair = this.pickLikelyScorePair(numbers);
      if (pair) {
        return {
          player1Score: pair[0],
          player2Score: pair[1],
        };
      }
    }

    return null;
  }

  private isLikelyScore(first: number, second: number) {
    return Number.isFinite(first) && Number.isFinite(second) && first >= 0 && second >= 0 && first <= 30 && second <= 30;
  }

  private pickLikelyScorePair(numbers: number[]) {
    if (numbers.length < 2) {
      return null;
    }

    const candidates: Array<[number, number]> = [];

    for (let index = 0; index < numbers.length - 1; index += 1) {
      const first = numbers[index];
      const second = numbers[index + 1];
      if (this.isLikelyScore(first, second)) {
        candidates.push([first, second]);
      }
    }

    if (!candidates.length) {
      return null;
    }

    const sorted = [...candidates].sort((a, b) => {
      const diffA = Math.abs(a[0] - a[1]);
      const diffB = Math.abs(b[0] - b[1]);
      return diffB - diffA;
    });

    return sorted[0] || null;
  }
}
