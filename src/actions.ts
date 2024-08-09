'use server';

import { redirect } from 'next/navigation';

// Usage:
// navigate(`/exhibitions`);
export async function navigate(url: string) {
  redirect(url);
}
