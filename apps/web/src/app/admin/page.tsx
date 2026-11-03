import React from 'react';
import type { Metadata } from 'next';
import { BusinessAdminShell } from '@/components/BusinessAdminShell';

export const metadata: Metadata = {
  title: 'Workspace — CustomCare',
  description:
    'Manage your CustomCare support portal, knowledge base, assistant settings, and customer conversations.',
};

export default function AdminWorkspacePage() {
  return <BusinessAdminShell />;
}
