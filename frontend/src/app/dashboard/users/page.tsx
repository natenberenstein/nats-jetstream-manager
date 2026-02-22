'use client';

import { useEffect, useState } from 'react';

import { authApi } from '@/lib/api';
import { InviteInfo, UserProfile } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<InviteInfo[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer');
  const [clusterName, setClusterName] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const load = async () => {
    setResult(null);
    try {
      const [u, i] = await Promise.all([authApi.listUsers(), authApi.listInvites()]);
      setUsers(u);
      setInvites(i);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to load users');
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      void load();
    }
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return <div className="text-sm text-muted-foreground">Admin role required to manage users.</div>;
  }

  const onInvite = async () => {
    setResult(null);
    try {
      const invite = await authApi.createInvite({
        email: inviteEmail,
        role: inviteRole,
        cluster_name: clusterName || undefined,
      });
      setResult(`Invite created for ${invite.email}. ${invite.invite_url || ''}`);
      setInviteEmail('');
      await load();
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to create invite');
    }
  };

  const onRoleChange = async (targetUser: UserProfile, role: 'admin' | 'viewer') => {
    try {
      await authApi.updateUserRole(targetUser.id, role);
      await load();
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Users & Invitations</h1>
        <p className="text-muted-foreground">Invite users by email and manage role assignments.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite User</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1 md:col-span-2">
            <Label>Email</Label>
            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'admin' | 'viewer')}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cluster (optional)</Label>
            <Input value={clusterName} onChange={(e) => setClusterName(e.target.value)} placeholder="prod-cluster" />
          </div>
          <div className="md:col-span-4">
            <Button onClick={onInvite} disabled={!inviteEmail.trim()}>Send Invite</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 border rounded p-3">
              <div>
                <p className="font-medium">{u.full_name || u.email}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
              <Select value={u.role} onChange={(e) => onRoleChange(u, e.target.value as 'admin' | 'viewer')}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {invites.map((invite) => (
            <div key={invite.id} className="border rounded p-3 text-sm space-y-1">
              <p className="font-medium">{invite.email} ({invite.role})</p>
              <p className="text-muted-foreground">status: {invite.status} | expires: {new Date(invite.expires_at).toLocaleString()}</p>
              {invite.invite_url && <p className="text-xs break-all">{invite.invite_url}</p>}
            </div>
          ))}
          {invites.length === 0 && <p className="text-sm text-muted-foreground">No invites yet.</p>}
        </CardContent>
      </Card>

      {result && <p className="text-sm text-muted-foreground">{result}</p>}
    </div>
  );
}
