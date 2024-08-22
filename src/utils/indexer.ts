import { IndexerToken } from '@/models';

enum IndexerSource {
  feral_file = 'feralfile',
}

export const getIndexerTokenName = (token: IndexerToken): string => {
  try {
    const getTitle = (token: IndexerToken): string => {
      return token.asset.metadata.project.latest.title.trim() || '';
    };

    const getMintedYear = (token: IndexerToken): string => {
      const mintedAt = token.mintedAt || token.mintAt;
      if (mintedAt) {
        const date = new Date(mintedAt);
        return ` (${date.getFullYear().toString()})`;
      }
      return '';
    };

    const getEditionName = (token: IndexerToken): string => {
      if (token.source === (IndexerSource.feral_file as string)) {
        return ` ${token.editionName}`;
      }
      return '';
    };

    const title = getTitle(token);
    const mintedYear = getMintedYear(token);
    const editionName = getEditionName(token);
    return `${title}${mintedYear}${editionName}`;
  } catch (error) {
    console.log(error);
    return '';
  }
};
