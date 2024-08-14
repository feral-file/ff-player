interface CustomNotes {
  id: string;
  title: string;
  content: string;
  canReadMore: boolean;
}

interface jg043CustomPostCard {
  custom_notes?: CustomNotes[];
}

export interface Jg043CustomPosts {
  john_gerrard?: jg043CustomPostCard;
}
