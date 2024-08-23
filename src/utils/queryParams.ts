export function convertToQueryParams(params: string[]): string {
  params = params.map(param => `${param}=true`);
  return params.join('&');
}
