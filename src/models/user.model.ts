export interface User {
  id?: string;
  alumniAccount?: AlumniAccount;
}

interface AlumniAccount {
  alias?: string;
  fullName?: string;
}

export type Artist = User;

export type Curator = User;
