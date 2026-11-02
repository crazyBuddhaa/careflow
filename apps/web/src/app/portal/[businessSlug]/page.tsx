import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';
import { SupportPortalLanding } from '@/components/SupportPortalLanding';

export const dynamic = 'force-dynamic';

interface BusinessPortalPageProps {
  params: Promise<{
    businessSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: BusinessPortalPageProps): Promise<Metadata> {
  const { businessSlug } = await params;
  const repo = await getWorkspaceRepository();
  const portal = await repo.resolvePortalBySlug(businessSlug);

  if (!portal) {
    return {
      title: 'Support Portal Not Found — CareFlow',
    };
  }

  return {
    title: `${portal.branding.displayName} — Customer Support Portal`,
    description: portal.welcomeDescription,
    openGraph: {
      title: `${portal.branding.displayName} — Customer Support Portal`,
      description: portal.welcomeDescription,
      type: 'website',
    },
  };
}

export default async function BusinessPortalPage({ params }: BusinessPortalPageProps) {
  const { businessSlug } = await params;
  const repo = await getWorkspaceRepository();
  const portal = await repo.resolvePortalBySlug(businessSlug);

  if (!portal) {
    notFound();
  }

  return <SupportPortalLanding portalConfig={portal} />;
}
