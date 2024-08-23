export function convertToQueryParams(params: string[]): string {
  return params.join('=true&');
}
