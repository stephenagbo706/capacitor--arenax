# ArenaX Stage 1 Architecture Report

## Frontend
Current implementation: Angular 20, Ionic Angular 8, standalone pages under `src/app/pages`, shared bottom nav, and a central `ArenaService`.
Current source of truth: `ArenaService` BehaviorSubjects backed by `localStorage`.
Production problem: sensitive match, wallet, tournament, and admin state can be mutated by frontend code.
Proposed Stage 1 boundary: preserve page UI and route calls through `ArenaService` into a typed API adapter.

## Authentication
Current implementation: Firebase Authentication in `AuthService`.
Current source of truth: Firebase Auth current user, mirrored into local Arena state.
Production problem: local profile fields such as `isAdmin`, wallet balance, and user IDs are still trusted by frontend business logic.
Proposed Stage 1 boundary: forward Firebase ID tokens to the backend. The backend must derive identity and authorization from the verified token.

## API
Current implementation: no custom HTTP API client, no Angular HTTP interceptors, and no server folder found in this repository.
Current source of truth: frontend/local state, Firebase Auth, Firebase Realtime Database for limited room sync, and Socket.IO client events.
Production problem: no authoritative backend path for sensitive operations.
Proposed Stage 1 boundary: introduce `ArenaApiService` with a consistent API response/error contract.

## Database
Current implementation: Firebase Realtime Database config is present and used for match room sync. No Firebase Admin SDK or Firestore backend implementation was found.
Current source of truth: local storage for most domain state.
Production problem: financial, tournament, and result evidence data are not persisted authoritatively.
Proposed Stage 1 boundary: backend API owns wallet, registration, result submission, review, and settlement persistence.

## Realtime Communication
Current implementation: Socket.IO client in `RealtimeService`.
Current source of truth: Socket.IO events plus local state mutation.
Production problem: realtime events can reflect local optimistic actions.
Proposed Stage 1 boundary: realtime updates should follow backend-confirmed operations.

## Storage
Current implementation: screenshot evidence is kept as a local data URL on the match record.
Current source of truth: frontend state.
Production problem: original evidence is not securely stored by a backend.
Proposed Stage 1 boundary: result submission sends evidence to a backend API, which stores the original and creates a result submission record.

## Wallet
Current implementation: `walletBalance`, `lockedBalance`, and transactions are local user/state fields.
Current source of truth: frontend state.
Production problem: deposits, withdrawals, entry fees, and prizes can be created locally.
Proposed Stage 1 boundary: API owns wallet reads and wallet-changing requests.

## Tournament Logic
Current implementation: tournament join, fee lock, participant updates, bracket generation, and completion happen in `ArenaService`.
Current source of truth: frontend state.
Production problem: registration and settlement are not atomic or backend-authoritative.
Proposed Stage 1 boundary: join requests go to API; local state updates only from API responses.

## Result Verification
Current implementation: player-selected winner is stored locally; admin approval or auto-verification credits wallet locally.
Current source of truth: frontend state/admin UI.
Production problem: client can influence winner and payout.
Proposed Stage 1 boundary: result submissions do not set authoritative winners; review decisions go through API.

## Admin Authorization
Current implementation: `isAdmin` is stored in local user state and `enableCurrentUserAdmin()` can promote the current user.
Current source of truth: frontend state.
Production problem: local admin elevation is possible.
Proposed Stage 1 boundary: client-side admin elevation is disabled. Backend must enforce roles.
