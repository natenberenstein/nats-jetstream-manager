'use client';

import { useConnection } from '@/contexts/ConnectionContext';
import { useStreams } from '@/hooks/useStreams';
import { Layers, MessageSquare, HardDrive, Users } from 'lucide-react';
import { cn, formatBytes, formatNumber } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { connectionId } = useConnection();
  const { data: streamsData, isLoading } = useStreams(connectionId);

  const totalStreams = streamsData?.total || 0;
  const totalMessages = streamsData?.streams.reduce((sum, s) => sum + (s.state?.messages || 0), 0) || 0;
  const totalBytes = streamsData?.streams.reduce((sum, s) => sum + (s.state?.bytes || 0), 0) || 0;
  const totalConsumers = streamsData?.streams.reduce((sum, s) => sum + (s.state?.consumer_count || 0), 0) || 0;

  const stats = [
    {
      label: 'Streams',
      value: formatNumber(totalStreams),
      icon: Layers,
      iconClass: 'text-blue-600 dark:text-blue-400',
      badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    },
    {
      label: 'Messages',
      value: formatNumber(totalMessages),
      icon: MessageSquare,
      iconClass: 'text-green-600 dark:text-green-400',
      badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-300',
    },
    {
      label: 'Storage',
      value: formatBytes(totalBytes),
      icon: HardDrive,
      iconClass: 'text-violet-600 dark:text-violet-400',
      badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300',
    },
    {
      label: 'Consumers',
      value: formatNumber(totalConsumers),
      icon: Users,
      iconClass: 'text-orange-600 dark:text-orange-400',
      badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
          <h1 className="text-2xl font-bold mb-2">
            Dashboard Overview
          </h1>
          <p className="text-muted-foreground">
            Monitor your NATS JetStream cluster
          </p>
        </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="outline" className={cn("rounded-md px-2 py-1", stat.badgeClass)}>
                    {stat.label}
                  </Badge>
                  <Icon className={cn("w-6 h-6", stat.iconClass)} />
                </div>
                <p className="text-3xl font-bold">{isLoading ? '...' : stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Streams */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Recent Streams
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading streams...</p>
          ) : streamsData?.streams && streamsData.streams.length > 0 ? (
            <div className="space-y-4">
              {streamsData.streams.slice(0, 5).map((stream) => (
                <div
                  key={stream.config.name}
                  className="flex items-center justify-between p-4 bg-muted/40 rounded-lg"
                >
                  <div>
                    <h3 className="font-medium">
                      {stream.config.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {stream.config.subjects.join(', ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatNumber(stream.state.messages)} messages
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(stream.state.bytes)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No streams found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
