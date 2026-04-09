import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ContentStatus } from '@castify/types';

interface StreamStatusBadgeProps {
  status: ContentStatus;
  className?: string;
}

const STATUS_CONFIG: Record<ContentStatus, { label: string; dotClass: string; variant: 'success' | 'secondary' | 'warning' | 'destructive' }> = {
  ACTIVE: { label: 'En vivo', dotClass: 'bg-green-400 animate-pulse', variant: 'success' },
  INACTIVE: { label: 'Inactivo', dotClass: 'bg-zinc-500', variant: 'secondary' },
  PROCESSING: { label: 'Procesando', dotClass: 'bg-yellow-400 animate-pulse', variant: 'warning' },
  ERROR: { label: 'Error', dotClass: 'bg-red-400', variant: 'destructive' },
};

export function StreamStatusBadge({ status, className }: StreamStatusBadgeProps): React.JSX.Element {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className={cn('gap-1.5', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
      {config.label}
    </Badge>
  );
}
