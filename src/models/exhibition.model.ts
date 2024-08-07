import { Post } from "./post.model";
import { Series } from "./series.model";
import { Artist, Curator } from "./user.model";

export interface Exhibition {
  id?: string;
  title?: string;
  slug?: string;
  noteTitle?: string;
  noteBrief?: string;
  mintBlockchain?: string;
  status?: number;
  type?: string;
  artists?: Artist[];
  curator?: Curator;
  posts?: Post[];
  series?: Series[];
}
