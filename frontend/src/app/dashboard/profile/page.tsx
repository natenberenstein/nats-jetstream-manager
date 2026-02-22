'use client';

import { useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      await updateProfile(fullName || null);
      setResult('Profile updated.');
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-2">Profile</h1>
        <p className="text-muted-foreground">Manage your account profile and role visibility</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">User Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Email</Label>
            <Input value={user?.email || ''} readOnly />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={user?.role || ''} readOnly />
          </div>
          <div>
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
          </div>
          <Button onClick={onSave} disabled={saving}>Save Profile</Button>
          {result && <p className="text-sm text-muted-foreground">{result}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
