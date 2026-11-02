import React from 'react';
import type { Metadata } from 'next';
import { BusinessAdminShell } from '@/components/BusinessAdminShell';

export const metadata: Metadata = {
  title: 'Business Administration — CareFlow',
  description:
    'Isolated CareFlow administration workspace for managing business profiles, branding, knowledge bases, chatbots, and conversations.',
};

export default function AdminWorkspacePage() {
  return <BusinessAdminShell />;
}
