'use server';

import { redirect } from 'next/navigation';

// Usage:
// navigate(`/exhibitions`);
export function navigate(url: string) {
  redirect(url);
}
