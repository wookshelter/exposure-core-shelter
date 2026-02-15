'use client';

import { ReactNode } from 'react';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen">
      {children}
    </main>
  );
}
