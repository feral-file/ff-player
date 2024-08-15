const a2pSuffix = '<A2P>';
const tezosSuffix = '_tez';
const custodySuffix = '_custody';

export const removeArtistAliasSuffixes = (value: string): string => {
  return value
    .replace(new RegExp(`${a2pSuffix}$`), '')
    .replace(new RegExp(`${tezosSuffix}$`), '')
    .replace(new RegExp(`${custodySuffix}$`), '');
};
