export type Track = {
  id: string;
  requestId?: string;
  title: string;
  artist: string;
  votes: number;
  archived?: number;
  artwork?: string;
  url?: string;
};
export type SearchResult = { tracks: Track[]; error?: string };
export class CommandError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
export type Event = {
  id: string;
  name: string;
  profiles: string[];
  live: boolean;
  tracks: Track[];
  endedAt?: number;
};
export type Participation = {
  clicks: number[];
  unlocked: boolean;
  votes: string[];
  votedTracks: Track[];
};
export type Metrics = {
  participants: number;
  profileClicks: number[];
  unlocked: number;
  exhausted: number;
  votes: number;
  requests: number;
};
export type Snapshot = {
  event: Event | null;
  participation: Participation;
  admin: boolean;
  authLoading: boolean;
  authError: string | null;
  metrics: Metrics | null;
  connected: boolean;
  loading: boolean;
};
export const emptyParticipation: Participation = {
  clicks: [],
  unlocked: false,
  votes: [],
  votedTracks: [],
};
export type Command =
  | { kind: "gate"; eventId: string; profile?: number; confirm: boolean }
  | { kind: "vote"; eventId: string; trackId: string }
  | { kind: "login"; password: string }
  | { kind: "logout" }
  | { kind: "start"; name: string; profiles: string[] }
  | { kind: "end"; eventId: string }
  | { kind: "archive"; eventId: string; trackId: string; undo: boolean };
export interface Adapter {
  getSnapshot: () => Snapshot;
  subscribe: (listener: () => void) => () => void;
  execute: (command: Command) => Promise<string>;
  getParticipation: (eventId: string) => Promise<Participation>;
  search: (
    eventId: string,
    term: string,
    force?: boolean,
  ) => Promise<SearchResult>;
  loadMore?: (limit: number) => void;
  setAuthState?: (authenticated: boolean, loading: boolean) => void;
  dispose: () => void;
}

export type ConvexAuthBridge = {
  signIn: (
    provider: string,
    params: Record<string, string>,
  ) => Promise<unknown>;
  signOut: () => Promise<void>;
};
