export function convertToQueryParams(params: string[]): string {
  if (!params.length) {
    return '';
  }

  // handle param with spaces
  params = params.map(param => {
    if (param.includes(' ')) {
      return `${param.replaceAll(' ', '%20')}=true`;
    }

    return param && `${param}=true`;
  });
  return params.filter(Boolean).join('&');
}
