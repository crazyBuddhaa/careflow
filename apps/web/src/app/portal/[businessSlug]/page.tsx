import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';
import { SupportPortalLanding } from '@/components/SupportPortalLanding';

export const dynamic = 'force-dynamic';

interface BusinessPortalPageProps {
  params: Promise<{
    businessSlug: string;
  }>;
}

async function resolveAuthorizedPortal(businessSlugOrHost: string) {
  const [repo, session] = await Promise.all([
    getWorkspaceRepository(),
    resolveServerAdminSession(),
  ]);

  const accessOptions = {
    requirePublished: true,
    viewerUserId: session.identity?.userId,
    viewerOrganizationId: session.identity?.organizationId,
  };

  const bySlug = await repo.resolvePortalBySlug(businessSlugOrHost, accessOptions);
  if (bySlug) {
    return bySlug;
  }

  if (businessSlugOrHost.includes('.')) {
    return repo.resolvePortalByHostname(businessSlugOrHost, accessOptions);
  }

  return null;
}

export async function generateMetadata({
  params,
}: BusinessPortalPageProps): Promise<Metadata> {
  const { businessSlug } = await params;
  const portal = await resolveAuthorizedPortal(businessSlug);

  if (!portal) {
    return {
      title: 'Support Portal Not Found — CustomCare',
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
  const portal = await resolveAuthorizedPortal(businessSlug);

  if (!portal) {
    notFound();
  }

  return <SupportPortalLanding portalConfig={portal} />;
}

