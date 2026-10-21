export interface MatchAiVerificationResult {
  ok: boolean;
  valid: boolean;
  winnerId?: string;
  confidence: number;
  playerScores: Record<string, number>;
  reason: string;
}
