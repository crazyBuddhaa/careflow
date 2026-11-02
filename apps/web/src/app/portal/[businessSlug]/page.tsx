import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { businessPortalRegistry } from '@/config/business-portals';
import { SupportPortalLanding } from '@/components/SupportPortalLanding';

interface BusinessPortalPageProps {
  params: Promise<{
    businessSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: BusinessPortalPageProps): Promise<Metadata> {
  const { businessSlug } = await params;
  const portal = await businessPortalRegistry.resolveBySlug(businessSlug);

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
  const portal = await businessPortalRegistry.resolveBySlug(businessSlug);

  if (!portal) {
    notFound();
  }

  return <SupportPortalLanding portalConfig={portal} />;
}
