export interface User {
  id?: string;
  alias?: string;
  fullName?: string;
}

export interface Artist extends User {}

export interface Curator extends User {}
