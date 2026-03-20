import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

type NativeSelectProps = React.ComponentProps<'select'>;

interface OptionItem {
  value: string;
  label: string;
  disabled?: boolean;
}

function extractOptions(children: React.ReactNode): OptionItem[] {
  const options: OptionItem[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.type !== 'option') return;
    const props = child.props as { value?: string; children?: React.ReactNode; disabled?: boolean };
    const value = String(props.value ?? '');
    const label =
      typeof props.children === 'string' ? props.children : String(props.children ?? value);
    options.push({ value, label, disabled: !!props.disabled });
  });

  return options;
}

const Select = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, children, value, defaultValue, onChange, disabled, name, id }, ref) => {
    const options = React.useMemo(() => extractOptions(children), [children]);
    const isControlled = value !== undefined;
    const [internalValue, setInternalValue] = React.useState<string>(
      String(defaultValue ?? options[0]?.value ?? ''),
    );
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      if (
        !isControlled &&
        options.length > 0 &&
        !options.some((opt) => opt.value === internalValue)
      ) {
        setInternalValue(options[0].value);
      }
    }, [isControlled, internalValue, options]);

    React.useEffect(() => {
      const onPointerDown = (event: MouseEvent) => {
        if (!containerRef.current?.contains(event.target as Node)) {
          setOpen(false);
        }
      };

      const onEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setOpen(false);
      };

      window.addEventListener('mousedown', onPointerDown);
      window.addEventListener('keydown', onEscape);
      return () => {
        window.removeEventListener('mousedown', onPointerDown);
        window.removeEventListener('keydown', onEscape);
      };
    }, []);

    const currentValue = String((isControlled ? value : internalValue) ?? '');
    const selected = options.find((opt) => opt.value === currentValue) ?? options[0];

    const emitChange = (nextValue: string) => {
      setOpen(false);
      if (!isControlled) setInternalValue(nextValue);
      const syntheticEvent = {
        target: { value: nextValue },
        currentTarget: { value: nextValue },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange?.(syntheticEvent);
    };

    return (
      <div ref={containerRef} className={cn('relative', className)}>
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg border border-border/80 bg-gradient-to-b from-background to-muted/30 px-3.5 text-left text-sm shadow-[inset_0_1px_0_hsl(var(--background)),0_1px_2px_hsl(var(--foreground)/0.05)] transition-all',
            'hover:border-primary/30',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:border-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="truncate text-foreground/95">{selected?.label ?? 'Select...'}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && !disabled && (
          <div
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <ul role="listbox" className="max-h-64 overflow-auto p-1">
              {options.map((opt) => {
                const isSelected = opt.value === currentValue;
                return (
                  <li key={`${opt.value}-${opt.label}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={opt.disabled}
                      onClick={() => emitChange(opt.value)}
                      className={cn(
                        'flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-accent',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                      )}
                    >
                      {opt.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <select
          ref={ref}
          value={currentValue}
          onChange={onChange}
          disabled={disabled}
          name={name}
          id={id}
          aria-hidden
          tabIndex={-1}
          className="sr-only"
        >
          {children}
        </select>
      </div>
    );
  },
);

Select.displayName = 'Select';

export { Select };
