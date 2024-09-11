import { Post } from './post.model';
import { Series } from './series.model';
import { Artist, Curator } from './user.model';

export enum ExhibitionType {
  solo = 'solo',
  group = 'group',
}

export enum Blockchain {
  Bitmark = 'bitmark',
  Tezos = 'tezos',
  Ethereum = 'ethereum',
}

export interface Exhibition {
  id?: string;
  title?: string;
  slug?: string;
  noteTitle?: string;
  noteBrief?: string;
  coverURI?: string;
  mintBlockchain?: Blockchain;
  status?: number;
  type?: ExhibitionType;
  artists?: Artist[];
  curator?: Curator;
  posts?: Post[];
  series?: Series[];
  contracts?: ExhibitionContract[];
}

interface ExhibitionContract {
  address: string;
}
