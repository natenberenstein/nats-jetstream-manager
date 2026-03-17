'use client';

import { Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { SavedView } from './types';

interface ViewControlsProps {
  savedViews: SavedView[];
  liveMode: boolean;
  autoScroll: boolean;
  maskSensitive: boolean;
  onLiveModeChange: (value: boolean) => void;
  onAutoScrollChange: (value: boolean) => void;
  onMaskSensitiveChange: (value: boolean) => void;
  onSaveView: () => void;
  onApplyView: (name: string) => void;
}

export function ViewControls({
  savedViews,
  liveMode,
  autoScroll,
  maskSensitive,
  onLiveModeChange,
  onAutoScrollChange,
  onMaskSensitiveChange,
  onSaveView,
  onApplyView,
}: ViewControlsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">View Controls</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="space-y-1 lg:col-span-2">
          <Label>Saved Views</Label>
          <div className="flex gap-2">
            <Select defaultValue="" onChange={(e) => e.target.value && onApplyView(e.target.value)}>
              <option value="">Select a saved view</option>
              {savedViews.map((view) => (
                <option key={view.name} value={view.name}>
                  {view.name}
                </option>
              ))}
            </Select>
            <Button variant="outline" onClick={onSaveView} aria-label="Save current view">
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1 lg:col-span-3">
          <Label>Quick Toggles</Label>
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={liveMode} onChange={(e) => onLiveModeChange(e.target.checked)} />
              Live tail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoScroll}
                onChange={(e) => onAutoScrollChange(e.target.checked)}
              />
              Auto-scroll
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={maskSensitive}
                onChange={(e) => onMaskSensitiveChange(e.target.checked)}
              />
              Mask sensitive
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
