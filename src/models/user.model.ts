export interface User {
  id?: string;
  alias?: string;
  fullName?: string;
}

export type Artist = User;

export type Curator = User;
