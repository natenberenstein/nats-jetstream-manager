'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

interface PaginationProps {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  totalItems: number;
}

export function Pagination({
  pageIndex,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  totalItems,
}: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{totalItems} total items</span>
        <span className="mx-1">|</span>
        <span>Rows per page</span>
        <Select
          value={String(pageSize)}
          onChange={(e) => {
            onPageSizeChange(Number(e.target.value));
            onPageChange(0);
          }}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex - 1)}
          disabled={pageIndex <= 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(pageIndex + 1)}
          disabled={pageIndex >= pageCount - 1}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
