export interface SpotifyCredentials {
  clientId: string;
  clientSecret: string;
}

export interface SpotifyConfigReader {
  getCredentials(): Promise<SpotifyCredentials | null>;
}
