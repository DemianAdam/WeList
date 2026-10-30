export type Track = {
  id: string;
  title: string;
  artist: string;
  votes: number;
  archived?: number;
};
export type Event = {
  id: string;
  name: string;
  profiles: string[];
  live: boolean;
  tracks: Track[];
  endedAt?: number;
};
export type State = {
  events: Event[];
  current: string;
  participation: Record<
    string,
    { clicks: number[]; unlocked: boolean; votes: string[] }
  >;
};
export const catalog: Track[] = [
  ["demo-1", "Blinding Lights", "The Weeknd"],
  ["demo-2", "Levitating", "Dua Lipa"],
  ["demo-3", "Tití Me Preguntó", "Bad Bunny"],
  ["demo-4", "One More Time", "Daft Punk"],
  ["demo-5", "BIZCOCHITO", "ROSALÍA"],
  ["demo-6", "Music Sounds Better With You", "Stardust"],
  ["demo-7", "De Música Ligera", "Soda Stereo"],
  ["demo-8", "Midnight City", "M83"],
  ["demo-9", "Una Mattina", "Ludovico Einaudi"],
  ["demo-10", "Dancing Queen", "ABBA"],
].map(([id, title, artist]) => ({ id, title, artist, votes: 0 }));
export const initial: State = {
  current: "opening",
  events: [
    {
      id: "opening",
      name: "La noche es de todos",
      profiles: ["welist.dj", "welist.club"],
      live: true,
      tracks: catalog.slice(0, 4).map((t, i) => ({ ...t, votes: 12 - i * 3 })),
    },
  ],
  participation: {},
};
export function vote(
  state: State,
  eventId: string,
  guest: string,
  trackId: string,
): string {
  const event = state.events.find((e) => e.id === eventId);
  const p = state.participation[eventId + guest];
  if (!event?.live || state.current !== eventId) return "El evento terminó.";
  if (!p?.unlocked) return "Visita los perfiles configurados para participar.";
  if (p.votes.includes(trackId)) return "Ya votaste esta canción.";
  let track = event.tracks.find((t) => t.id === trackId);
  if (track?.archived)
    return "Esta canción no está disponible durante este evento.";
  if (p.votes.length >= 3) return "Ya usaste tus tres votos.";
  if (!track) {
    const source = catalog.find((t) => t.id === trackId);
    if (!source) return "Canción no válida.";
    track = { ...source };
    event.tracks.push(track);
  }
  track.votes++;
  p.votes.push(trackId);
  return "¡Tu voto ya cuenta!";
}
