export interface Alumni {
  id?: string;
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

export type Artist = Alumni;

export type Curator = Alumni;
