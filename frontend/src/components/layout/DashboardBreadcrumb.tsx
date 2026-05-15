'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Overview',
  cluster: 'Cluster',
  observability: 'Observability',
  metrics: 'Metrics',
  health: 'Health',
  streams: 'Streams',
  subjects: 'Subjects',
  topology: 'Topology',
  consumers: 'Consumers',
  messages: 'Messages',
  tail: 'Live Tail',
  kv: 'KV Stores',
  objectstore: 'Object Store',
  operations: 'Timeline',
  'config-diff': 'Config Diff',
  audit: 'Audit Log',
};

function labelFor(segment: string) {
  return SEGMENT_LABELS[segment] ?? decodeURIComponent(segment);
}

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  // /dashboard root → just "Overview"
  if (segments.length === 1 && segments[0] === 'dashboard') {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Overview</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const href = '/' + segments.slice(0, index + 1).join('/');
          const isLast = index === segments.length - 1;
          // Skip the root "dashboard" crumb as a clickable; show it as the home icon entry
          if (index === 0 && segment === 'dashboard') {
            return (
              <React.Fragment key={href}>
                <BreadcrumbItem className="hidden md:inline-flex">
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard">Overview</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{labelFor(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={href}>{labelFor(segment)}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
