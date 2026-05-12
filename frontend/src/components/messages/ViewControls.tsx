'use client';

import { Save } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">View Controls</CardTitle>
          <Badge variant={savedViews.length > 0 ? 'secondary' : 'outline'} className="rounded-md">
            {savedViews.length > 0
              ? `${savedViews.length} saved view${savedViews.length === 1 ? '' : 's'}`
              : 'No saved views'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="space-y-1 lg:col-span-2">
          <Label>Saved Views</Label>
          <div className="flex gap-2">
            <Select
              onValueChange={(value) => value && onApplyView(value)}
              disabled={savedViews.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={savedViews.length > 0 ? 'Select a saved view' : 'No saved views'}
                />
              </SelectTrigger>
              <SelectContent>
                {savedViews.map((view) => (
                  <SelectItem key={view.name} value={view.name}>
                    {view.name}
                  </SelectItem>
                ))}
              </SelectContent>
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
              <Checkbox
                checked={liveMode}
                onCheckedChange={(checked) => onLiveModeChange(checked === true)}
              />
              Live tail
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoScroll}
                onCheckedChange={(checked) => onAutoScrollChange(checked === true)}
              />
              Auto-scroll
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={maskSensitive}
                onCheckedChange={(checked) => onMaskSensitiveChange(checked === true)}
              />
              Mask sensitive
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
