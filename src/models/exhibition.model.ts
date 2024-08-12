import { Post } from "./post.model";
import { Series } from "./series.model";
import { Artist, Curator } from "./user.model";

export enum ExhibitionType {
  solo = "solo",
  group = "group",
}

export interface Exhibition {
  id?: string;
  title?: string;
  slug?: string;
  noteTitle?: string;
  noteBrief?: string;
  coverURI?: string;
  mintBlockchain?: string;
  status?: number;
  type?: ExhibitionType;
  artists?: Artist[];
  curator?: Curator;
  posts?: Post[];
  series?: Series[];
}
