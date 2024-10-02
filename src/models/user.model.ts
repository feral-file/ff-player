export interface User {
  id?: string;
  alumniAccount?: AlumniAccount;
}

interface AlumniAccount {
  alias?: string;
  fullName?: string;
  slug?: string;
  bio?: string;
  avatarURI?: string;
  location?: string;
  website?: string;
  company?: string;
  socialNetworks?: SocialNetwork;
}

interface SocialNetwork {
  twitterID: string;
  instagramID: string;
}

export type Artist = User;

export type Curator = User;
